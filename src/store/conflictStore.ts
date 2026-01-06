import { create } from 'zustand';

export interface Conflict {
  id: string;
  entity: 'drawer' | 'compartment' | 'subCompartment' | 'category';
  entityId: string;
  entityName?: string;
  localVersion: Record<string, unknown>;
  remoteVersion: Record<string, unknown>;
  timestamp: number;
}

interface ConflictState {
  conflicts: Conflict[];
  activeConflict: Conflict | null;

  addConflict: (conflict: Omit<Conflict, 'id' | 'timestamp'>) => void;
  resolveConflict: (conflictId: string, choice: 'local' | 'remote') => void;
  showNextConflict: () => void;
  dismissConflict: (conflictId: string) => void;
  clearAllConflicts: () => void;
}

export const useConflictStore = create<ConflictState>((set, get) => ({
  conflicts: [],
  activeConflict: null,

  addConflict: (conflictData) => {
    const conflict: Conflict = {
      ...conflictData,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    set((state) => {
      const newConflicts = [...state.conflicts, conflict];
      return {
        conflicts: newConflicts,
        // Show this conflict if no active conflict
        activeConflict: state.activeConflict ?? conflict,
      };
    });
  },

  resolveConflict: (conflictId, _choice) => {
    const { conflicts, activeConflict } = get();
    const conflict = conflicts.find(c => c.id === conflictId);

    if (!conflict) return;

    // Remove from conflicts list
    const remainingConflicts = conflicts.filter(c => c.id !== conflictId);

    // If this was the active conflict, show next one
    const nextConflict = activeConflict?.id === conflictId
      ? remainingConflicts[0] ?? null
      : activeConflict;

    set({
      conflicts: remainingConflicts,
      activeConflict: nextConflict,
    });
  },

  showNextConflict: () => {
    const { conflicts } = get();
    set({ activeConflict: conflicts[0] ?? null });
  },

  dismissConflict: (conflictId) => {
    set((state) => {
      const remainingConflicts = state.conflicts.filter(c => c.id !== conflictId);
      const nextConflict = state.activeConflict?.id === conflictId
        ? remainingConflicts[0] ?? null
        : state.activeConflict;
      return {
        conflicts: remainingConflicts,
        activeConflict: nextConflict,
      };
    });
  },

  clearAllConflicts: () => {
    set({ conflicts: [], activeConflict: null });
  },
}));
