const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

// Convert HTTP URL to WebSocket URL (cookies are sent automatically)
function getWsUrl(roomId: string): string {
  const base = API_BASE.replace(/^http/, 'ws') || `ws://${window.location.host}/api`;
  return `${base}/rooms/${roomId}/ws`;
}

export type SyncMessage =
  // Drawer operations
  | { type: 'drawer_created'; drawer: SyncDrawer }
  | { type: 'drawer_updated'; drawerId: string; changes: Partial<SyncDrawerUpdate> }
  | { type: 'drawer_deleted'; drawerId: string }

  // Compartment operations
  | { type: 'compartment_updated'; drawerId: string; compartmentId: string; changes: { dividerOrientation?: 'horizontal' | 'vertical' } }
  | { type: 'dividers_changed'; drawerId: string; compartmentId: string; subCompartments: SyncSubCompartment[] }
  | { type: 'compartments_merged'; drawerId: string; deletedIds: string[]; newCompartment: SyncCompartment }
  | { type: 'compartment_split'; drawerId: string; deletedId: string; newCompartments: SyncCompartment[] }

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
  rows?: number;
  cols?: number;
  gridX?: number;
  gridY?: number;
  compartmentWidth?: number;
  compartmentHeight?: number;
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
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private usersHandlers: Set<UsersHandler> = new Set();
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private hasConnectedOnce = false;
  private authFailed = false;

  connect(roomId: string): void {
    this.connectAsync(roomId).catch(() => {});
  }

  private async connectAsync(roomId: string): Promise<void> {
    if (this.authFailed && this.roomId === roomId) {
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

    const wsUrl = getWsUrl(roomId);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
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
      this.notifyConnectionHandlers(false);

      if (!this.hasConnectedOnce && event.code === 1006) {
        this.authFailed = true;
        return;
      }

      if (this.hasConnectedOnce && !event.wasClean && this.roomId) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {};
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
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 45000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      if (this.roomId) {
        this.connect(this.roomId);
      }
    }, delay);
  }

  send(message: SyncMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
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

    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('WebSocket message handler error:', error);
      }
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onUsersChange(handler: UsersHandler): () => void {
    this.usersHandlers.add(handler);
    handler(Array.from(this.connectedUsers.values()));
    return () => this.usersHandlers.delete(handler);
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('WebSocket connection handler error:', error);
      }
    });
  }

  private notifyUsersHandlers(): void {
    const users = Array.from(this.connectedUsers.values());
    this.usersHandlers.forEach(handler => {
      try {
        handler(users);
      } catch (error) {
        console.error('WebSocket users handler error:', error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectedUsers(): ConnectedUser[] {
    return Array.from(this.connectedUsers.values());
  }

  // Try to reconnect immediately (e.g., when browser comes back online)
  tryReconnect(): void {
    if (this.isConnected() || !this.roomId || this.authFailed) {
      return;
    }
    // Clear any pending reconnect timeout and try immediately
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
    this.connect(this.roomId);
  }
}

export const roomWebSocket = new RoomWebSocket();
