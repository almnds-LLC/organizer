import type { SyncMessage, ConnectionInfo, ForwardedRTCMessage } from './types';

interface ConnectionData extends ConnectionInfo {
  connectionId: string;
}

export class RoomSync implements DurableObject {
  private state: DurableObjectState;
  private connectionCounter = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Restore connection counter from storage to ensure unique IDs across hibernation
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<number>('connectionCounter');
      if (stored) {
        this.connectionCounter = stored;
      }
    });
  }

  private async generateConnectionId(): Promise<string> {
    this.connectionCounter++;
    // Persist counter to survive hibernation
    await this.state.storage.put('connectionCounter', this.connectionCounter);
    return `conn_${Date.now()}_${this.connectionCounter}`;
  }

  // Get connection data from a WebSocket's attachment
  private getConnectionData(ws: WebSocket): ConnectionData | null {
    try {
      return ws.deserializeAttachment() as ConnectionData | null;
    } catch {
      return null;
    }
  }

  // Get all connected WebSockets with their connection data
  private getConnections(): Array<{ ws: WebSocket; data: ConnectionData }> {
    const webSockets = this.state.getWebSockets();
    const result: Array<{ ws: WebSocket; data: ConnectionData }> = [];

    for (const ws of webSockets) {
      const data = this.getConnectionData(ws);
      if (data) {
        result.push({ ws, data });
      }
    }

    return result;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      return this.handleWebSocket(request, url);
    }

    if (url.pathname === '/connections') {
      // Return list of connected users (deduplicated by userId)
      const userMap = new Map<string, ConnectionInfo>();
      for (const { data } of this.getConnections()) {
        const { connectionId: _, ...userInfo } = data;
        userMap.set(userInfo.userId, userInfo);
      }
      const users = Array.from(userMap.values());
      return new Response(JSON.stringify({ users }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Kick a user from the room (used when member is removed)
    const kickMatch = url.pathname.match(/^\/kick-user\/(.+)$/);
    if (kickMatch && request.method === 'POST') {
      const userId = kickMatch[1];
      const roomId = url.searchParams.get('roomId') || '';
      this.kickUser(userId, roomId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    const username = url.searchParams.get('username');
    const role = url.searchParams.get('role') as 'owner' | 'admin' | 'member';

    if (!userId || !username || !role) {
      return new Response('Missing user info', { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // Generate unique connection ID (allows multiple connections per user)
    const connectionId = await this.generateConnectionId();

    // Store connection info in the WebSocket attachment (survives hibernation)
    const connectionInfo: ConnectionData = {
      connectionId,
      userId,
      username,
      role,
      connectedAt: Date.now(),
    };
    server.serializeAttachment(connectionInfo);

    // Accept the WebSocket connection (must be after serializeAttachment)
    this.state.acceptWebSocket(server);

    // Get existing connections before this one
    const existingConnections = this.getConnections();
    const userConnectionCount = existingConnections.filter(c => c.data.userId === userId).length;

    // Send existing users to the new connection (so they can establish WebRTC connections)
    const existingUsers = new Map<string, { userId: string; username: string }>();
    for (const { data } of existingConnections) {
      if (data.userId !== userId && !existingUsers.has(data.userId)) {
        existingUsers.set(data.userId, { userId: data.userId, username: data.username });
      }
    }

    // Send user_joined for each existing user to the new client
    for (const user of existingUsers.values()) {
      server.send(JSON.stringify({
        type: 'user_joined',
        userId: user.userId,
        username: user.username,
      }));
    }

    // Only notify others if this is user's first connection (the new one isn't in getConnections yet)
    if (userConnectionCount === 0) {
      this.broadcast({
        type: 'user_joined',
        userId,
        username,
      }, connectionId);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // Handle incoming WebSocket messages
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    try {
      const syncMessage = JSON.parse(message) as SyncMessage;
      const connectionInfo = this.getConnectionData(ws);

      if (!connectionInfo) {
        console.error('No connection info for WebSocket');
        return;
      }

      // Handle RTC signaling messages (forward to specific user)
      if (syncMessage.type === 'rtc_offer' || syncMessage.type === 'rtc_answer' || syncMessage.type === 'rtc_ice_candidate') {
        this.forwardRTCMessage(syncMessage, connectionInfo);
        return;
      }

      // Validate sender has permission based on message type
      if (!this.hasPermission(connectionInfo.role, syncMessage)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Permission denied' }));
        return;
      }

      // Broadcast to all other connections (including other tabs from same user)
      this.broadcast(syncMessage, connectionInfo.connectionId);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  // Forward RTC signaling messages to specific user
  private forwardRTCMessage(
    message: Extract<SyncMessage, { type: 'rtc_offer' | 'rtc_answer' | 'rtc_ice_candidate' }>,
    sender: ConnectionData
  ): void {
    const targetUserId = message.targetUserId;
    const connections = this.getConnections();

    // Find target user's connections
    const targetConnections = connections.filter(c => c.data.userId === targetUserId);

    if (targetConnections.length === 0) {
      return; // Target user not connected
    }

    // Build forwarded message with sender info
    let forwardedMessage: ForwardedRTCMessage;
    if (message.type === 'rtc_offer') {
      forwardedMessage = {
        type: 'rtc_offer',
        senderId: sender.userId,
        senderUsername: sender.username,
        sdp: message.sdp,
      };
    } else if (message.type === 'rtc_answer') {
      forwardedMessage = {
        type: 'rtc_answer',
        senderId: sender.userId,
        sdp: message.sdp,
      };
    } else {
      forwardedMessage = {
        type: 'rtc_ice_candidate',
        senderId: sender.userId,
        candidate: message.candidate,
      };
    }

    const messageStr = JSON.stringify(forwardedMessage);

    // Send to all target user's connections (they may have multiple tabs)
    for (const { ws } of targetConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Error forwarding RTC message:', error);
        }
      }
    }
  }

  // Handle WebSocket close
  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const connectionInfo = this.getConnectionData(ws);
    if (connectionInfo) {
      // Check if user has any remaining connections (excluding this one that's closing)
      const remainingConnections = this.getConnections()
        .filter(c => c.data.userId === connectionInfo.userId && c.data.connectionId !== connectionInfo.connectionId);

      // Only notify others if this was user's last connection
      if (remainingConnections.length === 0) {
        this.broadcast({
          type: 'user_left',
          userId: connectionInfo.userId,
        });
      }
    }
  }

  // Handle WebSocket errors
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    // The WebSocket will be automatically removed from state.getWebSockets() when closed
    // No need to manually track or remove
  }

  private hasPermission(role: 'owner' | 'admin' | 'member', message: SyncMessage): boolean {
    // Members can only update items (read-write access to items)
    // Admins and owners can do everything
    if (role === 'owner' || role === 'admin') {
      return true;
    }

    // Members can update items and cursors
    const memberAllowedTypes = [
      'item_updated',
      'items_batch_updated',
      'cursor_move',
    ];

    return memberAllowedTypes.includes(message.type);
  }

  private broadcast(message: SyncMessage, excludeConnectionId?: string): void {
    const messageStr = JSON.stringify(message);
    const connections = this.getConnections();

    for (const { ws, data } of connections) {
      if (data.connectionId !== excludeConnectionId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting to connection:', data.connectionId, error);
          // WebSocket will be automatically cleaned up when it closes
        }
      }
    }
  }

  private kickUser(userId: string, roomId: string): void {
    const connections = this.getConnections();
    const userConnections = connections.filter(c => c.data.userId === userId);

    // Send member_removed message to the user and close their connections
    const message: SyncMessage = { type: 'member_removed', userId, roomId };
    const messageStr = JSON.stringify(message);

    for (const { ws } of userConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
          ws.close(1000, 'Removed from room');
        } catch (error) {
          console.error('Error kicking user:', error);
        }
      }
    }

    // Notify other users that this user left
    this.broadcast({ type: 'user_left', userId });
  }
}
