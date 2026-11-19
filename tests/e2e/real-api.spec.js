import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const databaseName = process.env.AQUATICA_TEST_DB_NAME;
if (!databaseName || !/^aquanova_test_[a-z0-9_]+$/.test(databaseName)
  || process.env.DB_NAME !== databaseName) {
  throw new Error('Real API browser tests require matching isolated AQUATICA_TEST_DB_NAME and DB_NAME values.');
}

const fixtureScript = resolve('tests/e2e/real_data_fixture.php');
const apiOrigin = new URL(process.env.AQUATICA_E2E_URL || 'http://127.0.0.1:5174/webapp/').origin;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
  'base64',
);

function runFixture(action, fixture = null, ...args) {
  const env = {
    ...process.env,
    APP_ENV: 'local',
    DB_NAME: databaseName,
    AQUATICA_TEST_DB_NAME: databaseName,
  };
  const commandArgs = [fixtureScript, action];
  if (fixture) commandArgs.push(JSON.stringify(fixture));
  commandArgs.push(...args.map(String));
  const output = execFileSync('php', ['-d', 'display_errors=0', ...commandArgs], { encoding: 'utf8', env });
  return JSON.parse(output);
}

let fixture;
test.beforeEach(() => {
  fixture = runFixture('setup');
});
test.afterEach(() => {
  if (fixture) {
    runFixture('cleanup', fixture);
    fixture = undefined;
  }
});

async function signIn(page, user) {
  const request = page.context().request;
  const csrfResponse = await request.get(`${apiOrigin}/api/auth/csrf.php`);
  expect(csrfResponse.status()).toBe(200);
  const csrf = await csrfResponse.json();
  expect(csrf.csrfToken).toBeTruthy();

  const loginResponse = await request.post(`${apiOrigin}/api/auth/login.php`, {
    data: { email: user.email, password: user.password },
    headers: { 'X-CSRF-Token': csrf.csrfToken },
  });
  expect(loginResponse.status()).toBe(200);
  const sessionResponse = await request.get(`${apiOrigin}/api/auth/session.php`);
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();
  expect(session.user.role).toBe(user.role);

  await page.goto('/');
  await expect(page.locator('.sidebar .nav-link-active')).toBeVisible();
}

async function navigate(page, label, width = 1440) {
  if (width <= 900) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.locator('.sidebar .nav-link').filter({ hasText: new RegExp(`^${label}`) }).click();
}

async function api(page, path, method = 'GET', data = undefined) {
  return page.evaluate(async ({ path, method, data }) => {
    const headers = data === undefined ? {} : { 'Content-Type': 'application/json' };
    if (method !== 'GET') {
      const csrfResponse = await fetch('/api/auth/csrf.php');
      const csrf = await csrfResponse.json();
      headers['X-CSRF-Token'] = csrf.csrfToken;
      headers['Idempotency-Key'] = crypto.randomUUID();
    }
    const response = await fetch(path, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }, { path, method, data });
}

async function placeOrder(page, product, { fulfillment = 'Delivery', payment = 'GCash' } = {}) {
  await navigate(page, 'Shop');
  await page.getByRole('button', { name: `Add ${product.name} to cart` }).click();
  await navigate(page, 'Cart');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();

  if (fulfillment === 'Pickup') {
    await page.getByRole('button', { name: /Pick up at shop/ }).click();
  } else {
    await page.getByRole('button', { name: /^Delivery/ }).click();
    await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
  }
  const option = payment === 'GCash' ? 'GCash'
    : payment === 'COD' ? 'Cash on delivery' : 'Cash at the shop';
  await page.getByRole('button', { name: option }).click();
  await page.getByRole('button', { name: 'Place order' }).click();
  if (payment === 'GCash') {
    await expect(page.getByRole('heading', { name: 'Pay with GCash' })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
  }
  const orders = await api(page, '/api/v1/orders');
  expect(orders.status).toBe(200);
  return orders.body.orders[0];
}

async function submitProof(page, order, reference) {
  await page.getByLabel('GCash reference number').fill(reference);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'gcash-proof.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByRole('button', { name: 'Upload payment proof' }).click();
}

async function selectOrder(page, order) {
  await page.locator('.order-inbox-item').filter({ hasText: order.id }).click();
}

function inspect() {
  return runFixture('inspect', fixture);
}

function orderRecord(snapshot, databaseId) {
  return snapshot.orders.find((order) => Number(order.id) === Number(databaseId));
}

function assertStockInvariant(snapshot, key) {
  const product = fixture.products[key];
  const current = snapshot.stocks[key];
  expect(current.stock).toBe(product.initialStock + current.movementSum);
  expect(current.stock).toBeGreaterThanOrEqual(0);
}

async function saveScreenshot(page, name) {
  const file = resolve('test-results/playwright/screenshots', name);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
}

test('real PHP API browser flows persist orders, stock, reports, and notifications', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const ownerContext = await browser.newContext();
  const customerTwoContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const customerTwoPage = await customerTwoContext.newPage();
  try {
    await signIn(page, fixture.users.customer);
    await signIn(ownerPage, fixture.users.owner);

    const beforeReport = await api(ownerPage, `/api/v1/owner/reports?period=month&date=${fixture.reportDate}`);
    expect(beforeReport.status).toBe(200);
    const startStock = inspect();

    const main = fixture.products.main;
    expect(startStock.stocks.main.stock).toBe(main.initialStock);
    await navigate(page, 'Shop');
    await page.getByRole('button', { name: `Add ${main.name} to cart` }).click();
    await page.reload();
    await navigate(page, 'Cart');
    await expect(page.getByText(main.name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
    await page.getByRole('button', { name: 'GCash' }).click();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Pay with GCash' })).toBeVisible();
    const first = (await api(page, '/api/v1/orders')).body.orders[0];
    await submitProof(page, first, `E2E${fixture.tag}A1`);
    await expect(page.getByRole('heading', { name: 'Payment received for review' })).toBeVisible();

    await page.waitForTimeout(1100);
    const second = await placeOrder(page, main, { payment: 'GCash' });
    await submitProof(page, second, `E2E${fixture.tag}B1`);
    await expect(page.getByRole('heading', { name: 'Payment received for review' })).toBeVisible();

    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, first);
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(first.id);
    await ownerPage.getByRole('button', { name: 'Check proof' }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await ownerPage.getByLabel('Reason for rejection').fill('Reference is not readable.');
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Reject payment proof' }).click();

    await page.reload();
    await navigate(page, 'My orders');
    await expect(page.getByText('Payment update needed: Reference is not readable.')).toBeVisible();
    await page.getByRole('button', { name: 'Upload proof' }).first().click();
    await expect(page.getByText('Reference is not readable.')).toBeVisible();
    await submitProof(page, first, `E2E${fixture.tag}A1`);
    await expect(page.locator('.inline-error')).toContainText('already been used');
    await submitProof(page, first, `E2E${fixture.tag}A2`);
    await expect(page.getByRole('heading', { name: 'Payment received for review' })).toBeVisible();

    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, first);
    await ownerPage.getByRole('button', { name: 'Check proof' }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(second.id);
    let snapshot = inspect();
    expect(orderRecord(snapshot, first.databaseId)).toMatchObject({ order_status: 'preparing', payment_status: 'paid', stock_deducted: 1 });
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === Number(first.databaseId) && movement.type === 'sale')).toHaveLength(1);
    assertStockInvariant(snapshot, 'main');

    await ownerPage.getByRole('button', { name: 'Check proof' }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    snapshot = inspect();
    expect(orderRecord(snapshot, second.databaseId)).toMatchObject({ order_status: 'preparing', payment_status: 'paid', stock_deducted: 1 });
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === Number(second.databaseId) && movement.type === 'sale')).toHaveLength(1);
    assertStockInvariant(snapshot, 'main');

    for (const order of [first, second]) {
      await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
      await selectOrder(ownerPage, order);
      await ownerPage.getByRole('button', { name: 'Mark as ready' }).click();
      await ownerPage.getByRole('tab', { name: /Ready/ }).click();
      await selectOrder(ownerPage, order);
      await ownerPage.getByRole('button', { name: 'Complete order' }).click();
      snapshot = inspect();
      expect(orderRecord(snapshot, order.databaseId)).toMatchObject({ order_status: 'completed', payment_status: 'paid' });
      assertStockInvariant(snapshot, 'main');
    }

    const cod = await placeOrder(page, main, { payment: 'COD' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, cod);
    await ownerPage.getByRole('button', { name: 'Confirm order' }).click();
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, cod);
    await ownerPage.getByRole('button', { name: 'Mark as ready' }).click();
    await ownerPage.getByRole('tab', { name: /Ready/ }).click();
    await selectOrder(ownerPage, cod);
    await ownerPage.getByRole('button', { name: 'Delivered and paid' }).click();
    snapshot = inspect();
    expect(orderRecord(snapshot, cod.databaseId)).toMatchObject({ order_status: 'completed', payment_status: 'paid' });
    assertStockInvariant(snapshot, 'main');

    const pickup = await placeOrder(page, main, { payment: 'cash', fulfillment: 'Pickup' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, pickup);
    await ownerPage.getByRole('button', { name: 'Confirm order' }).click();
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, pickup);
    await ownerPage.getByRole('button', { name: 'Mark as ready' }).click();
    await ownerPage.getByRole('tab', { name: /Ready/ }).click();
    await selectOrder(ownerPage, pickup);
    await ownerPage.getByRole('button', { name: 'Handed over and paid' }).click();
    snapshot = inspect();
    expect(orderRecord(snapshot, pickup.databaseId)).toMatchObject({ order_status: 'completed', payment_status: 'paid' });
    assertStockInvariant(snapshot, 'main');

    const short = fixture.products.short;
    await navigate(page, 'Shop');
    await page.getByRole('button', { name: `Add ${short.name} to cart` }).click();
    runFixture('adjust-stock', fixture, short.id, -1);
    await navigate(page, 'Cart');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.getByRole('button', { name: /^Delivery/ }).click();
    await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
    await page.getByRole('button', { name: 'Cash on delivery' }).click();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.locator('.toast')).toContainText(/stock/i);
    snapshot = inspect();
    expect(snapshot.orders).toHaveLength(4);
    assertStockInvariant(snapshot, 'short');
    const remainingCart = await api(page, '/api/v1/cart');
    expect(remainingCart.status).toBe(200);
    for (const item of remainingCart.body.items) {
      const removeItem = await api(page, `/api/v1/cart/items/${item.productId}`, 'PATCH', { quantity: 0 });
      expect(removeItem.status).toBe(200);
    }
    await page.reload();

    const customerCancelled = await placeOrder(page, main, { payment: 'COD' });
    await navigate(page, 'My orders');
    await page.getByRole('button', { name: 'View order' }).first().click();
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click();
    snapshot = inspect();
    expect(orderRecord(snapshot, customerCancelled.databaseId)).toMatchObject({ order_status: 'cancelled', stock_deducted: 0 });
    assertStockInvariant(snapshot, 'main');

    const ownerCancelled = await placeOrder(page, main, { payment: 'COD' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, ownerCancelled);
    await ownerPage.getByRole('button', { name: 'Confirm order' }).click();
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, ownerCancelled);
    await ownerPage.getByRole('button', { name: 'Cancel order' }).click();
    await ownerPage.getByLabel('Cancellation reason').fill('Test owner cancellation.');
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click();
    snapshot = inspect();
    expect(orderRecord(snapshot, ownerCancelled.databaseId)).toMatchObject({ order_status: 'cancelled', stock_deducted: 0 });
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === Number(ownerCancelled.databaseId)).map((movement) => movement.type))
      .toEqual(['sale', 'cancellation']);
    assertStockInvariant(snapshot, 'main');

    await signIn(customerTwoPage, fixture.users.secondCustomer);
    const ownerResponse = await api(customerTwoPage, '/api/v1/owner/orders');
    expect(ownerResponse.status).toBe(403);
    const otherOrder = await api(customerTwoPage, `/api/v1/orders/${first.databaseId}`);
    expect(otherOrder.status).toBe(404);
    await navigate(customerTwoPage, 'Shop');
    const xssName = fixture.products.xss.name;
    await expect(customerTwoPage.getByText(xssName, { exact: true })).toBeVisible();
    await expect(customerTwoPage.locator('img[onerror]')).toHaveCount(0);

    snapshot = inspect();
    const customerEvents = snapshot.notifications.filter((item) => Number(item.user_id) === fixture.users.customer.id);
    const firstCustomerEvents = customerEvents.filter((item) => Number(item.order_id) === first.databaseId);
    expect(firstCustomerEvents.filter((item) => item.title === 'Order placed')).toHaveLength(1);
    expect(firstCustomerEvents.filter((item) => item.title === 'Payment proof received')).toHaveLength(2);
    expect(firstCustomerEvents.filter((item) => item.title === 'Payment proof needs an update')).toHaveLength(1);
    expect(firstCustomerEvents.filter((item) => item.title === 'Payment approved')).toHaveLength(1);
    expect(firstCustomerEvents.filter((item) => item.title === 'Order ready')).toHaveLength(1);
    expect(firstCustomerEvents.filter((item) => item.title === 'Order completed')).toHaveLength(1);

    const eventCount = (userId, orderId, title) => snapshot.notifications.filter((item) =>
      Number(item.user_id) === userId && Number(item.order_id) === orderId && item.title === title).length;
    const customerOrders = [first, second, cod, pickup, customerCancelled, ownerCancelled];
    for (const order of customerOrders) {
      expect(eventCount(fixture.users.customer.id, order.databaseId, 'Order placed')).toBe(1);
    }
    for (const order of [cod, pickup, ownerCancelled]) {
      expect(eventCount(fixture.users.customer.id, order.databaseId, 'Order confirmed')).toBe(1);
    }
    expect(eventCount(fixture.users.customer.id, second.databaseId, 'Order confirmed')).toBe(0);
    for (const order of [first, second, cod, pickup]) {
      expect(eventCount(fixture.users.customer.id, order.databaseId, 'Order ready')).toBe(1);
      expect(eventCount(fixture.users.customer.id, order.databaseId, 'Order completed')).toBe(1);
    }
    const notificationBody = (order, title) => customerEvents.find((item) =>
      Number(item.order_id) === order.databaseId && item.title === title)?.body;
    expect(notificationBody(cod, 'Order ready')).toBe('Your order is out for delivery.');
    expect(notificationBody(pickup, 'Order ready')).toBe('Your order is ready for pickup.');
    expect(notificationBody(cod, 'Order completed')).toBe('Your order was delivered and paid.');
    expect(notificationBody(pickup, 'Order completed')).toBe('Your order was handed over and paid at the shop.');
    const completedOrders = await api(page, '/api/v1/orders');
    expect(completedOrders.body.orders.find((order) => order.databaseId === pickup.databaseId))
      .toMatchObject({ statusLabel: 'Handed over and paid', address: null });
    expect(completedOrders.body.orders.find((order) => order.databaseId === cod.databaseId))
      .toMatchObject({ statusLabel: 'Delivered and paid' });
    for (const order of [customerCancelled, ownerCancelled]) {
      expect(eventCount(fixture.users.customer.id, order.databaseId, 'Order cancelled')).toBe(1);
    }
    expect(eventCount(fixture.users.owner.id, first.databaseId, 'New order')).toBe(1);
    expect(eventCount(fixture.users.owner.id, first.databaseId, 'GCash proof submitted')).toBe(2);
    expect(snapshot.proofs.filter((proof) => Number(proof.order_id) === first.databaseId)).toHaveLength(2);
    expect(snapshot.proofs.find((proof) => Number(proof.order_id) === first.databaseId)?.reject_reason)
      .toBe('Reference is not readable.');

    await page.reload();
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.locator('.notification-row').filter({ hasText: 'Order placed' })).toHaveCount(6);
    await expect(page.locator('.notification-row').filter({ hasText: 'Payment proof needs an update' })).toHaveCount(1);
    await expect(page.locator('.notification-row').filter({ hasText: 'Payment proof received' })).toHaveCount(3);
    await expect(page.locator('.notification-row').filter({ hasText: 'Payment approved' })).toHaveCount(2);
    await expect(page.locator('.notification-row').filter({ hasText: 'Order confirmed' })).toHaveCount(3);
    await expect(page.locator('.notification-row').filter({ hasText: 'Order ready' })).toHaveCount(4);
    await expect(page.locator('.notification-row').filter({ hasText: 'Order completed' })).toHaveCount(4);
    await expect(page.locator('.notification-row').filter({ hasText: 'Order cancelled' })).toHaveCount(2);

    await navigate(ownerPage, 'Reports');
    const afterReport = await api(ownerPage, `/api/v1/owner/reports?period=month&date=${fixture.reportDate}`);
    expect(afterReport.status).toBe(200);
    const startKpis = beforeReport.body.kpis;
    const endKpis = afterReport.body.kpis;
    expect(endKpis.orders.placed - startKpis.orders.placed).toBe(6);
    expect(endKpis.orders.cancelled - startKpis.orders.cancelled).toBe(2);
    expect(endKpis.paidOrders.count - startKpis.paidOrders.count).toBe(4);
    expect(Number(endKpis.revenue.current) - Number(startKpis.revenue.current)).toBeCloseTo(200, 2);
    await expect(ownerPage.getByRole('heading', { name: 'Reports' })).toBeVisible();
    const formattedRevenue = `₱${Number(endKpis.revenue.current).toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
    await expect(ownerPage.locator('.reports-stat').filter({ hasText: 'Revenue' }))
      .toContainText(formattedRevenue);
    await expect(ownerPage.locator('body')).not.toContainText(/NaN|undefined|Infinity/);
    await saveScreenshot(ownerPage, 'real-api-owner-reports.png');

    snapshot = inspect();
    expect(snapshot.orders).toHaveLength(6);
    expect(snapshot.orders.filter((order) => order.order_status === 'completed')).toHaveLength(4);
    expect(snapshot.orders.filter((order) => order.order_status === 'cancelled')).toHaveLength(2);
    assertStockInvariant(snapshot, 'main');
    assertStockInvariant(snapshot, 'short');
    assertStockInvariant(snapshot, 'xss');
  } finally {
    await customerTwoContext.close();
    await ownerContext.close();
  }
});
