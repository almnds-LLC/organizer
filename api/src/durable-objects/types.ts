// Sync message types for real-time collaboration

// WebRTC types (simplified for server-side use - these are just passed through)
interface RTCSessionDescriptionInit {
  type?: string;
  sdp?: string;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
  usernameFragment?: string | null;
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

  // Presence (optional)
  | { type: 'user_joined'; userId: string; username: string }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_move'; userId: string; position: { x: number; y: number } }

  // Membership
  | { type: 'member_removed'; userId: string; roomId: string }

  // WebRTC signaling (peer-to-peer cursor sharing)
  | { type: 'rtc_offer'; targetUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'rtc_answer'; targetUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'rtc_ice_candidate'; targetUserId: string; candidate: RTCIceCandidateInit };

// Forwarded RTC signaling messages include sender info
export type ForwardedRTCMessage =
  | { type: 'rtc_offer'; senderId: string; senderUsername: string; sdp: RTCSessionDescriptionInit }
  | { type: 'rtc_answer'; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'rtc_ice_candidate'; senderId: string; candidate: RTCIceCandidateInit };

// Simplified types for sync messages
export interface SyncDrawer {
  id: string;
  name: string;
  rows: number;
  cols: number;
  gridX: number;
  gridY: number;
  sortOrder: number;
  compartments: SyncCompartment[];
}

export interface SyncCompartment {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  dividerOrientation: 'horizontal' | 'vertical';
  subCompartments: SyncSubCompartment[];
}

export interface SyncSubCompartment {
  id: string;
  relativeSize: number;
  sortOrder: number;
  item: SyncItem | null;
}

export interface SyncItem {
  label: string;
  categoryId?: string;
  quantity?: number;
}

export interface SyncCategory {
  id: string;
  name: string;
  colorIndex?: number;
  color?: string;
}

export interface SyncDrawerUpdate {
  name?: string;
  gridX?: number;
  gridY?: number;
}

// Connection metadata
export interface ConnectionInfo {
  userId: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
  connectedAt: number;
}
