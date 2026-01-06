import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupDatabase, cleanDatabase } from './setup';

describe('Users API', () => {
  let accessToken: string;

  beforeAll(async () => {
    await setupDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    // Create a test user
    const response = await SELF.fetch('http://localhost/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'password123',
        turnstileToken: 'test-token',
      }),
    });
    const data = await response.json() as { accessToken: string };
    accessToken = data.accessToken;
  });

  describe('GET /users/search', () => {
    it('should search for users by username', async () => {
      // Create another user to search for
      await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'searchable',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const response = await SELF.fetch('http://localhost/users/search?q=search', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { users: Array<{ username: string }> };
      expect(data.users).toHaveLength(1);
      expect(data.users[0].username).toBe('searchable');
    });

    it('should not include current user in search results', async () => {
      const response = await SELF.fetch('http://localhost/users/search?q=testuser', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { users: Array<{ username: string }> };
      expect(data.users).toHaveLength(0);
    });

    it('should return empty array when no matches', async () => {
      const response = await SELF.fetch('http://localhost/users/search?q=nonexistent', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { users: unknown[] };
      expect(data.users).toHaveLength(0);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await SELF.fetch('http://localhost/users/search?q=test');
      expect(response.status).toBe(401);
    });

    it('should reject empty query', async () => {
      const response = await SELF.fetch('http://localhost/users/search?q=', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(response.status).toBe(400);
    });

    it('should reject missing query parameter', async () => {
      const response = await SELF.fetch('http://localhost/users/search', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(response.status).toBe(400);
    });

    it('should search multiple users', async () => {
      // Create multiple users
      await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice_user',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice_admin',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });

      const response = await SELF.fetch('http://localhost/users/search?q=alice', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { users: Array<{ username: string }> };
      expect(data.users).toHaveLength(2);
    });
  });
});
