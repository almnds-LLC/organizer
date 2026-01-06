import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupDatabase, cleanDatabase } from './setup';

describe('WebSocket API', () => {
  let accessToken: string;
  let roomId: string;

  beforeAll(async () => {
    await setupDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    // Register a user and get token + room
    const registerResponse = await SELF.fetch('http://localhost/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'password123',
        turnstileToken: 'test-token',
      }),
    });

    const registerData = await registerResponse.json() as {
      accessToken: string;
      user: { id: string };
    };
    accessToken = registerData.accessToken;

    // Get the default room
    const roomsResponse = await SELF.fetch('http://localhost/rooms', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const roomsData = await roomsResponse.json() as { rooms: Array<{ id: string }> };
    roomId = roomsData.rooms[0].id;
  });

  describe('GET /rooms/:roomId/ws - Auth checks (before DO)', () => {
    it('should return 401 when token is missing', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/ws`
      );

      expect(response.status).toBe(401);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Missing token');
    });

    it('should return 401 when token is invalid', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/ws?token=invalid-token`
      );

      expect(response.status).toBe(401);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Invalid token');
    });

    it('should return 401 when token is malformed JWT', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/ws?token=not.a.jwt`
      );

      expect(response.status).toBe(401);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Invalid token');
    });

    it('should return 404 when room does not exist', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/non-existent-room-id/ws?token=${accessToken}`
      );

      expect(response.status).toBe(404);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Room not found');
    });

    it('should return 404 when user does not have access to room', async () => {
      // Create another user
      const otherUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'otheruser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const otherUserData = await otherUserResponse.json() as { accessToken: string };

      // Try to access first user's room with second user's token
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/ws?token=${otherUserData.accessToken}`
      );

      expect(response.status).toBe(404);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Room not found');
    });
  });

  describe('GET /rooms/:roomId/ws - WebSocket upgrade (with DO)', () => {
    it('should return 101 when valid auth and proper WebSocket headers', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/ws?token=${accessToken}`,
        {
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13',
          },
        }
      );

      // Should get 101 Switching Protocols
      expect(response.status).toBe(101);
      expect(response.webSocket).toBeDefined();
    });
  });

  describe('GET /rooms/:roomId/connections', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/connections`
      );

      expect(response.status).toBe(401);
    });

    it('should return 404 when room does not exist', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/non-existent-room/connections`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 when user does not have access to room', async () => {
      // Create another user
      const otherUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'otheruser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const otherUserData = await otherUserResponse.json() as { accessToken: string };

      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/connections`,
        {
          headers: { Authorization: `Bearer ${otherUserData.accessToken}` },
        }
      );

      expect(response.status).toBe(404);
    });

    it('should return empty users list when no connections', async () => {
      const response = await SELF.fetch(
        `http://localhost/rooms/${roomId}/connections`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json() as { users: unknown[] };
      expect(data.users).toEqual([]);
    });
  });

  describe('WebSocket messaging', () => {
    // Helper to connect WebSocket and get client
    async function connectWebSocket(token: string, targetRoomId: string): Promise<WebSocket> {
      const response = await SELF.fetch(
        `http://localhost/rooms/${targetRoomId}/ws?token=${token}`,
        {
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13',
          },
        }
      );
      expect(response.status).toBe(101);
      expect(response.webSocket).toBeDefined();
      response.webSocket!.accept();
      return response.webSocket!;
    }

    // Helper to wait for a message
    function waitForMessage(ws: WebSocket, timeout = 1000): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeout);
        ws.addEventListener('message', (event) => {
          clearTimeout(timer);
          resolve(JSON.parse(event.data as string));
        }, { once: true });
      });
    }

    it('should broadcast drawer_created message to other clients', async () => {
      // Connect two clients to the same room
      const ws1 = await connectWebSocket(accessToken, roomId);
      const ws2 = await connectWebSocket(accessToken, roomId);

      // Wait a bit for connections to be established
      await new Promise(r => setTimeout(r, 50));

      // Client 1 sends a drawer_created message
      const drawerMessage = {
        type: 'drawer_created',
        drawer: {
          id: 'test-drawer-id',
          name: 'Test Drawer',
          rows: 2,
          cols: 3,
          gridX: 0,
          gridY: 0,
          sortOrder: 0,
          compartments: [],
        },
      };

      ws1.send(JSON.stringify(drawerMessage));

      // Client 2 should receive the message
      const receivedMessage = await waitForMessage(ws2);
      expect(receivedMessage).toMatchObject({
        type: 'drawer_created',
        drawer: { id: 'test-drawer-id', name: 'Test Drawer' },
      });

      ws1.close();
      ws2.close();
    });

    it('should broadcast item_updated message to other clients', async () => {
      const ws1 = await connectWebSocket(accessToken, roomId);
      const ws2 = await connectWebSocket(accessToken, roomId);

      await new Promise(r => setTimeout(r, 50));

      const itemMessage = {
        type: 'item_updated',
        drawerId: 'drawer-1',
        compartmentId: 'comp-1',
        subCompartmentId: 'sub-1',
        item: { label: 'Screws', categoryId: 'cat-1', quantity: 10 },
      };

      ws1.send(JSON.stringify(itemMessage));

      const receivedMessage = await waitForMessage(ws2);
      expect(receivedMessage).toMatchObject({
        type: 'item_updated',
        drawerId: 'drawer-1',
        item: { label: 'Screws' },
      });

      ws1.close();
      ws2.close();
    });

    it('should not echo messages back to sender', async () => {
      const ws1 = await connectWebSocket(accessToken, roomId);

      await new Promise(r => setTimeout(r, 50));

      const message = {
        type: 'drawer_updated',
        drawerId: 'drawer-1',
        changes: { name: 'New Name' },
      };

      ws1.send(JSON.stringify(message));

      // Sender should not receive their own message
      await expect(waitForMessage(ws1, 200)).rejects.toThrow('Timeout');

      ws1.close();
    });

    it('should broadcast to multiple clients', async () => {
      const ws1 = await connectWebSocket(accessToken, roomId);
      const ws2 = await connectWebSocket(accessToken, roomId);
      const ws3 = await connectWebSocket(accessToken, roomId);

      await new Promise(r => setTimeout(r, 50));

      const message = {
        type: 'category_created',
        category: { id: 'cat-new', name: 'New Category', colorIndex: 1 },
      };

      ws1.send(JSON.stringify(message));

      // Both ws2 and ws3 should receive the message
      const [msg2, msg3] = await Promise.all([
        waitForMessage(ws2),
        waitForMessage(ws3),
      ]);

      expect(msg2).toMatchObject({ type: 'category_created', category: { name: 'New Category' } });
      expect(msg3).toMatchObject({ type: 'category_created', category: { name: 'New Category' } });

      ws1.close();
      ws2.close();
      ws3.close();
    });

    it('should deny permission for viewer trying to create drawer', async () => {
      // Create a second user and invite them as viewer
      const viewerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'viewer',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const viewerData = await viewerResponse.json() as { accessToken: string; user: { id: string } };

      // Invite viewer to room by username
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Viewer accepts invitation
      const pendingResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerData.accessToken}` },
      });
      const pendingData = await pendingResponse.json() as { invitations: Array<{ id: string }> };

      await SELF.fetch(`http://localhost/invitations/${pendingData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerData.accessToken}` },
      });

      // Connect viewer to WebSocket
      const viewerWs = await connectWebSocket(viewerData.accessToken, roomId);

      await new Promise(r => setTimeout(r, 50));

      // Viewer tries to create drawer (not allowed)
      const drawerMessage = {
        type: 'drawer_created',
        drawer: { id: 'bad-drawer', name: 'Unauthorized', rows: 1, cols: 1, gridX: 0, gridY: 0, sortOrder: 0, compartments: [] },
      };

      viewerWs.send(JSON.stringify(drawerMessage));

      // Should receive error
      const errorMessage = await waitForMessage(viewerWs) as { type: string; message: string };
      expect(errorMessage.type).toBe('error');
      expect(errorMessage.message).toBe('Permission denied');

      viewerWs.close();
    });

    it('should allow viewer to update items', async () => {
      // Create a second user and invite them as viewer
      const viewerResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'vieweritem',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const viewerData = await viewerResponse.json() as { accessToken: string; user: { id: string } };

      // Invite viewer to room by username
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: 'vieweritem', role: 'viewer' }),
      });

      // Viewer accepts invitation
      const pendingResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerData.accessToken}` },
      });
      const pendingData = await pendingResponse.json() as { invitations: Array<{ id: string }> };

      await SELF.fetch(`http://localhost/invitations/${pendingData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerData.accessToken}` },
      });

      // Connect both users to WebSocket
      const ownerWs = await connectWebSocket(accessToken, roomId);
      const viewerWs = await connectWebSocket(viewerData.accessToken, roomId);

      await new Promise(r => setTimeout(r, 50));

      // Viewer sends item_updated (allowed for viewers)
      const itemMessage = {
        type: 'item_updated',
        drawerId: 'drawer-1',
        compartmentId: 'comp-1',
        subCompartmentId: 'sub-1',
        item: { label: 'Viewer Item', categoryId: null, quantity: 5 },
      };

      viewerWs.send(JSON.stringify(itemMessage));

      // Owner should receive the message (no error)
      const receivedMessage = await waitForMessage(ownerWs);
      expect(receivedMessage).toMatchObject({
        type: 'item_updated',
        item: { label: 'Viewer Item' },
      });

      ownerWs.close();
      viewerWs.close();
    });
  });
});
