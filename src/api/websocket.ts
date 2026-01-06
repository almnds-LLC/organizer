import { api } from './client';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Decode JWT payload to check expiration (JWT is just base64url encoded JSON)
function isTokenExpired(token: string, bufferSeconds = 60): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    // Decode base64url payload
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return true;

    // Check if expired (with buffer for clock skew)
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now + bufferSeconds;
  } catch {
    return true;
  }
}

// Convert HTTP URL to WebSocket URL
function getWsUrl(roomId: string, token: string): string {
  const base = API_BASE.replace(/^http/, 'ws') || `ws://${window.location.host}`;
  return `${base}/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`;
}

export type SyncMessage =
  // Drawer operations
  | { type: 'drawer_created'; drawer: SyncDrawer }
  | { type: 'drawer_updated'; drawerId: string; changes: Partial<SyncDrawerUpdate> }
  | { type: 'drawer_deleted'; drawerId: string }

  // Compartment operations
  | { type: 'compartment_updated'; drawerId: string; compartmentId: string; changes: { dividerOrientation?: 'horizontal' | 'vertical' } }
  | { type: 'dividers_changed'; drawerId: string; compartmentId: string; subCompartments: SyncSubCompartment[] }

  // Sub-compartment/item operations
  | { type: 'item_updated'; drawerId: string; compartmentId: string; subCompartmentId: string; item: SyncItem | null }
  | { type: 'items_batch_updated'; drawerId: string; updates: Array<{ compartmentId: string; subCompartmentId: string; item: SyncItem | null }> }

  // Category operations
  | { type: 'category_created'; category: SyncCategory }
  | { type: 'category_updated'; categoryId: string; changes: Partial<SyncCategory> }
  | { type: 'category_deleted'; categoryId: string }

  // Presence
  | { type: 'user_joined'; userId: string; username: string }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_move'; userId: string; position: { x: number; y: number } }

  // Membership
  | { type: 'member_removed'; userId: string; roomId: string }

  // WebRTC signaling (outgoing: has targetUserId; incoming: has senderId)
  | { type: 'rtc_offer'; targetUserId?: string; senderId?: string; senderUsername?: string; sdp: RTCSessionDescriptionInit }
  | { type: 'rtc_answer'; targetUserId?: string; senderId?: string; sdp: RTCSessionDescriptionInit }
  | { type: 'rtc_ice_candidate'; targetUserId?: string; senderId?: string; candidate: RTCIceCandidateInit }

  // Error
  | { type: 'error'; message: string };

interface SyncDrawer {
  id: string;
  name: string;
  rows: number;
  cols: number;
  gridX: number;
  gridY: number;
  sortOrder: number;
  compartments: SyncCompartment[];
}

interface SyncCompartment {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  dividerOrientation: 'horizontal' | 'vertical';
  subCompartments: SyncSubCompartment[];
}

interface SyncSubCompartment {
  id: string;
  relativeSize: number;
  sortOrder: number;
  item: SyncItem | null;
}

interface SyncItem {
  label: string;
  categoryId?: string;
  quantity?: number;
}

interface SyncCategory {
  id: string;
  name: string;
  colorIndex?: number;
  color?: string;
}

interface SyncDrawerUpdate {
  name?: string;
  gridX?: number;
  gridY?: number;
}

// Connected users
interface ConnectedUser {
  userId: string;
  username: string;
}

type MessageHandler = (message: SyncMessage) => void;
type ConnectionHandler = (connected: boolean) => void;
type UsersHandler = (users: ConnectedUser[]) => void;

class RoomWebSocket {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private usersHandlers: Set<UsersHandler> = new Set();
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private hasConnectedOnce = false;
  private authFailed = false;

  connect(roomId: string): void {
    // Start async connection process
    this.connectAsync(roomId).catch((error) => {
      console.error('WebSocket connection failed:', error);
    });
  }

  private async connectAsync(roomId: string): Promise<void> {
    // Get current token and check if it needs refresh
    let token = api.getToken();

    if (!token || isTokenExpired(token)) {
      // Token missing or expired, try to refresh
      token = await api.refreshToken();
      if (!token) {
        console.warn('No auth token, cannot connect to WebSocket');
        return;
      }
    }

    // Don't try to connect if auth previously failed for this room
    if (this.authFailed && this.roomId === roomId) {
      console.warn('WebSocket auth previously failed, not reconnecting');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN && this.roomId === roomId) {
      return; // Already connected to this room
    }

    // Close existing connection without resetting reconnect state
    this.closeConnection();

    // Reset auth failed flag if connecting to a different room
    if (this.roomId !== roomId) {
      this.authFailed = false;
      this.hasConnectedOnce = false;
    }

    this.roomId = roomId;
    this.connectedUsers.clear();

    const wsUrl = getWsUrl(roomId, token);
    console.log('WebSocket connecting to:', roomId);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected to room:', roomId);
      this.reconnectAttempts = 0;
      this.hasConnectedOnce = true;
      this.authFailed = false;
      this.notifyConnectionHandlers(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      this.notifyConnectionHandlers(false);

      // If we never connected successfully and got an abnormal closure,
      // it's likely an auth error (401 during handshake)
      if (!this.hasConnectedOnce && event.code === 1006) {
        console.log('WebSocket failed to connect (likely auth error), not reconnecting');
        this.authFailed = true;
        return;
      }

      // Only reconnect if we previously connected successfully and this was unexpected
      if (this.hasConnectedOnce && !event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts && this.roomId) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private closeConnection(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.roomId = null;
    this.reconnectAttempts = 0;
    this.hasConnectedOnce = false;
    this.authFailed = false;
    this.connectedUsers.clear();
    this.notifyConnectionHandlers(false);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.roomId) {
        this.connect(this.roomId);
      }
    }, delay);
  }

  send(message: SyncMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  private handleMessage(message: SyncMessage): void {
    // Handle presence messages internally
    if (message.type === 'user_joined') {
      this.connectedUsers.set(message.userId, {
        userId: message.userId,
        username: message.username,
      });
      this.notifyUsersHandlers();
    } else if (message.type === 'user_left') {
      this.connectedUsers.delete(message.userId);
      this.notifyUsersHandlers();
    }

    // Notify all handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  // Subscribe to messages
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  // Subscribe to connection state changes
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  // Subscribe to connected users changes
  onUsersChange(handler: UsersHandler): () => void {
    this.usersHandlers.add(handler);
    // Immediately call with current users
    handler(Array.from(this.connectedUsers.values()));
    return () => this.usersHandlers.delete(handler);
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  private notifyUsersHandlers(): void {
    const users = Array.from(this.connectedUsers.values());
    this.usersHandlers.forEach(handler => {
      try {
        handler(users);
      } catch (error) {
        console.error('Error in users handler:', error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectedUsers(): ConnectedUser[] {
    return Array.from(this.connectedUsers.values());
  }
}

export const roomWebSocket = new RoomWebSocket();
