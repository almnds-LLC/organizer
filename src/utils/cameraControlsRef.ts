// Shared ref for synchronously controlling camera pan state
// This bypasses React's async state updates for immediate response

import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export const cameraControlsState = {
  // When true, camera panning should be disabled
  blockPan: false,
  // Direct reference to controls for immediate manipulation
  controlsRef: null as OrbitControlsType | null,
};

export function setBlockCameraPan(block: boolean) {
  cameraControlsState.blockPan = block;
  // Immediately update controls if we have a reference
  if (cameraControlsState.controlsRef) {
    cameraControlsState.controlsRef.enabled = !block;
  }
}

export function setCameraControlsRef(controls: OrbitControlsType | null) {
  cameraControlsState.controlsRef = controls;
}
