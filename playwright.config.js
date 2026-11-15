import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.AQUATICA_E2E_URL || 'http://127.0.0.1:5174/webapp/';
const databaseName = process.env.AQUATICA_TEST_DB_NAME;
if (!databaseName || !/^aquanova_test_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error('Set AQUATICA_TEST_DB_NAME to an isolated aquanova_test_* database before running Playwright.');
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const documentRoot = resolve(projectRoot, '..');
const apiUrl = 'http://127.0.0.1:8091';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.AQUATICA_E2E_URL ? undefined : [
    {
      command: `php -d extension=gd -S 127.0.0.1:8091 -t "${documentRoot}" "${resolve(projectRoot, 'tests/api_test_router.php')}"`,
      url: `${apiUrl}/AquaNova/api/auth/csrf.php`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        ...process.env,
        APP_ENV: 'local',
        DB_NAME: databaseName,
        AQUATICA_TEST_DB_NAME: databaseName,
      },
    },
    {
      command: 'npm --prefix webapp run dev -- --host 127.0.0.1 --port 5174',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { ...process.env, AQUATICA_API_PROXY_TARGET: apiUrl },
    },
  ],
  outputDir: './test-results/playwright',
});
