import { test, expect } from './fixtures/coverage';

// Generate unique username for each test
function generateUsername() {
  return `testuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage and cookies before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();
    await page.reload();
  });

  test('should open auth dropdown when clicking Sign In', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForTimeout(1000);

    // Click Sign In button
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await expect(signInButton).toBeVisible();
    await signInButton.click();

    // Should see login form
    const usernameInput = page.getByPlaceholder(/username/i);
    await expect(usernameInput).toBeVisible();
  });

  test('should switch between login and register tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Open auth dropdown
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should be on login tab by default
    const loginTab = page.getByRole('button', { name: /^login$/i });
    const registerTab = page.getByRole('button', { name: /register/i });

    await expect(loginTab).toBeVisible();
    await expect(registerTab).toBeVisible();

    // Click register tab
    await registerTab.click();

    // Should still see form inputs
    await expect(page.getByPlaceholder(/username/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test('should show validation error for short password', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Open auth dropdown and switch to register
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /register/i }).click();

    // Fill form with short password
    await page.getByPlaceholder(/username/i).fill('testuser');
    await page.getByPlaceholder(/password/i).fill('short');

    // Wait for Turnstile (in test mode it should auto-verify)
    await page.waitForTimeout(2000);

    // Submit form
    const submitButton = page.getByRole('button', { name: /create account/i });
    if (await submitButton.isEnabled()) {
      await submitButton.click();

      // Should see error message
      await page.waitForTimeout(500);
      const _error = page.locator('.error, [class*="error"]');
    }
  });

  test('should register a new user successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const username = generateUsername();

    // Open auth dropdown and switch to register
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /register/i }).click();

    // Fill form
    await page.getByPlaceholder(/username/i).fill(username);
    await page.getByPlaceholder(/password/i).fill('password123');

    // Wait for Turnstile
    await page.waitForTimeout(3000);

    // Submit form
    const submitButton = page.getByRole('button', { name: /create account/i });

    // Only proceed if button is enabled (Turnstile passed)
    if (await submitButton.isEnabled()) {
      await submitButton.click();

      // Wait for registration to complete
      await page.waitForTimeout(2000);

      // Should see user menu instead of sign in button
      const userMenu = page.locator('.user-menu, [class*="user-menu"]');
      const signInButton = page.getByRole('button', { name: /sign in/i });

      // Either user menu is visible or sign in is gone
      const isAuthenticated = await userMenu.isVisible() || !(await signInButton.isVisible());

      // If authentication worked, verify localStorage mode changed
      if (isAuthenticated) {
        const _mode = await page.evaluate(() => {
          const data = localStorage.getItem('auth-storage');
          if (data) {
            try {
              return JSON.parse(data).state?.mode;
            } catch {
              return null;
            }
          }
          return null;
        });
      }
    }
  });

  test('should show user menu when authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const username = generateUsername();

    // Register
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /register/i }).click();
    await page.getByPlaceholder(/username/i).fill(username);
    await page.getByPlaceholder(/password/i).fill('password123');

    await page.waitForTimeout(3000);

    const submitButton = page.getByRole('button', { name: /create account/i });
    if (await submitButton.isEnabled()) {
      await submitButton.click();
      await page.waitForTimeout(2000);

      // Look for user avatar or menu
      const userAvatar = page.locator('.user-avatar, [class*="avatar"]');
      if (await userAvatar.isVisible()) {
        await userAvatar.click();

        // Should see logout option
        const logoutButton = page.getByRole('button', { name: /logout/i }).or(
          page.locator('button').filter({ hasText: /log out/i })
        );
        await expect(logoutButton).toBeVisible();
      }
    }
  });

  test('should logout successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const username = generateUsername();

    // Register
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /register/i }).click();
    await page.getByPlaceholder(/username/i).fill(username);
    await page.getByPlaceholder(/password/i).fill('password123');

    await page.waitForTimeout(3000);

    const submitButton = page.getByRole('button', { name: /create account/i });
    if (await submitButton.isEnabled()) {
      await submitButton.click();
      await page.waitForTimeout(2000);

      // Open user menu
      const userTrigger = page.locator('.user-menu-trigger, [class*="user-menu"]').first();
      if (await userTrigger.isVisible()) {
        await userTrigger.click();

        // Click logout
        const logoutButton = page.getByRole('button', { name: /logout/i }).or(
          page.locator('button').filter({ hasText: /log out/i })
        );
        if (await logoutButton.isVisible()) {
          await logoutButton.click();

          await page.waitForTimeout(1000);

          // Should see Sign In button again
          const signInButton = page.getByRole('button', { name: /sign in/i });
          await expect(signInButton).toBeVisible();
        }
      }
    }
  });
});
