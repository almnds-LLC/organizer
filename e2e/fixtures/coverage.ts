import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const coverageDir = path.join(process.cwd(), 'coverage-e2e');

export const test = base.extend({
  page: async ({ page }, use) => {
    await use(page);

    // Collect coverage after each test
    if (process.env.E2E_COVERAGE === 'true') {
      const coverage = await page.evaluate(() => {
        return (window as unknown as { __coverage__?: object }).__coverage__;
      });

      if (coverage) {
        if (!fs.existsSync(coverageDir)) {
          fs.mkdirSync(coverageDir, { recursive: true });
        }

        const filename = `coverage-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        fs.writeFileSync(
          path.join(coverageDir, filename),
          JSON.stringify(coverage)
        );
      }
    }
  },
});

export { expect };
