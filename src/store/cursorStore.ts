import { create } from 'zustand';

interface RemoteCursor {
  userId: string;
  username: string;
  // World coordinates (shared across clients)
  worldX: number;
  worldY: number;
  // Screen coordinates (calculated locally for rendering)
  screenX: number;
  screenY: number;
  drawerId?: string;
  compartmentId?: string;
  // Selected compartments for mass selection highlight
  selectedCompartmentIds?: string[];
  lastUpdate: number;
  color: string;
}

const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface CursorState {
  remoteCursors: Map<string, RemoteCursor>;
  cursorColors: Map<string, string>;
  updateCursor: (userId: string, username: string, position: { worldX: number; worldY: number; drawerId?: string; compartmentId?: string; selectedCompartmentIds?: string[] } | null) => void;
  updateScreenPositions: (projectFn: (worldX: number, worldY: number) => { screenX: number; screenY: number }) => void;
  getCursorColor: (userId: string) => string;
  clearAllCursors: () => void;
}

export const useCursorStore = create<CursorState>((set, get) => ({
  remoteCursors: new Map(),
  cursorColors: new Map(),

  updateCursor: (userId, username, position) => {
    set((state) => {
      const newCursors = new Map(state.remoteCursors);

      if (position === null) {
        newCursors.delete(userId);
      } else {
        let color = state.cursorColors.get(userId);
        if (!color) {
          color = CURSOR_COLORS[hashString(userId) % CURSOR_COLORS.length];
          state.cursorColors.set(userId, color);
        }

        const existing = newCursors.get(userId);
        newCursors.set(userId, {
          userId,
          username,
          worldX: position.worldX,
          worldY: position.worldY,
          // Keep existing screen position until projection updates it
          screenX: existing?.screenX ?? 0,
          screenY: existing?.screenY ?? 0,
          drawerId: position.drawerId,
          compartmentId: position.compartmentId,
          selectedCompartmentIds: position.selectedCompartmentIds,
          lastUpdate: Date.now(),
          color,
        });
      }

      return { remoteCursors: newCursors };
    });
  },

  updateScreenPositions: (projectFn) => {
    const state = get();
    let hasChanges = false;
    const newCursors = new Map<string, RemoteCursor>();

    for (const [userId, cursor] of state.remoteCursors) {
      const { screenX, screenY } = projectFn(cursor.worldX, cursor.worldY);
      // Only update if position changed (with small threshold to avoid floating point issues)
      const changed = Math.abs(cursor.screenX - screenX) > 0.5 || Math.abs(cursor.screenY - screenY) > 0.5;
      if (changed) {
        hasChanges = true;
        newCursors.set(userId, { ...cursor, screenX, screenY });
      } else {
        newCursors.set(userId, cursor);
      }
    }

    // Only update store if something changed
    if (hasChanges) {
      set({ remoteCursors: newCursors });
    }
  },

  getCursorColor: (userId) => {
    const { cursorColors } = get();
    const existingColor = cursorColors.get(userId);
    if (existingColor) return existingColor;

    // Generate consistent color from userId hash
    return CURSOR_COLORS[hashString(userId) % CURSOR_COLORS.length];
  },

  clearAllCursors: () => {
    set({ remoteCursors: new Map() });
  },
}));
