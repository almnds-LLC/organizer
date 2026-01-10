import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export const cameraControlsState = {
  blockPan: false,
  controlsRef: null as OrbitControlsType | null,
  domElement: null as HTMLElement | null,
};

export function setBlockCameraPan(block: boolean): void {
  cameraControlsState.blockPan = block;
  if (cameraControlsState.controlsRef) {
    cameraControlsState.controlsRef.enabled = !block;
  }
}

export function forceStopPan(): void {
  cameraControlsState.blockPan = true;

  const controls = cameraControlsState.controlsRef;
  const domElement = cameraControlsState.domElement;

  if (controls) {
    controls.enabled = false;
  }

  if (domElement) {
    const cancelEvent = new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
    });
    domElement.dispatchEvent(cancelEvent);
  }
}

export function setCameraControlsRef(controls: OrbitControlsType | null, domElement?: HTMLElement | null): void {
  cameraControlsState.controlsRef = controls;
  if (domElement !== undefined) {
    cameraControlsState.domElement = domElement;
  }
}
