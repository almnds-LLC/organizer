import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupDatabase, cleanDatabase } from './setup';

describe('Invitations API', () => {
  let ownerToken: string;
  let memberToken: string;
  let memberUserId: string;
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

    // Create member user (to be invited)
    const memberResponse = await SELF.fetch('http://localhost/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'member',
        password: 'password123',
        turnstileToken: 'test-token',
      }),
    });
    const memberData = await memberResponse.json() as { accessToken: string; user: { id: string } };
    memberToken = memberData.accessToken;
    memberUserId = memberData.user.id;
  });

  describe('POST /rooms/:roomId/invite', () => {
    it('should create an invitation for a valid user', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          username: 'member',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { invitation: { id: string; role: string } };
      expect(data.invitation).toBeDefined();
      expect(data.invitation.role).toBe('editor');
    });

    it('should create a viewer invitation', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          username: 'member',
          role: 'viewer',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { invitation: { role: string } };
      expect(data.invitation.role).toBe('viewer');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'member',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should return 404 when room does not exist', async () => {
      const response = await SELF.fetch('http://localhost/rooms/non-existent-room/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          username: 'member',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 when user to invite does not exist', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          username: 'nonexistent',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 when member tries to invite', async () => {
      // First, invite and accept as member
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });

      // Get invitations and accept
      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      const invitationId = invitationsData.invitations[0].id;

      await SELF.fetch(`http://localhost/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      expect(thirdUserResponse.status).toBe(201);

      // Now member tries to invite third user - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          username: 'thirduser',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(403);
    });

    it('should return 409 when user is already a member', async () => {
      // First invite and accept
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });

      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      const invitationId = invitationsData.invitations[0].id;

      await SELF.fetch(`http://localhost/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Try to invite again
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          username: 'member',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(409);
    });

    it('should allow owner to invite as owner', async () => {
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          username: 'member',
          role: 'owner',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as { invitation: { role: string } };
      expect(data.invitation.role).toBe('owner');
    });

    it('should prevent editor from inviting as owner (role hierarchy)', async () => {
      // First, invite member as editor with canInvite permission
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });

      // Accept the invitation
      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitationsData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Grant canInvite permission to the editor
      await SELF.fetch(`http://localhost/rooms/${roomId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ canInvite: true }),
      });

      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      expect(thirdUserResponse.status).toBe(201);

      // Editor tries to invite as owner - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          username: 'thirduser',
          role: 'owner',
        }),
      });

      expect(response.status).toBe(403);
    });

    it('should allow editor with canInvite to invite as editor', async () => {
      // First, invite member as editor
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });

      // Accept the invitation
      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitationsData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Grant canInvite permission
      await SELF.fetch(`http://localhost/rooms/${roomId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ canInvite: true }),
      });

      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      expect(thirdUserResponse.status).toBe(201);

      // Editor invites as editor - should succeed
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          username: 'thirduser',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(201);
    });

    it('should prevent viewer from inviting as editor (role hierarchy)', async () => {
      // First, invite member as viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'viewer' }),
      });

      // Accept the invitation
      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitationsData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Grant canInvite permission to the viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ canInvite: true }),
      });

      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      expect(thirdUserResponse.status).toBe(201);

      // Viewer tries to invite as editor - should fail
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          username: 'thirduser',
          role: 'editor',
        }),
      });

      expect(response.status).toBe(403);
    });

    it('should allow viewer with canInvite to invite as viewer', async () => {
      // First, invite member as viewer
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'viewer' }),
      });

      // Accept the invitation
      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: Array<{ id: string }> };
      await SELF.fetch(`http://localhost/invitations/${invitationsData.invitations[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Grant canInvite permission
      await SELF.fetch(`http://localhost/rooms/${roomId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ canInvite: true }),
      });

      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      expect(thirdUserResponse.status).toBe(201);

      // Viewer invites as viewer - should succeed
      const response = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          username: 'thirduser',
          role: 'viewer',
        }),
      });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /invitations', () => {
    it('should return empty list when no invitations', async () => {
      const response = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { invitations: unknown[] };
      expect(data.invitations).toEqual([]);
    });

    it('should return pending invitations', async () => {
      // Create invitation
      await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });

      const response = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { invitations: Array<{ roomName: string; inviterUsername: string; role: string }> };
      expect(data.invitations).toHaveLength(1);
      expect(data.invitations[0].inviterUsername).toBe('owner');
      expect(data.invitations[0].role).toBe('editor');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await SELF.fetch('http://localhost/invitations');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /invitations/:id/accept', () => {
    let invitationId: string;

    beforeEach(async () => {
      // Create invitation
      const inviteResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });
      const inviteData = await inviteResponse.json() as { invitation: { id: string } };
      invitationId = inviteData.invitation.id;
    });

    it('should accept invitation and add user to room', async () => {
      const response = await SELF.fetch(`http://localhost/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { member: { role: string } };
      expect(data.member.role).toBe('editor');

      // Verify user can now access the room
      const roomResponse = await SELF.fetch(`http://localhost/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      expect(roomResponse.status).toBe(200);
    });

    it('should return 404 for non-existent invitation', async () => {
      const response = await SELF.fetch('http://localhost/invitations/non-existent/accept', {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 when accepting invitation meant for someone else', async () => {
      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const thirdUserData = await thirdUserResponse.json() as { accessToken: string };

      // Third user tries to accept member's invitation
      const response = await SELF.fetch(`http://localhost/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${thirdUserData.accessToken}` },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /invitations/:id', () => {
    let invitationId: string;

    beforeEach(async () => {
      // Create invitation
      const inviteResponse = await SELF.fetch(`http://localhost/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ username: 'member', role: 'editor' }),
      });
      const inviteData = await inviteResponse.json() as { invitation: { id: string } };
      invitationId = inviteData.invitation.id;
    });

    it('should decline invitation', async () => {
      const response = await SELF.fetch(`http://localhost/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(response.status).toBe(200);

      // Verify invitation is removed
      const invitationsResponse = await SELF.fetch('http://localhost/invitations', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations: unknown[] };
      expect(invitationsData.invitations).toHaveLength(0);
    });

    it('should return 404 for non-existent invitation', async () => {
      const response = await SELF.fetch('http://localhost/invitations/non-existent', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 when declining invitation meant for someone else', async () => {
      // Create a third user
      const thirdUserResponse = await SELF.fetch('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'thirduser',
          password: 'password123',
          turnstileToken: 'test-token',
        }),
      });
      const thirdUserData = await thirdUserResponse.json() as { accessToken: string };

      // Third user tries to decline member's invitation
      const response = await SELF.fetch(`http://localhost/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${thirdUserData.accessToken}` },
      });

      expect(response.status).toBe(403);
    });
  });
});
