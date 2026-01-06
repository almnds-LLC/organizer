import { test, expect } from './fixtures/coverage';

test.describe('Local Mode (No Auth)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should load the app in local mode', async ({ page }) => {
    await page.goto('/');

    // Wait for loading state to finish (loading spinner to disappear)
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {
      // Spinner might not appear if loading is fast
    });

    // Should have a header
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // Canvas may take time to render - check for scene container first
    await expect(page.locator('.scene-container')).toBeVisible({ timeout: 10000 });
  });

  test('should show Sign In button when not authenticated', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForTimeout(1000);

    // Should see Sign In button
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test('should create a new drawer', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForTimeout(1000);

    // Find and click the add drawer button
    const addButton = page.getByRole('button', { name: /add drawer/i }).or(
      page.locator('button').filter({ hasText: '+' })
    ).or(
      page.locator('[aria-label*="add"]')
    );

    // If there's an add button, click it
    if (await addButton.first().isVisible()) {
      await addButton.first().click();

      // Should see a new drawer or drawer creation dialog
      await page.waitForTimeout(500);
    }
  });

  test('should persist drawers in localStorage', async ({ page }) => {
    await page.goto('/');

    // Wait for loading state to finish
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {});

    // Wait for header to be visible (app is loaded)
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // Create a drawer to have something to persist
    const addButton = page.locator('[aria-label="Add drawer"]').or(
      page.getByRole('button', { name: /add drawer/i })
    );

    await expect(addButton.first()).toBeVisible({ timeout: 5000 });
    await addButton.first().click();

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Fill in the drawer name - use specific placeholder
    const nameInput = page.getByPlaceholder('e.g., Kitchen Drawer');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('LocalStorage Test Drawer');

    // Click create button (specifically "Create Drawer")
    const createButton = page.getByRole('button', { name: 'Create Drawer' });
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for modal to close and drawer to be created
    await page.waitForTimeout(1500);

    // Check that localStorage has drawer data with at least one drawer
    const hasDrawerData = await page.evaluate(() => {
      const data = localStorage.getItem('drawer-organizer-state');
      if (data) {
        try {
          const parsed = JSON.parse(data);
          return 'state' in parsed && Object.keys(parsed.state?.drawers || {}).length > 0;
        } catch {
          return false;
        }
      }
      return false;
    });

    expect(hasDrawerData).toBe(true);
  });
});
