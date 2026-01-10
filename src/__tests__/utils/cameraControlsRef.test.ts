import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cameraControlsState,
  setBlockCameraPan,
  forceStopPan,
  setCameraControlsRef,
} from '../../utils/cameraControlsRef';

describe('cameraControlsRef', () => {
  beforeEach(() => {
    cameraControlsState.blockPan = false;
    cameraControlsState.controlsRef = null;
    cameraControlsState.domElement = null;
  });

  describe('setBlockCameraPan', () => {
    it('should set blockPan state to true', () => {
      setBlockCameraPan(true);
      expect(cameraControlsState.blockPan).toBe(true);
    });

    it('should set blockPan state to false', () => {
      cameraControlsState.blockPan = true;
      setBlockCameraPan(false);
      expect(cameraControlsState.blockPan).toBe(false);
    });

    it('should disable controls when blocking', () => {
      const mockControls = { enabled: true };
      cameraControlsState.controlsRef = mockControls as never;

      setBlockCameraPan(true);

      expect(mockControls.enabled).toBe(false);
    });

    it('should enable controls when unblocking', () => {
      const mockControls = { enabled: false };
      cameraControlsState.controlsRef = mockControls as never;

      setBlockCameraPan(false);

      expect(mockControls.enabled).toBe(true);
    });

    it('should not throw when controlsRef is null', () => {
      expect(() => setBlockCameraPan(true)).not.toThrow();
    });
  });

  describe('forceStopPan', () => {
    it('should set blockPan to true', () => {
      forceStopPan();
      expect(cameraControlsState.blockPan).toBe(true);
    });

    it('should disable controls', () => {
      const mockControls = { enabled: true };
      cameraControlsState.controlsRef = mockControls as never;

      forceStopPan();

      expect(mockControls.enabled).toBe(false);
    });

    it('should dispatch pointercancel event on domElement', () => {
      const dispatchEvent = vi.fn();
      const mockElement = { dispatchEvent } as unknown as HTMLElement;
      cameraControlsState.domElement = mockElement;

      forceStopPan();

      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      const event = dispatchEvent.mock.calls[0][0] as PointerEvent;
      expect(event.type).toBe('pointercancel');
      expect(event.bubbles).toBe(true);
      expect(event.cancelable).toBe(true);
    });

    it('should not throw when domElement is null', () => {
      expect(() => forceStopPan()).not.toThrow();
    });

    it('should not throw when controlsRef is null', () => {
      expect(() => forceStopPan()).not.toThrow();
    });
  });

  describe('setCameraControlsRef', () => {
    it('should set controlsRef', () => {
      const mockControls = { enabled: true };
      setCameraControlsRef(mockControls as never);

      expect(cameraControlsState.controlsRef).toBe(mockControls);
    });

    it('should set controlsRef to null', () => {
      cameraControlsState.controlsRef = { enabled: true } as never;
      setCameraControlsRef(null);

      expect(cameraControlsState.controlsRef).toBeNull();
    });

    it('should set domElement when provided', () => {
      const mockElement = document.createElement('div');
      setCameraControlsRef(null, mockElement);

      expect(cameraControlsState.domElement).toBe(mockElement);
    });

    it('should set domElement to null when explicitly passed', () => {
      cameraControlsState.domElement = document.createElement('div');
      setCameraControlsRef(null, null);

      expect(cameraControlsState.domElement).toBeNull();
    });

    it('should not change domElement when not provided', () => {
      const mockElement = document.createElement('div');
      cameraControlsState.domElement = mockElement;

      setCameraControlsRef(null);

      expect(cameraControlsState.domElement).toBe(mockElement);
    });
  });
});
