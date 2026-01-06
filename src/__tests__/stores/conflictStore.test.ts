import { describe, it, expect, beforeEach } from 'vitest';
import { useConflictStore } from '../../store/conflictStore';

describe('conflictStore', () => {
  beforeEach(() => {
    useConflictStore.getState().clearAllConflicts();
  });

  describe('addConflict', () => {
    it('should add a conflict', () => {
      const { addConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        entityName: 'Test Drawer',
        localVersion: { name: 'Local Name' },
        remoteVersion: { name: 'Remote Name' },
      });

      const { conflicts, activeConflict } = useConflictStore.getState();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].entity).toBe('drawer');
      expect(conflicts[0].entityId).toBe('drawer1');
      expect(activeConflict).toBe(conflicts[0]);
    });

    it('should set first conflict as active', () => {
      const { addConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });

      const { activeConflict, conflicts } = useConflictStore.getState();
      expect(activeConflict?.id).toBe(conflicts[0].id);
    });

    it('should not change active conflict when adding subsequent conflicts', () => {
      const { addConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });

      const firstConflictId = useConflictStore.getState().activeConflict?.id;

      addConflict({
        entity: 'compartment',
        entityId: 'comp1',
        localVersion: {},
        remoteVersion: {},
      });

      expect(useConflictStore.getState().activeConflict?.id).toBe(firstConflictId);
      expect(useConflictStore.getState().conflicts).toHaveLength(2);
    });
  });

  describe('resolveConflict', () => {
    it('should remove conflict from list', () => {
      const { addConflict, resolveConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });

      const conflictId = useConflictStore.getState().conflicts[0].id;
      resolveConflict(conflictId, 'local');

      expect(useConflictStore.getState().conflicts).toHaveLength(0);
    });

    it('should move to next conflict when active is resolved', () => {
      const { addConflict, resolveConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });
      addConflict({
        entity: 'compartment',
        entityId: 'comp1',
        localVersion: {},
        remoteVersion: {},
      });

      const firstId = useConflictStore.getState().conflicts[0].id;
      const secondId = useConflictStore.getState().conflicts[1].id;

      resolveConflict(firstId, 'local');

      expect(useConflictStore.getState().activeConflict?.id).toBe(secondId);
    });

    it('should set activeConflict to null when last conflict is resolved', () => {
      const { addConflict, resolveConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });

      const conflictId = useConflictStore.getState().conflicts[0].id;
      resolveConflict(conflictId, 'remote');

      expect(useConflictStore.getState().activeConflict).toBeNull();
    });
  });

  describe('dismissConflict', () => {
    it('should remove conflict without resolution', () => {
      const { addConflict, dismissConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });

      const conflictId = useConflictStore.getState().conflicts[0].id;
      dismissConflict(conflictId);

      expect(useConflictStore.getState().conflicts).toHaveLength(0);
    });
  });

  describe('showNextConflict', () => {
    it('should set activeConflict to first conflict', () => {
      const { addConflict, showNextConflict } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });

      // Manually clear active conflict
      useConflictStore.setState({ activeConflict: null });

      showNextConflict();

      expect(useConflictStore.getState().activeConflict).not.toBeNull();
    });
  });

  describe('clearAllConflicts', () => {
    it('should remove all conflicts and clear active', () => {
      const { addConflict, clearAllConflicts } = useConflictStore.getState();

      addConflict({
        entity: 'drawer',
        entityId: 'drawer1',
        localVersion: {},
        remoteVersion: {},
      });
      addConflict({
        entity: 'compartment',
        entityId: 'comp1',
        localVersion: {},
        remoteVersion: {},
      });

      clearAllConflicts();

      const { conflicts, activeConflict } = useConflictStore.getState();
      expect(conflicts).toHaveLength(0);
      expect(activeConflict).toBeNull();
    });
  });
});
