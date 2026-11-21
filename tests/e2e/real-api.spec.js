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

test('customer Account changes password accessibly without ending the current session', async ({ page }) => {
  await signIn(page, fixture.users.customer);
  await navigate(page, 'My account');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();

  const fields = [
    ['Current password', 'currentPassword'],
    ['New password', 'password'],
    ['Confirm new password', 'confirmPassword'],
  ];
  for (const [label, name] of fields) {
    const field = page.locator(`input[name="${name}"]`);
    await expect(field).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: `Show ${label.toLowerCase()}` }).click();
    await expect(field).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: `Hide ${label.toLowerCase()}` })).toHaveAttribute('aria-pressed', 'true');
  }

  const currentPassword = page.locator('input[name="currentPassword"]');
  const newPassword = page.locator('input[name="password"]');
  const confirmPassword = page.locator('input[name="confirmPassword"]');
  const savePassword = page.getByRole('button', { name: 'Save new password' });
  const nextPassword = `AquaNova-${fixture.tag}-changed`;

  await expect(page.getByRole('list', { name: 'Password requirements' })).toContainText('8 to 1,024 characters');
  await currentPassword.fill('incorrect-current-password');
  await newPassword.fill(nextPassword);
  await confirmPassword.fill(nextPassword);
  await savePassword.click();
  await expect(page.getByRole('alert')).toContainText('current password is incorrect');
  await expect(currentPassword).toBeFocused();

  await currentPassword.fill(fixture.users.customer.password);
  await newPassword.fill(fixture.users.customer.password);
  await confirmPassword.fill(fixture.users.customer.password);
  await savePassword.click();
  await expect(page.getByRole('alert')).toContainText('different from your current password');
  await expect(newPassword).toBeFocused();

  await newPassword.fill('short');
  await confirmPassword.fill('short');
  await savePassword.click();
  await expect(page.getByRole('alert')).toContainText('8 to 1,024 characters');
  await expect(newPassword).toBeFocused();

  await newPassword.fill(nextPassword);
  await confirmPassword.fill(nextPassword);
  await savePassword.click();
  await expect(page.locator('.account-password-success')).toContainText('Other sessions have been signed out');
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session.php');
    return response.json();
  });
  expect(session.user.role).toBe('customer');
});

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

async function expectAAContrast(locator) {
  const contrastRatio = await locator.evaluate((element) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color) => {
      const [red, green, blue] = color.match(/\d+/g).map(Number);
      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
}

async function expectLoadedImage(locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
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
    const rejectProofResponse = ownerPage.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/v1/owner/orders/${first.databaseId}/actions`);
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Reject payment proof' }).click();
    expect((await rejectProofResponse).status()).toBe(200);
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(second.id);
    await expect(ownerPage.getByRole('button', { name: 'Check proof' })).toBeVisible();

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
    const firstApprovalResponse = ownerPage.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/v1/owner/orders/${first.databaseId}/actions`);
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    expect((await firstApprovalResponse).status()).toBe(200);
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(first.id);
    await expect(ownerPage.getByRole('button', { name: 'Mark as ready' })).toBeVisible();
    let snapshot = inspect();
    expect(orderRecord(snapshot, first.databaseId)).toMatchObject({ order_status: 'preparing', payment_status: 'paid', stock_deducted: 1 });
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === Number(first.databaseId) && movement.type === 'sale')).toHaveLength(1);
    assertStockInvariant(snapshot, 'main');

    await ownerPage.getByRole('tab', { name: /Needs action/ }).click();
    await selectOrder(ownerPage, second);
    await ownerPage.getByRole('button', { name: 'Check proof' }).click();
    const secondApprovalResponse = ownerPage.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/v1/owner/orders/${second.databaseId}/actions`);
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    expect((await secondApprovalResponse).status()).toBe(200);
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(second.id);
    await expect(ownerPage.getByRole('button', { name: 'Mark as ready' })).toBeVisible();
    snapshot = inspect();
    expect(orderRecord(snapshot, second.databaseId)).toMatchObject({ order_status: 'preparing', payment_status: 'paid', stock_deducted: 1 });
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === Number(second.databaseId) && movement.type === 'sale')).toHaveLength(1);
    assertStockInvariant(snapshot, 'main');

    for (const order of [first, second]) {
      await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
      await selectOrder(ownerPage, order);
      await ownerPage.getByRole('button', { name: 'Mark as ready' }).click();
      await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(order.id);
      await expect(ownerPage.getByRole('button', { name: 'Complete order' })).toBeVisible();
      await ownerPage.getByRole('tab', { name: /Ready/ }).click();
      await selectOrder(ownerPage, order);
      await ownerPage.getByRole('button', { name: 'Complete order' }).click();
      snapshot = inspect();
      expect(orderRecord(snapshot, order.databaseId)).toMatchObject({ order_status: 'completed', payment_status: 'paid' });
      assertStockInvariant(snapshot, 'main');
      if (order === first) {
        await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(second.id);
        await expect(ownerPage.getByRole('button', { name: 'Mark as ready' })).toBeVisible();
      }
    }
    await expect(ownerPage.locator('.order-inbox-placeholder')).toContainText('All caught up');

    const cod = await placeOrder(page, main, { payment: 'COD' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, cod);
    await ownerPage.getByRole('button', { name: 'Confirm order' }).click();
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(cod.id);
    await expect(ownerPage.getByRole('button', { name: 'Mark as ready' })).toBeVisible();
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, cod);
    await ownerPage.getByRole('button', { name: 'Mark as ready' }).click();
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(cod.id);
    await expect(ownerPage.getByRole('button', { name: 'Delivered and paid' })).toBeVisible();
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
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(pickup.id);
    await expect(ownerPage.getByRole('button', { name: 'Mark as ready' })).toBeVisible();
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, pickup);
    await ownerPage.getByRole('button', { name: 'Mark as ready' }).click();
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(pickup.id);
    await expect(ownerPage.getByRole('button', { name: 'Handed over and paid' })).toBeVisible();
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
    await expect(ownerPage.locator('.order-inbox-placeholder')).toContainText('All caught up');
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
    const notificationGroups = page.locator('.notification-group-toggle');
    for (let index = 0; index < await notificationGroups.count(); index++) {
      await notificationGroups.nth(index).click();
    }
    await expect(notificationGroups.filter({ hasText: 'Other' })).toBeVisible();
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

test('sold-out status, ordering, images, and stale-cart behavior cover customer and owner surfaces', async ({ page, browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  try {
    const soldOut = fixture.products.soldout;
    await signIn(page, fixture.users.customer);
    const catalogUrl = `/api/v1/catalog/products?q=${encodeURIComponent(fixture.tag)}`
      + `&category=${encodeURIComponent(soldOut.category)}&page=1&pageSize=2`;
    const catalogFirst = await api(page, catalogUrl);
    const catalogSecond = await api(page, catalogUrl.replace('page=1', 'page=2'));
    const catalogProducts = [...catalogFirst.body.products, ...catalogSecond.body.products];
    expect(catalogFirst.body.pagination).toMatchObject({ total: 4, pages: 2 });
    expect(catalogFirst.body.products.every((product) => product.stock > 0)).toBe(true);
    expect(catalogProducts.at(-1)).toMatchObject({ id: soldOut.slug, stock: 0 });

    await navigate(page, 'Shop');
    await page.getByPlaceholder('Search products...').fill(fixture.tag);
    await page.getByRole('button', { name: soldOut.category, exact: true }).click();
    const soldOutCard = page.locator('.product-card').filter({ hasText: soldOut.name });
    const soldOutBadge = soldOutCard.locator('.sold-out-pill');
    await expect(soldOutBadge).toHaveText('! Sold out');
    await expectLoadedImage(soldOutCard.locator('img'));
    await expectAAContrast(soldOutBadge);

    await page.getByRole('button', { name: soldOut.name, exact: true }).click();
    const detailSoldOut = page.locator('.detail-stock');
    await expect(detailSoldOut).toHaveText('! Sold out');
    await expectAAContrast(detailSoldOut);
    await expectLoadedImage(page.locator('.product-detail-visual img'));
    await expect(page.locator('.product-detail-info').getByRole('button', { name: /Add to cart/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to shop' }).click();
    const rejectedAdd = await api(page, '/api/v1/cart/items', 'POST', {
      productId: soldOut.slug,
      quantity: 1,
    });
    expect(rejectedAdd.status).toBe(409);

    runFixture('seed-soldout-cart', fixture);
    await page.reload();
    await navigate(page, 'Cart');
    const staleCartLine = page.locator('.cart-line').filter({ hasText: soldOut.name });
    const cartSoldOut = staleCartLine.locator('.status-sold-out');
    await expect(cartSoldOut).toHaveText('! Sold out');
    await expectAAContrast(cartSoldOut);
    await expectLoadedImage(staleCartLine.locator('img'));
    await expect(staleCartLine.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();

    await signIn(ownerPage, fixture.users.owner);
    const ownerProductsPath = `/api/v1/owner/products?q=${encodeURIComponent(fixture.tag)}`
      + `&category=${encodeURIComponent(soldOut.category)}&page=1&pageSize=2`;
    const ownerProductFirst = await api(ownerPage, ownerProductsPath);
    const ownerProductSecond = await api(ownerPage, ownerProductsPath.replace('page=1', 'page=2'));
    expect(ownerProductFirst.body.pagination).toMatchObject({ total: 4, pages: 2 });
    expect(ownerProductFirst.body.products.find((product) => product.id === fixture.products.main.slug).image).toBeTruthy();
    expect(ownerProductSecond.body.products.find((product) => product.id === soldOut.slug).image).toBeTruthy();

    const inventoryProducts = [];
    let inventoryPage = 1;
    let inventoryPageCount = 1;
    while (inventoryPage <= inventoryPageCount) {
      const inventory = await api(ownerPage,
        `/api/v1/owner/inventory?productsPage=${inventoryPage}&productsPageSize=100&movementsPage=1&movementsPageSize=1`);
      expect(inventory.status).toBe(200);
      inventoryPageCount = inventory.body.productsPagination.pages;
      inventoryProducts.push(...inventory.body.products);
      inventoryPage++;
    }
    expect(inventoryProducts.find((product) => product.id === soldOut.slug).image).toBeTruthy();
    expect(inventoryProducts.find((product) => product.id === fixture.products.main.slug).image).toBeTruthy();
    for (let index = 1; index < inventoryProducts.length; index++) {
      expect(inventoryProducts[index - 1].stock).toBeLessThanOrEqual(inventoryProducts[index].stock);
    }

    await navigate(ownerPage, 'Products');
    await ownerPage.getByPlaceholder('Find a product...').fill(fixture.tag);
    await ownerPage.getByRole('button', { name: soldOut.category, exact: true }).click();
    const ownerSoldOutCard = ownerPage.locator('.owner-product-card').filter({ hasText: soldOut.name });
    const ownerProductsSoldOut = ownerSoldOutCard.locator('.status-sold-out');
    await expect(ownerProductsSoldOut).toHaveText('! Sold out');
    await expect(ownerSoldOutCard).toContainText('0 in stock');
    await expectAAContrast(ownerProductsSoldOut);
    await expectLoadedImage(ownerSoldOutCard.locator('img'));

    await navigate(ownerPage, 'Inventory');
    await ownerPage.getByPlaceholder('Search inventory...').fill(fixture.tag);
    const inventoryRow = ownerPage.locator('.inventory-product').filter({ hasText: soldOut.name }).locator('xpath=ancestor::tr');
    const inventorySoldOut = inventoryRow.locator('.status-sold-out');
    await expect(inventorySoldOut).toHaveText('! Sold out');
    await expect(inventoryRow.locator('.stock-number')).toHaveText('0');
    await expectAAContrast(inventorySoldOut);
    await expectLoadedImage(inventoryRow.locator('img'));

    await navigate(ownerPage, 'Dashboard');
    const dashboardRow = ownerPage.locator('.stock-health-row').filter({ hasText: soldOut.name });
    await expect(dashboardRow).toContainText('! Sold out');
    await expect(dashboardRow.locator('.stock-right strong')).toHaveText('0');
    await expectAAContrast(dashboardRow.locator('.status-sold-out'));
    await expectLoadedImage(dashboardRow.locator('img'));
    assertStockInvariant(inspect(), 'soldout');
  } finally {
    await ownerContext.close();
  }
});

test('large stock movements require confirmation and appear in filtered archive and product history', async ({ page }) => {
  const main = fixture.products.main;
  await signIn(page, fixture.users.owner);
  await navigate(page, 'Settings');
  await expect(page.getByLabel('Large stock-change threshold (units)')).toHaveValue('20');
  await page.getByLabel('Large stock-change threshold (units)').fill('3');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('.toast')).toContainText('Settings saved');

  await navigate(page, 'Inventory');
  const mainRow = page.locator('.inventory-product').filter({ hasText: main.name }).locator('xpath=ancestor::tr');
  await mainRow.getByRole('button', { name: 'Update' }).click();
  await page.getByLabel('Movement').selectOption({ label: 'Adjustment' });
  await page.getByLabel('Units to remove').fill('4');
  await page.getByLabel('Reason', { exact: true }).fill('Other');
  await expect(page.getByLabel('Note (required)')).toBeVisible();
  await page.getByLabel('Note (required)').fill('E2E large stock change');
  await expect(page.getByText('! Large change — confirm this stock change.')).toBeVisible();
  await page.locator('.modal-form input[type="checkbox"]').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Adjust stock' }).click();
  await expect(page.locator('.toast')).toContainText(`${main.name} stock updated`);

  const snapshot = inspect();
  assertStockInvariant(snapshot, 'main');
  const archiveResponse = await api(page,
    `/api/v1/owner/inventory/archives?productId=${encodeURIComponent(main.slug)}&type=adjustment&reason=Other&largeOnly=1`);
  expect(archiveResponse.status).toBe(200);
  const archived = archiveResponse.body.archives[0];
  expect(archived).toMatchObject({
    productId: main.slug,
    type: 'adjustment',
    change: -4,
    stockBefore: 20,
    stockAfter: 16,
    reason: 'Other',
    large: true,
  });

  await page.reload();
  await navigate(page, 'Inventory');
  const refreshedMainRow = page.locator('.inventory-product').filter({ hasText: main.name }).locator('xpath=ancestor::tr');
  await refreshedMainRow.getByRole('button', { name: `History for ${main.name}` }).click();
  await expect(page.locator('#stock-archive tbody tr').filter({ hasText: 'Other' })).toContainText('! Large change');
  await page.getByLabel('Product').selectOption(main.slug);
  await page.getByLabel('Type').selectOption('adjustment');
  await page.getByLabel('Reason contains').fill('Other');
  await page.getByLabel('From', { exact: true }).fill(archived.date.slice(0, 10));
  await page.getByLabel('To', { exact: true }).fill(archived.date.slice(0, 10));
  await page.getByLabel('Large changes only').check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  const archiveRow = page.locator('#stock-archive tbody tr').filter({ hasText: 'Other' });
  await expect(archiveRow).toContainText('! Large change');
  await expect(archiveRow).toContainText('20 → 16');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('aquatica-stock-archive.csv');
});

test('shop status and closed-order policies are visible and enforced', async ({ page, browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  try {
    await signIn(page, fixture.users.customer);
    await signIn(ownerPage, fixture.users.owner);

    await navigate(ownerPage, 'Settings');
    await expect(ownerPage.getByRole('switch', { name: 'Manual shop open override' })).toBeVisible();
    await expect(ownerPage.getByText('Opening hours (Asia/Manila)')).toBeVisible();
    await expect(ownerPage.getByLabel('Accept orders when closed')).toBeChecked();
    const initialSettings = await api(ownerPage, '/api/v1/owner/settings');
    expect(initialSettings.body.settings.acceptOrdersWhenClosed).toBe(true);

    const manualOpen = await api(ownerPage, '/api/v1/owner/settings', 'PATCH', {
      shopOpenOverride: 'open',
      acceptOrdersWhenClosed: true,
    });
    expect(manualOpen.status).toBe(200);
    await page.reload();
    await navigate(page, 'Home');
    await expect(page.getByTestId('home-shop-status')).toContainText("We're open · manual override");
    await expect(page.locator('.topbar .shop-status-header')).toContainText("We're open · manual override");

    const manualClosed = await api(ownerPage, '/api/v1/owner/settings', 'PATCH', {
      shopOpenOverride: 'closed',
      shopClosedMessage: 'Test shop closure notice.',
      acceptOrdersWhenClosed: true,
    });
    expect(manualClosed.status).toBe(200);
    await page.reload();
    await navigate(page, 'Home');
    await expect(page.getByTestId('home-shop-status')).toContainText("We're closed · manual override");
    await expect(page.locator('.topbar .shop-status-header')).toContainText("We're closed · manual override");

    const product = fixture.products.main;
    await navigate(page, 'Shop');
    await page.getByRole('button', { name: `Add ${product.name} to cart` }).click();
    await navigate(page, 'Cart');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.getByRole('button', { name: /Pick up at shop/ }).click();
    await page.getByRole('button', { name: 'Cash at the shop' }).click();
    await expect(page.getByTestId('checkout-shop-closed-notice')).toContainText('processed when the shop opens');
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
    const placed = (await api(page, '/api/v1/orders')).body.orders[0];
    expect(placed).toMatchObject({ shopClosedAtOrder: true });
    expect(placed.customerNotice).toContain('Test shop closure notice.');
    await navigate(page, 'My orders');
    await expect(page.getByText('Test shop closure notice.')).toBeVisible();

    await navigate(page, 'Shop');
    await page.getByRole('button', { name: `Add ${product.name} to cart` }).click();
    await navigate(page, 'Cart');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    const closedPolicy = await api(ownerPage, '/api/v1/owner/settings', 'PATCH', {
      acceptOrdersWhenClosed: false,
    });
    expect(closedPolicy.status).toBe(200);
    await page.reload();
    await navigate(page, 'Cart');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByTestId('checkout-shop-closed-notice')).toContainText('not accepting orders');
    await expect(page.getByRole('button', { name: 'Place order' })).toBeDisabled();
    const blocked = await api(page, '/api/v1/orders', 'POST', {
      fulfillment: 'pickup',
      paymentMethod: 'cash_pickup',
      name: fixture.users.customer.email,
      phone: '5550100',
    });
    expect(blocked.status).toBe(409);
    const cart = await api(page, '/api/v1/cart');
    expect(cart.body.items).toHaveLength(1);
  } finally {
    await ownerContext.close();
  }
});

test('notifications group by order and support read, soft-delete, and pagination', async ({ page }) => {
  runFixture('seed-notifications', fixture, 51);
  await signIn(page, fixture.users.customer);
  const order = await placeOrder(page, fixture.products.main, { fulfillment: 'Pickup', payment: 'Cash' });
  await page.getByRole('button', { name: 'Notifications' }).click();

  await expect(page.locator('.notification-group-toggle').filter({ hasText: 'Other' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Notification pages' })).toContainText('Page 1 of 2');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('navigation', { name: 'Notification pages' })).toContainText('Page 2 of 2');
  await page.getByRole('button', { name: 'Previous' }).click();
  const orderGroup = page.locator('.notification-group-toggle').filter({ hasText: order.id });
  await expect(orderGroup).toContainText('Pending');

  const allNotifications = (await api(page, '/api/v1/notifications?page=1&pageSize=100')).body.notifications;
  const unreadFixture = allNotifications.find((notification) => notification.title === 'E2E page message 1');
  const singleFixture = allNotifications.find((notification) => notification.title === 'E2E notification');
  expect(unreadFixture).toBeTruthy();
  expect(singleFixture).toBeTruthy();

  const blockedDelete = await api(page, `/api/v1/notifications/${unreadFixture.id}`, 'DELETE', {});
  expect(blockedDelete.status).toBe(409);
  expect(blockedDelete.body.message).toContain('read before deleting');

  const unreadBeforeSingleRead = (await api(page, '/api/v1/notifications/unread-count')).body.count;
  const singleRead = await api(page, `/api/v1/notifications/${singleFixture.id}/read`, 'PATCH', {});
  expect(singleRead.status).toBe(200);
  expect((await api(page, '/api/v1/notifications/unread-count')).body.count).toBe(unreadBeforeSingleRead - 1);

  await page.locator('.notification-group-toggle').filter({ hasText: 'Other' }).click();
  await expect(page.locator('.notification-row').filter({ hasText: 'E2E page message 51' })).toBeVisible();
  await expect(page.locator('.notification-row time').first()).toContainText(/now|second|minute|hour/);
  await expect(page.locator('.notification-group-toggle').filter({ hasText: 'Other' })).toContainText('0 unread');
  await page.getByRole('button', { name: 'Delete read' }).click();
  await expect(page.locator('.notification-group-toggle').filter({ hasText: 'Other' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByRole('button', { name: 'Delete all read' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete all read' }).click();
  const remaining = await api(page, '/api/v1/notifications?page=1&pageSize=100');
  expect(remaining.body.notifications).toHaveLength(0);
  const snapshot = inspect();
  const fixtureMessages = snapshot.notifications.filter((notification) =>
    Number(notification.user_id) === fixture.users.customer.id);
  expect(fixtureMessages.filter((notification) => notification.deleted_at == null)).toHaveLength(0);
});
