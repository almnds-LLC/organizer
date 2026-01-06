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

describe('Rooms API', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('GET /rooms', () => {
    it('should return list of rooms for authenticated user', async () => {
      const token = await registerAndGetToken();

      const response = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { rooms: Array<{ id: string; name: string; isDefault: boolean }> };
      expect(data.rooms).toHaveLength(1);
      expect(data.rooms[0].name).toBe("testuser's Drawers");
      expect(data.rooms[0].isDefault).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await SELF.fetch('http://localhost/rooms');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /rooms', () => {
    it('should create a new room', async () => {
      const token = await registerAndGetToken();

      const response = await SELF.fetch('http://localhost/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Kitchen Drawers' }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { room: { id: string; name: string } };
      expect(data.room.name).toBe('Kitchen Drawers');
      expect(data.room.id).toBeTruthy();
    });

    it('should reject empty room name', async () => {
      const token = await registerAndGetToken();

      const response = await SELF.fetch('http://localhost/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /rooms/:roomId', () => {
    it('should return room with drawers and categories', async () => {
      const token = await registerAndGetToken();

      // Get the default room ID
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as {
        room: {
          id: string;
          name: string;
          drawers: unknown[];
          categories: unknown[];
          members: unknown[];
        };
      };
      expect(data.room.id).toBe(roomId);
      expect(data.room.name).toBe("testuser's Drawers");
      expect(Array.isArray(data.room.drawers)).toBe(true);
      expect(Array.isArray(data.room.categories)).toBe(true);
      expect(Array.isArray(data.room.members)).toBe(true);
    });

    it('should return 404 for non-existent room', async () => {
      const token = await registerAndGetToken();

      const response = await SELF.fetch('http://localhost/rooms/non-existent-id', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 for room user does not have access to', async () => {
      const token1 = await registerAndGetToken('user1');
      const token2 = await registerAndGetToken('user2');

      // Get user1's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${token1}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Try to access with user2's token
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token2}` },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /rooms/:roomId', () => {
    it('should update room name', async () => {
      const token = await registerAndGetToken();

      // Get the default room ID
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Updated Room Name' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { room: { name: string } };
      expect(data.room.name).toBe('Updated Room Name');
    });
  });

  describe('DELETE /rooms/:roomId', () => {
    it('should delete a non-default room when user is owner', async () => {
      const token = await registerAndGetToken();

      // Create a new room (user is automatically owner)
      const createResponse = await SELF.fetch('http://localhost/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Room to Delete' }),
      });
      const { room } = await createResponse.json() as { room: { id: string } };

      // Delete it
      const response = await SELF.fetch(`http://localhost/rooms/${room.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);

      // Verify it's gone
      const getResponse = await SELF.fetch(`http://localhost/rooms/${room.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(getResponse.status).toBe(404);
    });

    it('should return 403 when trying to delete default room', async () => {
      const token = await registerAndGetToken();

      // Get the default room ID
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string; isDefault: boolean }> };
      const defaultRoom = rooms.find(r => r.isDefault);

      if (defaultRoom) {
        const response = await SELF.fetch(`http://localhost/rooms/${defaultRoom.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        // Default room deletion should be blocked (either 400 or 403)
        expect([400, 403]).toContain(response.status);
      }
    });

    it('should return 403 when non-owner tries to delete room', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const editorToken = await registerAndGetToken('editor');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

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

      // Editor tries to delete room - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editorToken}` },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /rooms/:roomId/members', () => {
    it('should return list of room members', async () => {
      const token = await registerAndGetToken();

      // Get the default room ID
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { members: Array<{ userId: string; username: string; role: string }> };
      expect(data.members).toHaveLength(1);
      expect(data.members[0].username).toBe('testuser');
      expect(data.members[0].role).toBe('owner');
    });

    it('should return 404 for non-member trying to view members', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const otherToken = await registerAndGetToken('other');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Other user tries to view members
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /rooms/:roomId/members/:userId', () => {
    it('should allow owner to update member role', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const editorToken = await registerAndGetToken('editor');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

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

      // Get editor's userId from members
      const membersResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { members } = await membersResponse.json() as { members: Array<{ userId: string; username: string }> };
      const editorMember = members.find(m => m.username === 'editor');

      // Owner updates editor's role to viewer
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members/${editorMember!.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ role: 'viewer' }),
      });

      expect(response.status).toBe(200);
    });

    it('should prevent non-owner from updating member roles', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const editorToken = await registerAndGetToken('editor');
      const viewerToken = await registerAndGetToken('viewer');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Invite editor and viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'editor', role: 'editor' }),
      });

      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Accept invitations
      const editorInvites = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      const { invitations: eInvites } = await editorInvites.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${eInvites[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editorToken}` },
      });

      const viewerInvites = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const { invitations: vInvites } = await viewerInvites.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${vInvites[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      // Get viewer's userId
      const membersResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { members } = await membersResponse.json() as { members: Array<{ userId: string; username: string }> };
      const viewerMember = members.find(m => m.username === 'viewer');

      // Editor tries to update viewer's role - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members/${viewerMember!.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({ role: 'editor' }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /rooms/:roomId/members/:userId', () => {
    it('should allow owner to remove a member', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const editorToken = await registerAndGetToken('editor');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

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

      // Get editor's userId
      const membersResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { members } = await membersResponse.json() as { members: Array<{ userId: string; username: string }> };
      const editorMember = members.find(m => m.username === 'editor');

      // Owner removes editor
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members/${editorMember!.userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);

      // Verify editor no longer has access
      const checkResponse = await SELF.fetch(`http://localhost/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      expect(checkResponse.status).toBe(404);
    });

    it('should allow member to leave room voluntarily', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const editorToken = await registerAndGetToken('editor');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Invite editor
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'editor', role: 'editor' }),
      });

      // Editor accepts
      const invitesResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      const { invitations } = await invitesResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editorToken}` },
      });

      // Get editor's userId
      const membersResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      const { members } = await membersResponse.json() as { members: Array<{ userId: string; username: string }> };
      const editorMember = members.find(m => m.username === 'editor');

      // Editor leaves room
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members/${editorMember!.userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editorToken}` },
      });

      expect(response.status).toBe(200);
    });

    it('should prevent owner from leaving if they are the last owner', async () => {
      const ownerToken = await registerAndGetToken('owner');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Get owner's userId
      const membersResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { members } = await membersResponse.json() as { members: Array<{ userId: string }> };
      const ownerMember = members[0];

      // Owner tries to leave - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/members/${ownerMember.userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      // Should be blocked (either 400 or 403)
      expect([400, 403]).toContain(response.status);
    });
  });

  describe('GET /rooms/:roomId/invitations', () => {
    it('should return pending invitations for the room', async () => {
      const ownerToken = await registerAndGetToken('owner');
      await registerAndGetToken('invitee');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Create an invitation
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'invitee', role: 'editor' }),
      });

      // Get pending invitations
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { invitations: Array<{ inviteeUsername: string }> };
      expect(data.invitations).toHaveLength(1);
      expect(data.invitations[0].inviteeUsername).toBe('invitee');
    });

    it('should return 403 for users without invite permission', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const viewerToken = await registerAndGetToken('viewer');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Invite viewer (without canInvite permission)
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Viewer accepts
      const invitesResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const { invitations } = await invitesResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      // Viewer tries to view pending invitations - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-members', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const otherToken = await registerAndGetToken('other');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Other user tries to view invitations - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /rooms/:roomId/invitations/:invitationId', () => {
    it('should allow owner to cancel an invitation', async () => {
      const ownerToken = await registerAndGetToken('owner');
      await registerAndGetToken('invitee');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Create an invitation
      const inviteResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'invitee', role: 'editor' }),
      });
      const { invitation } = await inviteResponse.json() as { invitation: { id: string } };

      // Cancel the invitation
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations/${invitation.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);

      // Verify invitation is gone
      const invitationsResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const data = await invitationsResponse.json() as { invitations: unknown[] };
      expect(data.invitations).toHaveLength(0);
    });

    it('should return 404 for non-existent invitation', async () => {
      const ownerToken = await registerAndGetToken('owner');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Try to cancel non-existent invitation
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations/non-existent-id`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 for users without invite permission', async () => {
      const ownerToken = await registerAndGetToken('owner');
      const viewerToken = await registerAndGetToken('viewer');
      await registerAndGetToken('invitee');

      // Get owner's room
      const roomsResponse = await SELF.fetch('http://localhost/rooms', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const { rooms } = await roomsResponse.json() as { rooms: Array<{ id: string }> };
      const roomId = rooms[0].id;

      // Invite viewer (without canInvite permission)
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'viewer', role: 'viewer' }),
      });

      // Viewer accepts
      const viewerInvites = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const { invitations: vInvites } = await viewerInvites.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${vInvites[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      // Owner creates another invitation
      const inviteResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'invitee', role: 'editor' }),
      });
      const { invitation } = await inviteResponse.json() as { invitation: { id: string } };

      // Viewer tries to cancel invitation - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invitations/${invitation.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(response.status).toBe(403);
    });
  });
});
