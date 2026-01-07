import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { setBlockCameraPan } from '../../utils/cameraControlsRef';

/**
 * Intercepts touch events at the DOM level (capture phase) before MapControls
 * receives them. If a touch starts on a compartment mesh, we disable camera
 * panning immediately to allow long-press gestures to work.
 */
export function TouchInterceptor() {
  const { gl, camera, scene } = useThree();

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const touchPoint = new THREE.Vector2();

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const rect = gl.domElement.getBoundingClientRect();

      // Convert touch to normalized device coordinates
      touchPoint.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      touchPoint.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast to check if touch is on a compartment
      raycaster.setFromCamera(touchPoint, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Check if any intersected object is a compartment mesh
      const hitCompartment = intersects.some((intersect) => {
        // Walk up the parent chain to check for compartment group
        let obj: THREE.Object3D | null = intersect.object;
        while (obj) {
          if (obj.userData?.isCompartment) {
            return true;
          }
          obj = obj.parent;
        }
        return false;
      });

      if (hitCompartment) {
        // Block camera pan immediately, before MapControls sees this event
        setBlockCameraPan(true);
      }
    };

    const handleTouchEnd = () => {
      // Re-enable panning after touch ends
      // The compartment handler will manage this more precisely,
      // but this is a safety fallback
      setTimeout(() => {
        setBlockCameraPan(false);
      }, 100);
    };

    // Add listeners in capture phase to run before MapControls
    gl.domElement.addEventListener('touchstart', handleTouchStart, { capture: true });
    gl.domElement.addEventListener('touchend', handleTouchEnd, { capture: true });
    gl.domElement.addEventListener('touchcancel', handleTouchEnd, { capture: true });

    return () => {
      gl.domElement.removeEventListener('touchstart', handleTouchStart, { capture: true });
      gl.domElement.removeEventListener('touchend', handleTouchEnd, { capture: true });
      gl.domElement.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
    };
  }, [gl, camera, scene]);

  return null;
}
