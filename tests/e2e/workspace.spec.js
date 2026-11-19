import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

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
let fixture;

function runFixture(action, data = null, ...args) {
  const env = {
    ...process.env,
    APP_ENV: 'local',
    DB_NAME: databaseName,
    AQUATICA_TEST_DB_NAME: databaseName,
  };
  const commandArgs = [fixtureScript, action];
  if (data) commandArgs.push(JSON.stringify(data));
  commandArgs.push(...args.map(String));
  const output = execFileSync('php', ['-d', 'display_errors=0', ...commandArgs], { encoding: 'utf8', env });
  return JSON.parse(output);
}

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
  const loginResponse = await request.post(`${apiOrigin}/api/auth/login.php`, {
    data: { email: user.email, password: user.password },
    headers: { 'X-CSRF-Token': csrf.csrfToken },
  });
  expect(loginResponse.status()).toBe(200);
  const sessionResponse = await request.get(`${apiOrigin}/api/auth/session.php`);
  const session = await sessionResponse.json();
  expect(session.user.role).toBe(user.role);
  await page.goto('/');
  await expect(page.locator('.sidebar .nav-link-active')).toBeVisible();
}

async function newSignedInPage(browser, user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, user);
  return { context, page };
}

async function navigate(page, label, width = null) {
  const viewportWidth = width ?? await page.evaluate(() => window.innerWidth);
  if (viewportWidth <= 900) {
    const sidebar = page.locator('.sidebar');
    await page.waitForFunction(() => window.matchMedia('(max-width: 900px)').matches);
    const menuOpen = await page.locator('.app-shell').evaluate((element) => element.classList.contains('mobile-nav-open'));
    if (!menuOpen) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
    }
    await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
    await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
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

async function doubleClickOnce(page, button, method, pathPattern) {
  let requestCount = 0;
  const routePattern = '**/api/v1/**';
  const onRoute = async (route) => {
    const request = route.request();
    if (request.method() !== method || !pathPattern.test(new URL(request.url()).pathname)) {
      await route.fallback();
      return;
    }
    requestCount++;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ response });
  };
  await page.route(routePattern, onRoute);
  try {
    const response = page.waitForResponse((candidate) =>
      candidate.request().method() === method
      && pathPattern.test(new URL(candidate.url()).pathname));
    await button.dblclick();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button.locator('.button-spinner')).toBeVisible();
    await response;
    await page.waitForTimeout(250);
    expect(requestCount).toBe(1);
  } finally {
    if (!page.isClosed()) await page.unroute(routePattern, onRoute);
  }
}

async function placeOrder(page, product, { fulfillment = 'Delivery', payment = 'GCash' } = {}) {
  await navigate(page, 'Shop');
  await doubleClickOnce(page, page.getByRole('button', { name: `Add ${product.name} to cart` }), 'POST', /\/api\/v1\/cart\/items$/);
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
  await doubleClickOnce(page, page.getByRole('button', { name: 'Place order' }), 'POST', /\/api\/v1\/orders$/);
  await expect(page.getByRole('heading', {
    name: payment === 'GCash' ? 'Pay with GCash' : 'Order placed!',
  })).toBeVisible({ timeout: 9_000 });
  const orders = await api(page, '/api/v1/orders');
  expect(orders.status).toBe(200);
  return orders.body.orders[0];
}

async function submitProof(page, reference) {
  await page.getByLabel('GCash reference number').fill(reference);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'gcash-proof.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await doubleClickOnce(page, page.getByRole('button', { name: 'Upload payment proof' }), 'POST', /\/api\/v1\/orders\/\d+\/payment-proof$/);
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

async function saveScreenshot(page, name) {
  const path = resolve('test-results/playwright/screenshots', name);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

test('login password eye, contrast, logout Back, and deep-link Back are accessible', async ({ page, browser }) => {
  await page.goto('http://localhost/AquaNova/login');
  const password = page.locator('input[autocomplete="current-password"]');
  await expect(password).toHaveAttribute('type', 'password');
  const eye = page.getByRole('button', { name: 'Show password' });
  await eye.focus();
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Password is visible');

  const linkContrast = await page.locator('.auth-form-link').evaluate((link) => {
    const color = getComputedStyle(link).color;
    const background = getComputedStyle(link.closest('.auth-layout')).backgroundColor;
    const rgb = (value) => value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    const luminance = (values) => {
      const channels = values.map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const fg = rgb(color);
    const bg = rgb(background);
    const lighter = Math.max(luminance(fg), luminance(bg));
    const darker = Math.min(luminance(fg), luminance(bg));
    return (lighter + 0.05) / (darker + 0.05);
  });
  expect(linkContrast).toBeGreaterThanOrEqual(4.5);

  await signIn(page, fixture.users.owner);
  await page.goto('/webapp/?page=inventory');
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.sidebar .nav-link-active')).toContainText('Dashboard');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/page=(orders|inventory|dashboard|account|settings)/);
});

test('owner Orders and Reports render from live API data and period selection updates the URL', async ({ page }) => {
  await signIn(page, fixture.users.owner);
  const delayedVerification = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  };
  await page.route('**/api/auth/owner-page.php', delayedVerification);
  await page.locator('.sidebar .nav-link').filter({ hasText: /^Orders/ }).click();
  await expect(page.getByRole('status', { name: 'Loading page' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  await page.unroute('**/api/auth/owner-page.php', delayedVerification);
  for (const tab of ['Needs action', 'Preparing', 'Ready', 'Completed', 'Cancelled']) {
    await expect(page.getByRole('tab', { name: new RegExp(tab) })).toBeVisible();
  }
  await navigate(page, 'Reports');
  for (const title of ['Revenue', 'Daily revenue', 'Payment methods', 'Orders by status', 'Sales by category', 'Delivery vs pickup', 'Top products', 'Payment review']) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  const reports = await api(page, `/api/v1/owner/reports?period=month&date=${fixture.reportDate}`);
  expect(reports.status).toBe(200);
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page).toHaveURL(/period=week/);
  await expect(page.locator('body')).not.toContainText(/NaN|undefined|Infinity/);
});

test('owner Orders, Inventory, Reports, and Settings fit desktop and tablet widths', async ({ page }) => {
  const phase = process.env.AQUATICA_SCREENSHOT_PHASE || 'real-data';
  await signIn(page, fixture.users.owner);
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const label of ['Orders', 'Inventory', 'Reports', 'Settings']) {
      await navigate(page, label, width);
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${label} at ${width}px must not overflow the page`).toBeLessThanOrEqual(dimensions.clientWidth);
      await saveScreenshot(page, `${phase}-owner-${label.toLowerCase()}-${width}.png`);
    }
  }
});

test('owner Orders and Reports remain within the page at narrow responsive widths', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, fixture.users.owner);
  for (const width of [960, 720, 683, 512]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const label of ['Orders', 'Reports']) {
      await navigate(page, label, width);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cards: [...document.querySelectorAll('.reports-card, .reports-stat, .orders-inbox-list, .order-inbox-detail')]
          .map((card) => ({ clientWidth: card.clientWidth, scrollWidth: card.scrollWidth })),
      }));
      expect(dimensions.scrollWidth, `${label} at ${width}px must not overflow the page`)
        .toBeLessThanOrEqual(dimensions.clientWidth);
      expect(dimensions.cards.every((card) => card.scrollWidth <= card.clientWidth + 2)).toBe(true);
    }
  }
});

test('customer Shop, Cart, Orders, and Account remain usable at 390px with real products', async ({ page }) => {
  await signIn(page, fixture.users.customer);
  await page.setViewportSize({ width: 390, height: 844 });
  const product = fixture.products.xss;
  await navigate(page, 'Shop', 390);
  await expect(page.getByText(product.name, { exact: true })).toBeVisible();
  await expect(page.locator('img[onerror]')).toHaveCount(0);
  await page.getByRole('button', { name: `Add ${fixture.products.main.name} to cart` }).click();
  for (const label of ['Cart', 'My orders', 'My account']) {
    await navigate(page, label, 390);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `${label} at 390px must not overflow`).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  const order = await placeOrder(page, fixture.products.main);
  await saveScreenshot(page, 'real-data-customer-gcash-390.png');
  expect(order.paymentStatus).toBe('Unpaid');
});

test('Shop keeps every category visible and restores category/search filters from its URL', async ({ page }) => {
  await signIn(page, fixture.users.customer);
  await navigate(page, 'Shop');
  const chips = page.locator('.shop-tools .category-tab');
  await expect(chips.first()).toBeVisible();
  const initialLabels = await chips.allTextContents();
  expect(initialLabels.length).toBeGreaterThan(2);
  const category = initialLabels.find((label) => label !== 'All items');
  await chips.filter({ hasText: category }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBe(category);
  await expect(chips).toHaveCount(initialLabels.length);
  await expect(chips.filter({ hasText: category })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBeNull();
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
  await chips.filter({ hasText: category }).click();
  await chips.filter({ hasText: category }).click();
  await expect(page).not.toHaveURL(/category=/);

  const search = page.getByPlaceholder('Search products...');
  await search.fill(fixture.products.main.name);
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(fixture.products.main.name);
  await page.reload();
  await expect(page.getByPlaceholder('Search products...')).toHaveValue(fixture.products.main.name);
  await expect(page.locator('.shop-tools .category-tab')).toHaveCount(initialLabels.length);
});

test('GCash proof rejection, duplicate reference, re-upload, approval, and next-order selection use the live API', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, fixture.users.customer);
  const { context: ownerContext, page: ownerPage } = await newSignedInPage(browser, fixture.users.owner);
  try {
    const first = await placeOrder(page, fixture.products.main);
    await submitProof(page, `E2E${fixture.tag}A1`);
    await expect(page.getByRole('heading', { name: 'Payment received for review' })).toBeVisible();
    await page.waitForTimeout(1100);
    const second = await placeOrder(page, fixture.products.main);
    await submitProof(page, `E2E${fixture.tag}B1`);
    await expect(page.getByRole('heading', { name: 'Payment received for review' })).toBeVisible();

    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, first);
    await ownerPage.getByRole('button', { name: 'Check proof' }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await ownerPage.getByLabel('Reason for rejection').fill('Reference is not readable.');
    await doubleClickOnce(ownerPage, ownerPage.getByRole('dialog').getByRole('button', { name: 'Reject payment proof' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);

    await page.reload();
    await navigate(page, 'My orders');
    await expect(page.getByText('Payment update needed: Reference is not readable.')).toBeVisible();
    await page.getByRole('button', { name: 'Notifications' }).click();
    await doubleClickOnce(page, page.getByRole('button', { name: 'Mark read' }).first(), 'PATCH', /\/api\/v1\/notifications\/\d+\/read$/);
    await navigate(page, 'My orders');
    await page.getByRole('button', { name: 'Upload proof' }).first().click();
    await submitProof(page, `E2E${fixture.tag}A1`);
    await expect(page.locator('.inline-error')).toContainText('already been used');
    await submitProof(page, `E2E${fixture.tag}A2`);
    await expect(page.getByRole('heading', { name: 'Payment received for review' })).toBeVisible();

    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, first);
    await ownerPage.getByRole('button', { name: 'Check proof' }).click();
    await doubleClickOnce(ownerPage, ownerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);
    await expect(ownerPage.locator('.order-inbox-detail h2')).toHaveText(second.id);
    const snapshot = inspect();
    expect(orderRecord(snapshot, first.databaseId)).toMatchObject({
      order_status: 'preparing',
      payment_status: 'paid',
      stock_deducted: 1,
    });
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === first.databaseId && movement.type === 'sale'))
      .toHaveLength(1);
    expect(snapshot.proofs.filter((proof) => Number(proof.order_id) === first.databaseId)).toHaveLength(2);
  } finally {
    await ownerContext.close();
  }
});

test('COD delivery and pickup cash reach their paid completion actions through the live API', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, fixture.users.customer);
  const { context: ownerContext, page: ownerPage } = await newSignedInPage(browser, fixture.users.owner);
  try {
    const delivery = await placeOrder(page, fixture.products.main, { payment: 'COD' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, delivery);
    const delayOrders = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fallback();
    };
    await ownerPage.route('**/api/v1/owner/orders**', delayOrders);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Confirm order' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);
    await expect(ownerPage.locator('.orders-inbox-list').getByLabel('Loading list')).toBeVisible();
    await ownerPage.unroute('**/api/v1/owner/orders**', delayOrders);
    await expect(ownerPage.locator('.orders-inbox-list').getByLabel('Loading list')).toHaveCount(0);
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, delivery);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Mark as ready' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);
    await ownerPage.getByRole('tab', { name: /Ready/ }).click();
    await selectOrder(ownerPage, delivery);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Delivered and paid' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);

    const pickup = await placeOrder(page, fixture.products.main, { payment: 'cash', fulfillment: 'Pickup' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, pickup);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Confirm order' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, pickup);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Mark as ready' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);
    await ownerPage.getByRole('tab', { name: /Ready/ }).click();
    await selectOrder(ownerPage, pickup);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Handed over and paid' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);

    const snapshot = inspect();
    for (const order of [delivery, pickup]) {
      expect(orderRecord(snapshot, order.databaseId)).toMatchObject({
        order_status: 'completed',
        payment_status: 'paid',
        stock_deducted: 1,
      });
      expect(snapshot.movements.filter((movement) => Number(movement.order_id) === order.databaseId && movement.type === 'sale'))
        .toHaveLength(1);
    }
  } finally {
    await ownerContext.close();
  }
});

test('short stock blocks checkout and customer and owner cancellations preserve or return stock', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, fixture.users.customer);
  const short = fixture.products.short;
  await navigate(page, 'Shop');
  runFixture('adjust-stock', fixture, short.id, 1);
  await doubleClickOnce(page, page.getByRole('button', { name: `Add ${short.name} to cart` }), 'POST', /\/api\/v1\/cart\/items$/);
  await doubleClickOnce(page, page.getByRole('button', { name: `Add ${short.name} to cart` }), 'POST', /\/api\/v1\/cart\/items$/);
  runFixture('adjust-stock', fixture, short.id, -1);
  await navigate(page, 'Cart');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByRole('button', { name: /^Delivery/ }).click();
  await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
  await page.getByRole('button', { name: 'Cash on delivery' }).click();
  await doubleClickOnce(page, page.getByRole('button', { name: 'Place order' }), 'POST', /\/api\/v1\/orders$/);
  await expect(page.locator('.toast')).toContainText(/stock/i);
  expect(inspect().orders).toHaveLength(0);
  await navigate(page, 'Cart');
  await page.getByRole('button', { name: 'Decrease quantity' }).click();
  await expect(page.locator('.quantity-control span')).toHaveText('1');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByRole('button', { name: /^Delivery/ }).click();
  await page.getByLabel('Phone number').fill('09175550142');
  await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
  await page.getByRole('button', { name: 'Cash on delivery' }).click();
  const placeOrderButton = page.getByRole('button', { name: 'Place order' });
  await expect(placeOrderButton).toBeEnabled({ timeout: 9_000 });
  await doubleClickOnce(page, placeOrderButton, 'POST', /\/api\/v1\/orders$/);
  await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
  const recoveredOrder = (await api(page, '/api/v1/orders')).body.orders[0];
  expect(recoveredOrder.items).toMatchObject([{ productId: String(short.id), quantity: 1 }]);
  await navigate(page, 'My orders');
  await page.getByRole('button', { name: 'View order' }).first().click();
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await doubleClickOnce(page, page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }), 'POST', /\/api\/v1\/orders\/\d+\/cancel$/);
  expect(orderRecord(inspect(), recoveredOrder.databaseId)).toMatchObject({
    order_status: 'cancelled',
    stock_deducted: 0,
  });

  const { context: ownerContext, page: ownerPage } = await newSignedInPage(browser, fixture.users.owner);
  try {
    const customerCancelled = await placeOrder(page, fixture.products.main, { payment: 'COD' });
    await navigate(page, 'My orders');
    await page.getByRole('button', { name: 'View order' }).first().click();
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await doubleClickOnce(page, page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }), 'POST', /\/api\/v1\/orders\/\d+\/cancel$/);
    expect(orderRecord(inspect(), customerCancelled.databaseId)).toMatchObject({
      order_status: 'cancelled',
      stock_deducted: 0,
    });

    const ownerCancelled = await placeOrder(page, fixture.products.main, { payment: 'COD' });
    await ownerPage.reload();
    await navigate(ownerPage, 'Orders');
    await selectOrder(ownerPage, ownerCancelled);
    await doubleClickOnce(ownerPage, ownerPage.getByRole('button', { name: 'Confirm order' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);
    await ownerPage.getByRole('tab', { name: /Preparing/ }).click();
    await selectOrder(ownerPage, ownerCancelled);
    await ownerPage.getByRole('button', { name: 'Cancel order' }).click();
    await ownerPage.getByLabel('Cancellation reason').fill('Owner cancellation test.');
    await doubleClickOnce(ownerPage, ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel order' }), 'POST', /\/api\/v1\/owner\/orders\/\d+\/actions$/);

    await expect.poll(() => orderRecord(inspect(), ownerCancelled.databaseId), { timeout: 9_000 })
      .toMatchObject({ order_status: 'cancelled', stock_deducted: 0 });
    const snapshot = inspect();
    expect(snapshot.movements.filter((movement) => Number(movement.order_id) === ownerCancelled.databaseId).map((movement) => movement.type))
      .toEqual(['sale', 'cancellation']);
    expect(snapshot.stocks.main.stock).toBe(fixture.products.main.initialStock);
    expect(snapshot.stocks.main.stock).toBeGreaterThanOrEqual(0);
  } finally {
    await ownerContext.close();
  }
  await navigate(page, 'Shop');
  await doubleClickOnce(page, page.getByRole('button', { name: `Add ${fixture.products.main.name} to cart` }), 'POST', /\/api\/v1\/cart\/items$/);
  await navigate(page, 'Cart');
  await doubleClickOnce(page, page.getByRole('button', { name: `Delete ${fixture.products.main.name} from cart` }), 'PATCH', /\/api\/v1\/cart\/items\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Your cart is waiting' })).toBeVisible();
});

test('dropped order response retries the same request and creates exactly one order', async ({ page }) => {
  await signIn(page, fixture.users.customer);
  await navigate(page, 'Shop');
  await page.getByRole('button', { name: `Add ${fixture.products.main.name} to cart` }).click();
  await navigate(page, 'Cart');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByRole('button', { name: /^Delivery/ }).click();
  await page.getByLabel('Phone number').fill('09175550142');
  await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
  await page.getByRole('button', { name: 'Cash on delivery' }).click();

  let droppedOnce = true;
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() === 'POST' && droppedOnce) {
      droppedOnce = false;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const placeOrderButton = page.getByRole('button', { name: 'Place order' });
  await expect(placeOrderButton).toBeEnabled();
  await placeOrderButton.click();
  await expect(page.locator('.toast')).toContainText(/authentication server|reach|response/i);
  await page.unroute('**/api/v1/orders');

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible({ timeout: 9_000 });
  const orders = (await api(page, '/api/v1/orders')).body.orders;
  expect(orders).toHaveLength(1);
});

test('owner records stock reasons and manages product images', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, fixture.users.owner);
  await navigate(page, 'Inventory');
  await page.getByRole('button', { name: 'Restock' }).click();
  await page.locator('.modal-form select').first().selectOption(String(fixture.products.main.slug));
  await page.locator('.modal-form input[type="number"]').fill('5');
  await page.locator('.modal-form input[placeholder="e.g. Supplier delivery"]').fill('Supplier delivery');
  await page.locator('.modal-form input').last().fill('E2E stock batch');
  await doubleClickOnce(page, page.getByRole('dialog').getByRole('button', { name: 'Restock' }), 'POST', /\/api\/v1\/owner\/inventory\/movements$/);
  await expect(page.getByText('Supplier delivery')).toBeVisible();
  const afterStock = inspect();
  expect(afterStock.movements.filter((movement) => movement.reason === 'Supplier delivery: E2E stock batch'))
    .toHaveLength(1);

  await page.getByRole('button', { name: 'Adjust stock' }).click();
  await page.locator('.modal-form select').first().selectOption(String(fixture.products.main.slug));
  await page.locator('.modal-form select').nth(1).selectOption('Adjustment');
  await page.locator('.modal-form input[type="number"]').fill('1');
  await page.locator('.modal-form input[placeholder="e.g. Supplier delivery"]').fill('E2E adjustment');
  await page.locator('.modal-form input').last().fill('double-click coverage');
  await doubleClickOnce(page, page.getByRole('dialog').getByRole('button', { name: 'Adjust stock' }), 'POST', /\/api\/v1\/owner\/inventory\/movements$/);
  expect(inspect().movements.filter((movement) => movement.reason === 'E2E adjustment: double-click coverage'))
    .toHaveLength(1);

  await navigate(page, 'Products');
  const createdProductName = `E2E Created Product ${fixture.tag} Double click`;
  fixture.createdProductNames.push(createdProductName);
  await page.getByRole('button', { name: 'Add product' }).click();
  const createProductDialog = page.getByRole('dialog');
  await createProductDialog.getByLabel('Product name').fill(createdProductName);
  await createProductDialog.getByLabel('Price (₱)').fill('10');
  await createProductDialog.getByLabel('Opening stock').fill('2');
  await doubleClickOnce(page, createProductDialog.getByRole('button', { name: 'Create product' }), 'POST', /\/api\/v1\/owner\/products$/);
  await expect(page.locator('.owner-product-card').filter({ hasText: createdProductName })).toHaveCount(1);

  const productCard = page.locator('.owner-product-card').filter({ hasText: fixture.products.main.name });
  await productCard.getByRole('button', { name: 'Upload image' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await doubleClickOnce(page, page.getByRole('dialog').getByRole('button', { name: 'Save image' }), 'POST', /\/api\/v1\/owner\/products\/[^/]+\/image$/);
  await expect(productCard.getByRole('button', { name: 'Replace image' })).toBeVisible();
  expect(inspect().stocks.main.imagePath).toBeTruthy();

  await productCard.getByRole('button', { name: 'Replace image' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'product-replacement.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await doubleClickOnce(page, page.getByRole('dialog').getByRole('button', { name: 'Save image' }), 'POST', /\/api\/v1\/owner\/products\/[^/]+\/image$/);
  await expect(productCard.getByRole('button', { name: 'Delete image' })).toBeVisible();

  await doubleClickOnce(page, productCard.getByRole('button', { name: 'Delete image' }), 'DELETE', /\/api\/v1\/owner\/products\/[^/]+\/image$/);
  await expect(productCard.getByRole('button', { name: 'Upload image' })).toBeVisible();
  expect(inspect().stocks.main.imagePath).toBeNull();

  await navigate(page, 'Settings');
  await doubleClickOnce(page, page.getByRole('button', { name: 'Save settings' }), 'PATCH', /\/api\/v1\/owner\/settings$/);
  await expect(page.locator('.toast')).toContainText('Settings saved.');

  const { context: customerContext, page: customerPage } = await newSignedInPage(browser, fixture.users.customer);
  try {
    await navigate(customerPage, 'Shop');
    await expect(customerPage.getByText(fixture.products.main.name, { exact: true })).toBeVisible();
  } finally {
    await customerContext.close();
  }
});

test('customer is blocked from owner APIs and XSS product names render as text', async ({ page, browser }) => {
  await signIn(page, fixture.users.customer);
  const order = await placeOrder(page, fixture.products.main, { payment: 'COD' });
  const { context, page: secondCustomerPage } = await newSignedInPage(browser, fixture.users.secondCustomer);
  try {
    expect((await api(secondCustomerPage, '/api/v1/owner/orders')).status).toBe(403);
    expect((await api(secondCustomerPage, `/api/v1/orders/${order.databaseId}`)).status).toBe(404);
    await navigate(secondCustomerPage, 'Shop');
    await expect(secondCustomerPage.getByText(fixture.products.xss.name, { exact: true })).toBeVisible();
    await expect(secondCustomerPage.locator('img[onerror]')).toHaveCount(0);
    await expect(secondCustomerPage.locator('.sidebar .nav-link').filter({ hasText: /^(Orders|Reports|Inventory)$/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('real customer screenshots cover Shop, Cart, Checkout, GCash, and My Orders at four widths', async ({ page }) => {
  test.setTimeout(120_000);
  const phase = process.env.AQUATICA_SCREENSHOT_PHASE || 'real-data';
  await signIn(page, fixture.users.customer);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await navigate(page, 'Shop', width);
    await page.getByRole('button', { name: `Add ${fixture.products.main.name} to cart` }).click();
    await saveScreenshot(page, `${phase}-customer-shop-${width}.png`);
    await navigate(page, 'Cart', width);
    await saveScreenshot(page, `${phase}-customer-cart-${width}.png`);
    await navigate(page, 'My orders', width);
    await saveScreenshot(page, `${phase}-customer-my-orders-${width}.png`);
    await navigate(page, 'Cart', width);
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.getByRole('button', { name: /^Delivery/ }).click();
    await page.getByLabel('Delivery address').fill('42 Test Ocean Road');
    await saveScreenshot(page, `${phase}-customer-checkout-${width}.png`);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Pay with GCash' })).toBeVisible();
    await saveScreenshot(page, `${phase}-customer-gcash-${width}.png`);
  }
  const snapshot = inspect();
  expect(snapshot.orders).toHaveLength(4);
  expect(snapshot.orders.every((order) => order.payment_status === 'unpaid' && order.order_status === 'pending')).toBe(true);
});
