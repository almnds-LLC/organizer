import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupDatabase, cleanDatabase } from './setup';

// Helper to register and get auth token
async function registerAndGetToken(username = 'testuser'): Promise<string> {
  const response = await SELF.fetch('http://localhost/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      turnstileToken: 'test-token',
    }),
  });
  const data = await response.json() as { accessToken: string };
  return data.accessToken;
}

// Helper to get default room ID
async function getDefaultRoomId(token: string): Promise<string> {
  const response = await SELF.fetch('http://localhost/rooms', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { rooms } = await response.json() as { rooms: Array<{ id: string }> };
  return rooms[0].id;
}

describe('Drawers API', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /rooms/:roomId/drawers', () => {
    it('should create a new drawer', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Kitchen Drawer',
          rows: 4,
          cols: 3,
          gridX: 0,
          gridY: 0,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as {
        drawer: {
          id: string;
          name: string;
          rows: number;
          cols: number;
          compartments: unknown[];
        };
      };
      expect(data.drawer.name).toBe('Kitchen Drawer');
      expect(data.drawer.rows).toBe(4);
      expect(data.drawer.cols).toBe(3);
      expect(data.drawer.compartments).toHaveLength(12); // 4 * 3 = 12 compartments
    });

    it('should create compartments with sub-compartments', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Test Drawer',
          rows: 2,
          cols: 2,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as {
        drawer: {
          compartments: Array<{
            id: string;
            row: number;
            col: number;
            subCompartments: Array<{ id: string }>;
          }>;
        };
      };

      // Each compartment should have at least one sub-compartment
      for (const compartment of data.drawer.compartments) {
        expect(compartment.subCompartments.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should reject invalid dimensions', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Invalid Drawer',
          rows: 0,
          cols: -1,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should use default dimensions when not specified', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Default Size Drawer',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as {
        drawer: { rows: number; cols: number; compartments: unknown[] };
      };
      expect(data.drawer.rows).toBe(2); // Default
      expect(data.drawer.cols).toBe(2); // Default
      expect(data.drawer.compartments).toHaveLength(4); // 2 * 2
    });
  });

  describe('GET /rooms/:roomId/drawers/:drawerId', () => {
    it('should return drawer with compartments', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Test Drawer',
          rows: 3,
          cols: 2,
        }),
      });
      const { drawer: created } = await createResponse.json() as { drawer: { id: string } };

      // Get the drawer
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers/${created.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as {
        drawer: {
          id: string;
          name: string;
          compartments: unknown[];
        };
      };
      expect(data.drawer.id).toBe(created.id);
      expect(data.drawer.name).toBe('Test Drawer');
      expect(data.drawer.compartments).toHaveLength(6);
    });

    it('should return 404 for non-existent drawer', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers/non-existent`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /rooms/:roomId/drawers/:drawerId', () => {
    it('should update drawer name', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Original Name',
          rows: 2,
          cols: 2,
        }),
      });
      const { drawer: created } = await createResponse.json() as { drawer: { id: string } };

      // Update the drawer
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers/${created.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { drawer: { name: string } };
      expect(data.drawer.name).toBe('Updated Name');
    });
  });

  describe('DELETE /rooms/:roomId/drawers/:drawerId', () => {
    it('should delete a drawer', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'To Delete',
          rows: 2,
          cols: 2,
        }),
      });
      const { drawer: created } = await createResponse.json() as { drawer: { id: string } };

      // Delete the drawer
      const deleteResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(deleteResponse.status).toBe(200);

      // Verify it's gone
      const getResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers/${created.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(getResponse.status).toBe(404);
    });
  });

  describe('PUT /drawers/:drawerId/compartments/:compartmentId/dividers', () => {
    it('should set divider count', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Test Drawer',
          rows: 2,
          cols: 2,
        }),
      });
      const { drawer } = await createResponse.json() as {
        drawer: {
          id: string;
          compartments: Array<{ id: string; subCompartments: unknown[] }>;
        };
      };
      const compartmentId = drawer.compartments[0].id;

      // Set divider count to 3 (creates 4 sub-compartments)
      const response = await SELF.fetch(
        `http://localhost/drawers/${drawer.id}/compartments/${compartmentId}/dividers`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ count: 3 }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json() as { subCompartments: Array<{ id: string }> };
      expect(data.subCompartments).toHaveLength(4);
    });

    it('should reduce divider count and preserve items', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Test Drawer', rows: 2, cols: 2 }),
      });
      const { drawer } = await createResponse.json() as {
        drawer: {
          id: string;
          compartments: Array<{ id: string; subCompartments: Array<{ id: string }> }>;
        };
      };
      const compartmentId = drawer.compartments[0].id;

      // First increase to 3
      await SELF.fetch(
        `http://localhost/drawers/${drawer.id}/compartments/${compartmentId}/dividers`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ count: 3 }),
        }
      );

      // Then reduce to 1
      const response = await SELF.fetch(
        `http://localhost/drawers/${drawer.id}/compartments/${compartmentId}/dividers`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ count: 1 }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json() as { subCompartments: Array<{ id: string }> };
      expect(data.subCompartments).toHaveLength(2);
    });

    it('should return 404 for non-existent compartment', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Test', rows: 2, cols: 2 }),
      });
      const { drawer } = await createResponse.json() as { drawer: { id: string } };

      const response = await SELF.fetch(
        `http://localhost/drawers/${drawer.id}/compartments/non-existent/dividers`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ count: 2 }),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /drawers/:drawerId/sub-compartments/batch', () => {
    it('should batch update sub-compartments', async () => {
      const token = await registerAndGetToken();
      const roomId = await getDefaultRoomId(token);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Test Drawer',
          rows: 2,
          cols: 2,
        }),
      });
      const { drawer } = await createResponse.json() as {
        drawer: {
          id: string;
          compartments: Array<{
            id: string;
            subCompartments: Array<{ id: string }>;
          }>;
        };
      };

      const subCompartmentId = drawer.compartments[0].subCompartments[0].id;

      // Update sub-compartment with item (note: hyphen in sub-compartments)
      const response = await SELF.fetch(
        `http://localhost/drawers/${drawer.id}/sub-compartments/batch`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            updates: [
              {
                id: subCompartmentId,
                itemLabel: 'Spoons',
                itemQuantity: 10,
              },
            ],
          }),
        }
      );

      expect(response.status).toBe(200);

      // Verify the update
      const getResponse = await SELF.fetch(
        `http://localhost/rooms/${roomId}/drawers/${drawer.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const { drawer: updatedDrawer } = await getResponse.json() as {
        drawer: {
          compartments: Array<{
            subCompartments: Array<{
              id: string;
              itemLabel: string | null;
              itemQuantity: number | null;
            }>;
          }>;
        };
      };

      const updatedSub = updatedDrawer.compartments
        .flatMap((c) => c.subCompartments)
        .find((s) => s.id === subCompartmentId);

      expect(updatedSub?.itemLabel).toBe('Spoons');
      expect(updatedSub?.itemQuantity).toBe(10);
    });
  });

  describe('RBAC for drawers', () => {
    it('should allow editor to create a drawer', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const editorToken = await registerAndGetToken('editor');
      const roomId = await getDefaultRoomId(ownerToken);

      // Invite editor
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'editor', role: 'editor' }),
      });

      // Editor accepts invitation
      const invitesResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      const { invitations } = await invitesResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editorToken}` },
      });

      // Editor creates a drawer
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          name: 'Editor Drawer',
          rows: 2,
          cols: 2,
        }),
      });

      expect(response.status).toBe(201);
    });

    it('should prevent viewer from creating a drawer', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const viewerToken = await registerAndGetToken('viewer');
      const roomId = await getDefaultRoomId(ownerToken);

      // Invite viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Viewer accepts invitation
      const invitesResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const { invitations } = await invitesResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      // Viewer tries to create a drawer
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          name: 'Viewer Drawer',
          rows: 2,
          cols: 2,
        }),
      });

      expect(response.status).toBe(403);
    });

    it('should prevent viewer from updating items', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const viewerToken = await registerAndGetToken('viewer');
      const roomId = await getDefaultRoomId(ownerToken);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: 'Test Drawer',
          rows: 2,
          cols: 2,
        }),
      });
      const { drawer } = await createResponse.json() as {
        drawer: {
          id: string;
          compartments: Array<{
            id: string;
            subCompartments: Array<{ id: string }>;
          }>;
        };
      };
      const subCompartmentId = drawer.compartments[0].subCompartments[0].id;

      // Invite viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Viewer accepts invitation
      const invitesResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const { invitations } = await invitesResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      // Viewer tries to update item
      const response = await SELF.fetch(
        `http://localhost/drawers/${drawer.id}/sub-compartments/${subCompartmentId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${viewerToken}`,
          },
          body: JSON.stringify({
            itemLabel: 'Viewer Item',
          }),
        }
      );

      expect(response.status).toBe(403);
    });

    it('should allow viewer to read drawer contents', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const viewerToken = await registerAndGetToken('viewer');
      const roomId = await getDefaultRoomId(ownerToken);

      // Create a drawer
      const createResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: 'Test Drawer',
          rows: 2,
          cols: 2,
        }),
      });
      const { drawer } = await createResponse.json() as { drawer: { id: string } };

      // Invite viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Viewer accepts invitation
      const invitesResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const { invitations } = await invitesResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      // Viewer reads drawer
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/drawers/${drawer.id}`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { drawer: { name: string } };
      expect(data.drawer.name).toBe('Test Drawer');
    });
  });
});
