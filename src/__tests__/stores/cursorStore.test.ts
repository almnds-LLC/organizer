import { describe, it, expect, beforeEach } from 'vitest';
import { useCursorStore } from '../../store/cursorStore';

describe('cursorStore', () => {
  beforeEach(() => {
    useCursorStore.getState().clearAllCursors();
  });

  describe('updateCursor', () => {
    it('should add a new cursor', () => {
      const { updateCursor } = useCursorStore.getState();

      updateCursor('user1', 'Alice', { worldX: 5.0, worldY: 3.0, drawerId: 'drawer1' });

      const cursors = useCursorStore.getState().remoteCursors;
      expect(cursors.size).toBe(1);
      expect(cursors.get('user1')).toMatchObject({
        userId: 'user1',
        username: 'Alice',
        worldX: 5.0,
        worldY: 3.0,
        drawerId: 'drawer1',
      });
    });

    it('should update existing cursor', () => {
      const { updateCursor } = useCursorStore.getState();

      updateCursor('user1', 'Alice', { worldX: 5.0, worldY: 3.0 });
      updateCursor('user1', 'Alice', { worldX: 7.0, worldY: 2.0 });

      const cursors = useCursorStore.getState().remoteCursors;
      expect(cursors.size).toBe(1);
      expect(cursors.get('user1')?.worldX).toBe(7.0);
      expect(cursors.get('user1')?.worldY).toBe(2.0);
    });

    it('should remove cursor when position is null', () => {
      const { updateCursor } = useCursorStore.getState();

      updateCursor('user1', 'Alice', { worldX: 5.0, worldY: 3.0 });
      expect(useCursorStore.getState().remoteCursors.size).toBe(1);

      updateCursor('user1', 'Alice', null);
      expect(useCursorStore.getState().remoteCursors.size).toBe(0);
    });

    it('should assign consistent colors to users', () => {
      const { updateCursor } = useCursorStore.getState();

      updateCursor('user1', 'Alice', { worldX: 5.0, worldY: 3.0 });
      const color1 = useCursorStore.getState().remoteCursors.get('user1')?.color;

      // Remove and re-add cursor
      useCursorStore.getState().clearAllCursors();
      updateCursor('user1', 'Alice', { worldX: 5.0, worldY: 3.0 });
      const color2 = useCursorStore.getState().remoteCursors.get('user1')?.color;

      expect(color1).toBe(color2);
    });
  });

  describe('updateScreenPositions', () => {
    it('should project world coordinates to screen coordinates', () => {
      const { updateCursor, updateScreenPositions } = useCursorStore.getState();

      updateCursor('user1', 'Alice', { worldX: 10.0, worldY: 5.0 });

      // Mock projection function
      updateScreenPositions((worldX, worldY) => ({
        screenX: worldX * 100,
        screenY: worldY * 100,
      }));

      const cursor = useCursorStore.getState().remoteCursors.get('user1');
      expect(cursor?.screenX).toBe(1000);
      expect(cursor?.screenY).toBe(500);
    });
  });

  describe('getCursorColor', () => {
    it('should return consistent color for same userId', () => {
      const { getCursorColor } = useCursorStore.getState();

      const color1 = getCursorColor('user123');
      const color2 = getCursorColor('user123');

      expect(color1).toBe(color2);
    });

    it('should return different colors for different users', () => {
      const { getCursorColor } = useCursorStore.getState();

      const colors = new Set([
        getCursorColor('user1'),
        getCursorColor('user2'),
        getCursorColor('user3'),
        getCursorColor('user4'),
        getCursorColor('user5'),
      ]);

      // Should have at least 2 different colors (probability is very high)
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('clearAllCursors', () => {
    it('should remove all cursors', () => {
      const { updateCursor, clearAllCursors } = useCursorStore.getState();

      updateCursor('user1', 'Alice', { worldX: 5.0, worldY: 3.0 });
      updateCursor('user2', 'Bob', { worldX: 3.0, worldY: 2.0 });
      expect(useCursorStore.getState().remoteCursors.size).toBe(2);

      clearAllCursors();
      expect(useCursorStore.getState().remoteCursors.size).toBe(0);
    });
  });
});
