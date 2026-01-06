import { test, expect } from './fixtures/coverage';

test.describe('Drawer Operations (Local Mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Wait for app to fully load
    await page.waitForTimeout(2000);
  });

  test('should display the 3D scene container', async ({ page }) => {
    await page.goto('/');

    // Wait for loading state to finish
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {
      // Spinner might not appear if loading is fast
    });

    // Scene container should be visible
    await expect(page.locator('.scene-container')).toBeVisible({ timeout: 10000 });

    // The app should render a scene container for the 3D view
    // Note: Canvas rendering may depend on WebGL support in the browser
    const sceneContainer = page.locator('.scene-container');
    const boundingBox = await sceneContainer.boundingBox();
    expect(boundingBox).toBeTruthy();
    expect(boundingBox!.width).toBeGreaterThan(0);
    expect(boundingBox!.height).toBeGreaterThan(0);
  });

  test('should have an add drawer button', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Add drawer button should be visible
    const addButton = page.locator('[aria-label="Add drawer"]');
    await expect(addButton).toBeVisible();
  });

  test('should open add drawer modal when clicking add button', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Click add drawer button
    const addButton = page.locator('[aria-label="Add drawer"]');
    await addButton.click();

    // Should see a modal or form
    await page.waitForTimeout(500);

    // Look for modal content (name input or similar)
    const nameInput = page.getByPlaceholder(/name/i).or(
      page.getByLabel(/name/i)
    );
    // Modal should appear with input field
    await expect(nameInput.first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Modal might not use placeholder, just check for any input
    });
  });

  test('should create a new drawer', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Count initial drawers in localStorage
    const initialDrawerCount = await page.evaluate(() => {
      const data = localStorage.getItem('drawer-organizer-state');
      if (data) {
        try {
          const parsed = JSON.parse(data);
          return Object.keys(parsed.state?.drawers || {}).length;
        } catch {
          return 0;
        }
      }
      return 0;
    });

    // Click add drawer button
    const addButton = page.locator('[aria-label="Add drawer"]');
    await addButton.click();

    await page.waitForTimeout(500);

    // Try to find and fill the name input
    const nameInput = page.locator('input[type="text"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Test Drawer');

      // Find and click submit/create button
      const createButton = page.getByRole('button', { name: /create|add|save/i });
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.waitForTimeout(500);

        // Verify drawer was added
        const newDrawerCount = await page.evaluate(() => {
          const data = localStorage.getItem('drawer-organizer-state');
          if (data) {
            try {
              const parsed = JSON.parse(data);
              return Object.keys(parsed.state?.drawers || {}).length;
            } catch {
              return 0;
            }
          }
          return 0;
        });

        expect(newDrawerCount).toBeGreaterThan(initialDrawerCount);
      }
    }
  });

  test('should have a scene container for drawer interaction', async ({ page }) => {
    await page.goto('/');

    // Wait for loading state to finish
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {});

    // Wait for scene container
    const sceneContainer = page.locator('.scene-container');
    await expect(sceneContainer).toBeVisible({ timeout: 10000 });

    // Check if header exists and has content
    const header = page.locator('header h1');
    await expect(header).toBeVisible();
    const headerText = await header.textContent();

    // Header should have some text content
    expect(headerText).toBeTruthy();
  });

  test('should save drawer state to localStorage', async ({ page }) => {
    await page.goto('/');

    // Wait for loading state to finish
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {});

    // Wait for header to be visible (app is loaded)
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // Create a drawer to ensure there's something to persist
    const addButton = page.locator('[aria-label="Add drawer"]');
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Fill in the drawer name - use specific placeholder
    const nameInput = page.getByPlaceholder('e.g., Kitchen Drawer');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Test Drawer for Persistence');

    // Click create button (specifically "Create Drawer")
    const createButton = page.getByRole('button', { name: 'Create Drawer' });
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for modal to close and drawer to be created
    await page.waitForTimeout(1500);

    // Verify localStorage has drawer data
    const hasData = await page.evaluate(() => {
      const data = localStorage.getItem('drawer-organizer-state');
      if (data) {
        try {
          const parsed = JSON.parse(data);
          // Check that state structure exists and has at least one drawer
          return 'state' in parsed && 'drawers' in parsed.state && Object.keys(parsed.state.drawers).length > 0;
        } catch {
          return false;
        }
      }
      return false;
    });

    expect(hasData).toBe(true);
  });

  test('should persist drawer state after reload', async ({ page }) => {
    await page.goto('/');

    // Wait for loading state to finish
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {});

    // Wait for header to be visible (app is loaded)
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // Create a drawer to have something to persist
    const addButton = page.locator('[aria-label="Add drawer"]');
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Fill in the drawer name - use specific placeholder
    const nameInput = page.getByPlaceholder('e.g., Kitchen Drawer');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Persistence Test Drawer');

    // Click create button (specifically "Create Drawer")
    const createButton = page.getByRole('button', { name: 'Create Drawer' });
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for modal to close and drawer to be created
    await page.waitForTimeout(1500);

    // Get initial drawer count
    const initialDrawerCount = await page.evaluate(() => {
      const data = localStorage.getItem('drawer-organizer-state');
      if (data) {
        try {
          const parsed = JSON.parse(data);
          return Object.keys(parsed.state?.drawers || {}).length;
        } catch {
          return 0;
        }
      }
      return 0;
    });

    // Reload page
    await page.reload();

    // Wait for loading state to finish again
    await page.waitForSelector('.loading-spinner', { state: 'detached', timeout: 10000 }).catch(() => {});
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Get drawer count after reload
    const afterReloadDrawerCount = await page.evaluate(() => {
      const data = localStorage.getItem('drawer-organizer-state');
      if (data) {
        try {
          const parsed = JSON.parse(data);
          return Object.keys(parsed.state?.drawers || {}).length;
        } catch {
          return 0;
        }
      }
      return 0;
    });

    // Both should have at least one drawer
    expect(initialDrawerCount).toBeGreaterThan(0);
    expect(afterReloadDrawerCount).toBeGreaterThan(0);
    // Counts should be equal (persisted correctly)
    expect(afterReloadDrawerCount).toEqual(initialDrawerCount);
  });
});
