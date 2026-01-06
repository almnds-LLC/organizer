import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupDatabase, cleanDatabase } from './setup';

describe('Categories API', () => {
  let ownerToken: string;
  let roomId: string;

  beforeAll(async () => {
    await setupDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    // Create owner user
    const ownerResponse = await SELF.fetch('http://localhost/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'owner',
        password: 'password123',
        turnstileToken: 'test-token',
      }),
    });
    const ownerData = await ownerResponse.json() as { accessToken: string; user: { id: string } };
    ownerToken = ownerData.accessToken;

    // Get owner's default room
    const roomsResponse = await SELF.fetch('http://localhost/rooms', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const roomsData = await roomsResponse.json() as { rooms: Array<{ id: string }> };
    roomId = roomsData.rooms[0].id;
  });

  describe('GET /rooms/:roomId/categories', () => {
    it('should return empty list when no categories', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { categories: unknown[] };
      expect(data.categories).toEqual([]);
    });

    it('should return list of categories', async () => {
      // Create some categories first
      await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Electronics', colorIndex: 0 }),
      });

      await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Kitchen', colorIndex: 1 }),
      });

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { categories: Array<{ name: string }> };
      expect(data.categories).toHaveLength(2);
      expect(data.categories.map((c) => c.name).sort()).toEqual(['Electronics', 'Kitchen']);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`);
      expect(response.status).toBe(401);
    });

    it('should return 404 when room does not exist', async () => {
      const response = await SELF.fetch('http://localhost/rooms/non-existent-room/categories', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(response.status).toBe(404);
    });
  });

  describe('POST /rooms/:roomId/categories', () => {
    it('should create category with colorIndex', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Office Supplies', colorIndex: 3 }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { category: { id: string; name: string; colorIndex: number } };
      expect(data.category.name).toBe('Office Supplies');
      expect(data.category.colorIndex).toBe(3);
      expect(data.category.id).toBeDefined();
    });

    it('should create category with custom color', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Custom Color', color: '#ff5500' }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { category: { name: string; color: string } };
      expect(data.category.name).toBe('Custom Color');
      expect(data.category.color).toBe('#ff5500');
    });

    it('should create category with name only', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Minimal Category' }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { category: { name: string } };
      expect(data.category.name).toBe('Minimal Category');
    });

    it('should return 400 for invalid colorIndex', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Bad Index', colorIndex: 15 }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid color format', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Bad Color', color: 'invalid' }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for empty name', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Category' }),
      });

      expect(response.status).toBe(401);
    });

    it('should return 404 when room does not exist', async () => {
      const response = await SELF.fetch('http://localhost/rooms/non-existent-room/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Test Category' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /rooms/:roomId/categories/:categoryId', () => {
    let categoryId: string;

    beforeEach(async () => {
      // Create a category to update
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Original Name', colorIndex: 0 }),
      });
      const createData = await createResponse.json() as { category: { id: string } };
      categoryId = createData.category.id;
    });

    it('should update category name', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { category: { name: string; colorIndex: number } };
      expect(data.category.name).toBe('Updated Name');
      expect(data.category.colorIndex).toBe(0); // Preserved
    });

    it('should update colorIndex', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ colorIndex: 5 }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { category: { colorIndex: number } };
      expect(data.category.colorIndex).toBe(5);
    });

    it('should update custom color', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ color: '#123456' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { category: { color: string } };
      expect(data.category.color).toBe('#123456');
    });

    it('should set colorIndex to null', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ colorIndex: null }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { category: { colorIndex: number | null } };
      expect(data.category.colorIndex).toBeNull();
    });

    it('should return 404 for non-existent category', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/non-existent-id`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(response.status).toBe(404);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /rooms/:roomId/categories/:categoryId', () => {
    let categoryId: string;

    beforeEach(async () => {
      // Create a category to delete
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'To Be Deleted' }),
      });
      const createData = await createResponse.json() as { category: { id: string } };
      categoryId = createData.category.id;
    });

    it('should delete category', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);

      // Verify category is gone
      const listResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const listData = await listResponse.json() as { categories: unknown[] };
      expect(listData.categories).toHaveLength(0);
    });

    it('should return 404 for non-existent category', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/non-existent-id`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(404);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${categoryId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Role-based access control', () => {
    let editorToken: string;
    let viewerToken: string;

    beforeEach(async () => {
      // Create editor user
      const editorResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'editor',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const editorData = await editorResponse.json() as { accessToken: string };

      // Invite editor
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'editor', role: 'editor' }),
      });

      // Accept invitation
      let invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${editorData.accessToken}` },
      });
      let invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitationsData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editorData.accessToken}` },
      });
      editorToken = editorData.accessToken;

      // Create viewer user
      const viewerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'viewer',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const viewerData = await viewerResponse.json() as { accessToken: string };

      // Invite viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Accept invitation
      invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerData.accessToken}` },
      });
      invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitationsData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerData.accessToken}` },
      });
      viewerToken = viewerData.accessToken;
    });

    it('editor should be able to create categories', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({ name: 'Editor Category' }),
      });

      expect(response.status).toBe(201);
    });

    it('viewer should be able to read categories', async () => {
      // Create a category first
      await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Test Category' }),
      });

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { categories: unknown[] };
      expect(data.categories).toHaveLength(1);
    });

    it('viewer should NOT be able to create categories', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({ name: 'Viewer Category' }),
      });

      expect(response.status).toBe(403);
    });

    it('viewer should NOT be able to update categories', async () => {
      // Create a category as owner
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Test Category' }),
      });
      const createData = await createResponse.json() as { category: { id: string } };

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${createData.category.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({ name: 'Updated by Viewer' }),
      });

      expect(response.status).toBe(403);
    });

    it('viewer should NOT be able to delete categories', async () => {
      // Create a category as owner
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ name: 'Test Category' }),
      });
      const createData = await createResponse.json() as { category: { id: string } };

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/categories/${createData.category.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(response.status).toBe(403);
    });
  });
});
