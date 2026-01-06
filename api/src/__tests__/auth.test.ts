import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupDatabase, cleanDatabase } from './setup';

describe('Auth API', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const response = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { user: { id: string; username: string }; accessToken: string };
      expect(data.user.username).toBe('testuser');
      expect(data.accessToken).toBeTruthy();
    });

    it('should create a default room for new users', async () => {
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      // Check rooms
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(roomsResponse.status).toBe(200);
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ name: string; isDefault: boolean }> };
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe("testuser's Drawers");
      expect(rooms[0].isDefault).toBe(true);
    });

    it('should reject duplicate usernames', async () => {
      // First registration
      await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      // Second registration with same username
      const response = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'differentpassword',
          turnstileToken: 'test-token',
        }),
      });

      expect(response.status).toBe(409);
    });

    it('should reject short passwords', async () => {
      const response = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'short',
          turnstileToken: 'test-token',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
    });

    it('should login with correct credentials', async () => {
      const response = await SELF.fetch('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { user: { username: string }; accessToken: string };
      expect(data.user.username).toBe('testuser');
      expect(data.accessToken).toBeTruthy();
    });

    it('should reject incorrect password', async () => {
      const response = await SELF.fetch('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'wrongpassword',
          turnstileToken: 'test-token',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const response = await SELF.fetch('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nonexistent',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user info', async () => {
      // Register and get token
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      const response = await SELF.fetch('http://localhost/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { user: { username: string } };
      expect(data.user.username).toBe('testuser');
    });

    it('should reject unauthenticated requests', async () => {
      const response = await SELF.fetch('http://localhost/auth/me');
      expect(response.status).toBe(401);
    });

    it('should reject invalid tokens', async () => {
      const response = await SELF.fetch('http://localhost/auth/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      const response = await SELF.fetch('http://localhost/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('should logout without refresh token', async () => {
      const response = await SELF.fetch('http://localhost/auth/logout', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('should logout all sessions', async () => {
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      const response = await SELF.fetch('http://localhost/auth/logout-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await SELF.fetch('http://localhost/auth/logout-all', {
        method: 'POST',
      });

      expect(response.status).toBe(401);
    });

    it('should reject invalid tokens', async () => {
      const response = await SELF.fetch('http://localhost/auth/logout-all', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return 401 when no refresh token', async () => {
      const response = await SELF.fetch('http://localhost/auth/refresh', {
        method: 'POST',
      });

      expect(response.status).toBe(401);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('No refresh token');
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await SELF.fetch('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          Cookie: 'refresh_token=invalid-token-value',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Invalid or expired refresh token');
    });
  });

  describe('PATCH /auth/password', () => {
    it('should change password successfully', async () => {
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      const response = await SELF.fetch('http://localhost/auth/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { accessToken: string };
      expect(data.accessToken).toBeTruthy();

      // Verify can login with new password
      const loginResponse = await SELF.fetch('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'newpassword456',
          turnstileToken: 'test-token',
        }),
      });

      expect(loginResponse.status).toBe(200);
    });

    it('should reject wrong current password', async () => {
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      const response = await SELF.fetch('http://localhost/auth/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword456',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await SELF.fetch('http://localhost/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject short new password', async () => {
      const registerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const { accessToken } = await registerResponse.json() as { accessToken: string };

      const response = await SELF.fetch('http://localhost/auth/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentPassword: 'password123',
          newPassword: 'short',
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
