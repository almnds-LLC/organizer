import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCursorStore } from '../../store/cursorStore';
import { webRTCManager } from '../../api/webrtc';
import { useDrawerStore } from '../../store/drawerStore';

// Track local cursor and broadcast world position
export function CursorTracker() {
  const { camera, gl } = useThree();
  const lastBroadcast = useRef(0);
  const raycaster = useRef(new THREE.Raycaster());
  const mouseNDC = useRef(new THREE.Vector2());
  const worldPoint = useRef(new THREE.Vector3());
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastBroadcast.current < 50) return;
      lastBroadcast.current = now;

      // Convert screen to normalized device coordinates (-1 to 1)
      const rect = gl.domElement.getBoundingClientRect();
      mouseNDC.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Cast ray from camera through mouse position
      raycaster.current.setFromCamera(mouseNDC.current, camera);

      // Find where ray intersects the z=0 plane
      const intersected = raycaster.current.ray.intersectPlane(groundPlane.current, worldPoint.current);
      if (!intersected) return;

      // Get current drawer state directly to avoid stale closures
      const { activeDrawerId, hoveredCompartmentId, selectedCompartmentIds } = useDrawerStore.getState();

      webRTCManager.broadcastCursor({
        worldX: worldPoint.current.x,
        worldY: worldPoint.current.y,
        drawerId: activeDrawerId || undefined,
        compartmentId: hoveredCompartmentId || undefined,
        selectedCompartmentIds: selectedCompartmentIds.size > 0 ? Array.from(selectedCompartmentIds) : undefined,
      });
    };

    const canvas = gl.domElement;
    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);
  }, [gl, camera]);

  return null;
}

export function CursorProjector() {
  const { camera, gl } = useThree();
  const vectorRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const { remoteCursors, updateScreenPositions } = useCursorStore.getState();
    if (remoteCursors.size === 0) return;

    const rect = gl.domElement.getBoundingClientRect();

    updateScreenPositions((worldX: number, worldY: number) => {
      vectorRef.current.set(worldX, worldY, 0);
      vectorRef.current.project(camera);

      const screenX = ((vectorRef.current.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-vectorRef.current.y + 1) / 2) * rect.height + rect.top;

      return { screenX, screenY };
    });
  });

  return null;
}
