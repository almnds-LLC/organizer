import { MapControls } from '@react-three/drei';
import { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import * as THREE from 'three';
import { cameraControlsState, setCameraControlsRef } from '../../utils/cameraControlsRef';

const CAMERA_STORAGE_KEY = 'drawer-organizer-pan';

interface PanState {
  x: number;
  y: number;
  zoom: number;
}

function savePanState(state: PanState) {
  localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(state));
}

function loadPanState(): PanState | null {
  const stored = localStorage.getItem(CAMERA_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

const CAMERA_DISTANCE = 12;
const POLAR_ANGLE = (70 * Math.PI) / 180; // 70 degrees from vertical
const CAMERA_BOUND_PADDING = 8;

interface CameraControllerProps {
  initialCenter: [number, number, number];
  isDragging?: boolean;
  sceneBounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export function CameraController({ initialCenter, isDragging = false, sceneBounds }: CameraControllerProps) {
  const controlsRef = useRef<OrbitControlsType>(null);
  const { camera, gl } = useThree();
  const initializedRef = useRef(false);
  const allowSaveRef = useRef(false);

  useEffect(() => {
    if (controlsRef.current) {
      setCameraControlsRef(controlsRef.current, gl.domElement);
    }
    return () => setCameraControlsRef(null, null);
  }, [gl.domElement]);

  useFrame(() => {
    if (controlsRef.current) {
      const shouldBlock = cameraControlsState.blockPan || isDragging;
      if (controlsRef.current.enabled === shouldBlock) {
        controlsRef.current.enabled = !shouldBlock;
      }
    }
  });

  const clampToSceneBounds = useCallback((x: number, y: number): { x: number; y: number } => {
    if (!sceneBounds) return { x, y };

    const minX = sceneBounds.minX - CAMERA_BOUND_PADDING;
    const maxX = sceneBounds.maxX + CAMERA_BOUND_PADDING;
    const minY = sceneBounds.minY - CAMERA_BOUND_PADDING;
    const maxY = sceneBounds.maxY + CAMERA_BOUND_PADDING;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, [sceneBounds]);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!controlsRef.current) return;

    initializedRef.current = true;

    const savedPan = loadPanState();
    let panX = initialCenter[0];
    let panY = initialCenter[1];
    let savedZoom = null;

    if (savedPan) {
      const clamped = clampToSceneBounds(savedPan.x, savedPan.y);
      panX = clamped.x;
      panY = clamped.y;
      savedZoom = savedPan.zoom;
    }

    controlsRef.current.target.set(panX, panY, 0);

    const zOffset = Math.sin(POLAR_ANGLE) * CAMERA_DISTANCE;
    const yOffset = Math.cos(POLAR_ANGLE) * CAMERA_DISTANCE;
    camera.position.set(panX, panY - yOffset, zOffset);

    controlsRef.current.update();

    if (savedZoom && 'zoom' in camera) {
      // eslint-disable-next-line react-hooks/immutability
      (camera as { zoom: number }).zoom = savedZoom;
      camera.updateProjectionMatrix();
    }

    requestAnimationFrame(() => {
      allowSaveRef.current = true;
    });
  });

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!controlsRef.current) return;

      const isPinchGesture = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInPanel = target.closest('.panel-inner, .unified-panel-desktop, .modal-content');

      if (isInPanel && !isPinchGesture) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const orthoCamera = camera as { zoom: number };
      const currentZoom = orthoCamera.zoom || 50;

      const isMouseWheel = e.deltaMode === 1 ||
        (e.deltaMode === 0 && Math.abs(e.deltaY) >= 50 && e.deltaX === 0);

      if (e.ctrlKey || e.metaKey || isMouseWheel) {
        const zoomDelta = -e.deltaY * 0.005;
        const zoomFactor = Math.exp(zoomDelta);
        const newZoom = Math.max(20, Math.min(150, currentZoom * zoomFactor));

        orthoCamera.zoom = newZoom;
        camera.updateProjectionMatrix();
        controlsRef.current.update();

        if (allowSaveRef.current) {
          const target = controlsRef.current.target;
          savePanState({ x: target.x, y: target.y, zoom: newZoom });
        }
        return;
      }

      const basePanSpeed = 0.006 * (50 / currentZoom);
      const dx = e.deltaX * basePanSpeed;
      const dy = e.deltaY * basePanSpeed;

      const newX = controlsRef.current.target.x + dx;
      const newY = controlsRef.current.target.y - dy;

      const clamped = clampToSceneBounds(newX, newY);
      const actualDx = clamped.x - controlsRef.current.target.x;
      const actualDy = clamped.y - controlsRef.current.target.y;

      controlsRef.current.target.x = clamped.x;
      controlsRef.current.target.y = clamped.y;
      camera.position.x += actualDx;
      camera.position.y += actualDy;

      controlsRef.current.update();

      if (allowSaveRef.current) {
        savePanState({ x: clamped.x, y: clamped.y, zoom: currentZoom });
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [camera, clampToSceneBounds]);

  const handleChange = useCallback(() => {
    if (!controlsRef.current) return;

    const target = controlsRef.current.target;

    if (sceneBounds) {
      const clamped = clampToSceneBounds(target.x, target.y);
      if (clamped.x !== target.x || clamped.y !== target.y) {
        const dx = clamped.x - target.x;
        const dy = clamped.y - target.y;
        target.x = clamped.x;
        target.y = clamped.y;
        // eslint-disable-next-line react-hooks/immutability
        camera.position.x += dx;
        camera.position.y += dy;
        controlsRef.current.update();
      }
    }

    if (!allowSaveRef.current) return;
    const zoom = 'zoom' in camera ? (camera as { zoom: number }).zoom : 50;
    savePanState({ x: target.x, y: target.y, zoom });
  }, [camera, sceneBounds, clampToSceneBounds]);

  const AZIMUTH_ANGLE = 0;

  return (
    <MapControls
      ref={controlsRef}
      enableRotate={false}
      enableZoom={true}
      minZoom={20}
      maxZoom={150}
      minPolarAngle={POLAR_ANGLE}
      maxPolarAngle={POLAR_ANGLE}
      minAzimuthAngle={AZIMUTH_ANGLE}
      maxAzimuthAngle={AZIMUTH_ANGLE}
      panSpeed={1.5}
      screenSpacePanning={true}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      onChange={handleChange}
    />
  );
}
