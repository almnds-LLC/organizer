import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { setBlockCameraPan, forceStopPan } from '../../utils/cameraControlsRef';

const MOVE_THRESHOLD = 12;
const STILL_DURATION = 120;

export function TouchInterceptor() {
  const { gl, camera, scene } = useThree();
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    hitCompartment: boolean;
    stillTimer: ReturnType<typeof setTimeout> | null;
    interactionMode: boolean; // Once true, pan stays blocked until touch ends
  } | null>(null);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const touchPoint = new THREE.Vector2();

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const rect = gl.domElement.getBoundingClientRect();

      touchPoint.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      touchPoint.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(touchPoint, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      const hitCompartment = intersects.some((intersect) => {
        let obj: THREE.Object3D | null = intersect.object;
        while (obj) {
          if (obj.userData?.isCompartment) {
            return true;
          }
          obj = obj.parent;
        }
        return false;
      });

      touchStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        hitCompartment,
        stillTimer: null,
        interactionMode: false,
      };

      if (hitCompartment) {
        touchStateRef.current.stillTimer = setTimeout(() => {
          if (touchStateRef.current) {
            touchStateRef.current.interactionMode = true;
            forceStopPan();
          }
        }, STILL_DURATION);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStateRef.current || e.touches.length !== 1) return;

      if (touchStateRef.current.interactionMode) {
        return;
      }

      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStateRef.current.startX);
      const dy = Math.abs(touch.clientY - touchStateRef.current.startY);

      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
        if (touchStateRef.current.stillTimer) {
          clearTimeout(touchStateRef.current.stillTimer);
          touchStateRef.current.stillTimer = null;
        }
        setBlockCameraPan(false);
      }
    };

    const handleTouchEnd = () => {
      if (touchStateRef.current?.stillTimer) {
        clearTimeout(touchStateRef.current.stillTimer);
      }
      touchStateRef.current = null;

      setTimeout(() => {
        setBlockCameraPan(false);
      }, 100);
    };

    gl.domElement.addEventListener('touchstart', handleTouchStart, { capture: true });
    gl.domElement.addEventListener('touchmove', handleTouchMove, { capture: true, passive: true });
    gl.domElement.addEventListener('touchend', handleTouchEnd, { capture: true });
    gl.domElement.addEventListener('touchcancel', handleTouchEnd, { capture: true });

    return () => {
      gl.domElement.removeEventListener('touchstart', handleTouchStart, { capture: true });
      gl.domElement.removeEventListener('touchmove', handleTouchMove, { capture: true });
      gl.domElement.removeEventListener('touchend', handleTouchEnd, { capture: true });
      gl.domElement.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
    };
  }, [gl, camera, scene]);

  return null;
}
