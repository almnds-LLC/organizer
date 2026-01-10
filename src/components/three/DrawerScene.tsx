import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { Suspense, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DrawerGrid } from './DrawerGrid';
import { CameraController } from './CameraController';
import { CursorTracker, CursorProjector } from './CollaboratorCursors3D';
import { TouchInterceptor } from './TouchInterceptor';
import { useDrawerStore } from '../../store/drawerStore';
import type { Drawer } from '../../types/drawer';
import {
  COMPARTMENT_GAP,
  COMPARTMENT_HEIGHT,
  LABEL_STRIP_WIDTH,
  LABEL_STRIP_HEIGHT,
  NAME_LABEL_HEIGHT,
} from '../../constants/defaults';

function getDrawerCellDimensions(drawer: Drawer) {
  const widthUnits = drawer.compartmentWidth ?? 3;
  const heightUnits = drawer.compartmentHeight ?? 1;
  const compartmentWidth = widthUnits * COMPARTMENT_HEIGHT;
  const compartmentHeight = heightUnits * COMPARTMENT_HEIGHT;
  const cellWidth = compartmentWidth + COMPARTMENT_GAP;
  const cellHeight = compartmentHeight + COMPARTMENT_GAP;
  return { cellWidth, cellHeight };
}

const GRID_UNIT = COMPARTMENT_HEIGHT;

function getDrawerWorldPosition(drawer: Drawer): [number, number, number] {
  const x = drawer.gridX * GRID_UNIT;
  const y = drawer.gridY * GRID_UNIT;
  return [x, y, 0];
}

function worldToGrid(worldX: number, worldY: number): { gridX: number; gridY: number } {
  const gridX = Math.round(worldX / GRID_UNIT);
  const gridY = Math.round(worldY / GRID_UNIT);
  return { gridX, gridY };
}

function calculateSceneBounds(drawers: Drawer[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
} {
  if (drawers.length === 0) {
    return { minX: 0, maxX: 10, minY: 0, maxY: 10, centerX: 5, centerY: 5, width: 10, height: 10 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  drawers.forEach((drawer) => {
    const [x, y] = getDrawerWorldPosition(drawer);
    const { cellWidth, cellHeight } = getDrawerCellDimensions(drawer);
    const drawerWidth = drawer.cols * cellWidth;
    const drawerHeight = drawer.rows * cellHeight;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + drawerWidth);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + drawerHeight);
  });

  const padding = 1;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

interface DragState {
  drawerId: string;
  startWorldX: number;
  startWorldY: number;
  startGridX: number;
  startGridY: number;
}

function useScreenToWorld() {
  const { camera, gl } = useThree();

  return useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    const vector = new THREE.Vector3(x, y, 0);
    vector.unproject(camera);

    return { worldX: vector.x, worldY: vector.y };
  }, [camera, gl]);
}

function BackgroundPlane({
  bounds,
  dragState,
}: {
  bounds: ReturnType<typeof calculateSceneBounds>;
  dragState: DragState | null;
}) {
  const clearSelection = useDrawerStore((s) => s.clearSelection);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!pointerStartRef.current || dragState) {
      pointerStartRef.current = null;
      return;
    }

    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    const didMove = dx > 5 || dy > 5;

    if (!didMove) {
      clearSelection();
    }

    pointerStartRef.current = null;
  }, [clearSelection, dragState]);

  return (
    <mesh
      position={[bounds.centerX, bounds.centerY, -3]}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <planeGeometry args={[bounds.width + 20, bounds.height + 20]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

function DraggableDrawer({
  drawer,
  onDragStart,
  onSelect,
  onDoubleClick,
  dragState,
  currentOffset,
}: {
  drawer: Drawer;
  onDragStart: (drawerId: string, worldX: number, worldY: number) => void;
  onSelect: (drawerId: string, additive: boolean) => void;
  onDoubleClick: (drawerId: string) => void;
  dragState: DragState | null;
  currentOffset: { x: number; y: number } | null;
}) {
  const screenToWorld = useScreenToWorld();
  const isDragging = dragState?.drawerId === drawer.id;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartedRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const startEventRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const basePosition = useMemo(() => getDrawerWorldPosition(drawer), [drawer]);

  const currentPosition: [number, number, number] = useMemo(() => {
    if (isDragging && currentOffset) {
      return [
        basePosition[0] + currentOffset.x,
        basePosition[1] + currentOffset.y,
        0.1,
      ];
    }
    return basePosition;
  }, [basePosition, isDragging, currentOffset]);

  const { cellWidth, cellHeight } = getDrawerCellDimensions(drawer);
  const handleWidth = drawer.cols * cellWidth;
  const handleHeight = 0.35;
  const handleY = drawer.rows * cellHeight - cellHeight / 2 + COMPARTMENT_GAP / 2 + 0.25 + 0.15;
  const handleX = (drawer.cols - 1) * cellWidth / 2;

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    startEventRef.current = { clientX: e.clientX, clientY: e.clientY };
    dragStartedRef.current = false;

    holdTimerRef.current = setTimeout(() => {
      if (startEventRef.current) {
        const { worldX, worldY } = screenToWorld(startEventRef.current.clientX, startEventRef.current.clientY);
        onDragStart(drawer.id, worldX, worldY);
        dragStartedRef.current = true;
        document.body.style.cursor = 'grabbing';
      }
    }, 150);
  }, [drawer.id, onDragStart, screenToWorld]);

  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (!dragStartedRef.current) {
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300) {
        onDoubleClick(drawer.id);
      } else {
        onSelect(drawer.id, e.shiftKey);
      }

      lastClickTimeRef.current = now;
    }

    startEventRef.current = null;
    dragStartedRef.current = false;
  }, [drawer.id, onSelect, onDoubleClick]);

  const handlePointerLeave = useCallback(() => {
    if (!isDragging && holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, [isDragging]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  return (
    <group position={currentPosition}>
      <mesh
        position={[handleX, handleY, 0.05]}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={(e) => e.stopPropagation()}
        onPointerOver={() => { if (!isDragging) document.body.style.cursor = 'grab'; }}
        onPointerOut={() => { if (!isDragging) document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[handleWidth, handleHeight]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <DrawerGrid drawer={drawer} />
    </group>
  );
}

function DragGhost({
  drawer,
  targetGridX,
  targetGridY,
  isValid
}: {
  drawer: Drawer;
  targetGridX: number;
  targetGridY: number;
  isValid: boolean;
}) {
  const position: [number, number, number] = useMemo(() => {
    const x = targetGridX * GRID_UNIT;
    const y = targetGridY * GRID_UNIT;
    return [x, y, -0.1];
  }, [targetGridX, targetGridY]);

  const { cellWidth, cellHeight } = getDrawerCellDimensions(drawer);
  const cabinetWidth = drawer.cols * cellWidth + COMPARTMENT_GAP + LABEL_STRIP_WIDTH;
  const cabinetHeight = drawer.rows * cellHeight + COMPARTMENT_GAP + LABEL_STRIP_HEIGHT + NAME_LABEL_HEIGHT;
  const centerX = (drawer.cols - 1) * cellWidth / 2;
  const centerY = (drawer.rows - 1) * cellHeight / 2;
  const cabinetCenterX = centerX - LABEL_STRIP_WIDTH / 2;
  const cabinetCenterY = centerY + (LABEL_STRIP_HEIGHT + NAME_LABEL_HEIGHT) / 2;

  return (
    <mesh position={[position[0] + cabinetCenterX, position[1] + cabinetCenterY, position[2]]}>
      <planeGeometry args={[cabinetWidth, cabinetHeight]} />
      <meshBasicMaterial
        color={isValid ? '#22c55e' : '#ef4444'}
        transparent
        opacity={0.2}
      />
    </mesh>
  );
}

function useWindowDrag(
  dragState: DragState | null,
  onDragMove: (worldX: number, worldY: number) => void,
  onDragEnd: () => void
) {
  const screenToWorld = useScreenToWorld();

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
      onDragMove(worldX, worldY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const { worldX, worldY } = screenToWorld(touch.clientX, touch.clientY);
        onDragMove(worldX, worldY);
      }
    };

    const handleEnd = () => {
      onDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragState, screenToWorld, onDragMove, onDragEnd]);
}

function SceneContent({ drawers, bounds, initialCenter }: {
  drawers: Drawer[];
  bounds: ReturnType<typeof calculateSceneBounds>;
  initialCenter: [number, number, number];
}) {
  const drawersRecord = useDrawerStore((s) => s.drawers);
  const moveDrawerInGrid = useDrawerStore((s) => s.moveDrawerInGrid);
  const canMoveDrawerTo = useDrawerStore((s) => s.canMoveDrawerTo);
  const selectDrawer = useDrawerStore((s) => s.selectDrawer);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [currentOffset, setCurrentOffset] = useState<{ x: number; y: number } | null>(null);
  const [targetGrid, setTargetGrid] = useState<{ x: number; y: number } | null>(null);

  const handleDragStart = useCallback((drawerId: string, worldX: number, worldY: number) => {
    const drawer = drawersRecord[drawerId];
    if (!drawer) return;

    selectDrawer(drawerId, false);

    setDragState({
      drawerId,
      startWorldX: worldX,
      startWorldY: worldY,
      startGridX: drawer.gridX,
      startGridY: drawer.gridY,
    });
    setCurrentOffset({ x: 0, y: 0 });
    setTargetGrid({ x: drawer.gridX, y: drawer.gridY });
  }, [drawersRecord, selectDrawer]);

  const handleDragMove = useCallback((worldX: number, worldY: number) => {
    if (!dragState) return;

    const drawer = drawersRecord[dragState.drawerId];
    if (!drawer) return;

    const offsetX = worldX - dragState.startWorldX;
    const offsetY = worldY - dragState.startWorldY;

    setCurrentOffset({ x: offsetX, y: offsetY });

    const basePos = getDrawerWorldPosition(drawer);
    const newWorldX = basePos[0] + offsetX;
    const newWorldY = basePos[1] + offsetY;
    const { gridX, gridY } = worldToGrid(newWorldX, newWorldY);

    setTargetGrid({ x: gridX, y: gridY });
  }, [dragState, drawersRecord]);

  const handleDragEnd = useCallback(() => {
    if (dragState && targetGrid) {
      const canMove = canMoveDrawerTo(dragState.drawerId, targetGrid.x, targetGrid.y);
      if (canMove) {
        moveDrawerInGrid(dragState.drawerId, targetGrid.x, targetGrid.y);
      }
    }
    setDragState(null);
    setCurrentOffset(null);
    setTargetGrid(null);
    document.body.style.cursor = 'default';
  }, [dragState, targetGrid, canMoveDrawerTo, moveDrawerInGrid]);

  useWindowDrag(dragState, handleDragMove, handleDragEnd);

  const handleDrawerSelect = useCallback((drawerId: string, additive: boolean) => {
    selectDrawer(drawerId, additive);
  }, [selectDrawer]);

  const navigateToDrawer = useDrawerStore((s) => s.navigateToDrawer);

  const handleDrawerDoubleClick = useCallback((drawerId: string) => {
    navigateToDrawer(drawerId);
  }, [navigateToDrawer]);

  const draggingDrawer = dragState ? drawersRecord[dragState.drawerId] : null;
  const isTargetValid = dragState && targetGrid ?
    canMoveDrawerTo(dragState.drawerId, targetGrid.x, targetGrid.y) : false;

  return (
    <>
      <CameraController
        initialCenter={initialCenter}
        isDragging={dragState !== null}
        sceneBounds={{
          minX: bounds.minX,
          maxX: bounds.maxX,
          minY: bounds.minY,
          maxY: bounds.maxY,
        }}
      />
      <TouchInterceptor />

      <BackgroundPlane
        bounds={bounds}
        dragState={dragState}
      />

      {dragState && draggingDrawer && targetGrid && (
        <DragGhost
          drawer={draggingDrawer}
          targetGridX={targetGrid.x}
          targetGridY={targetGrid.y}
          isValid={isTargetValid}
        />
      )}

      {drawers.map((drawer) => (
        <DraggableDrawer
          key={drawer.id}
          drawer={drawer}
          onDragStart={handleDragStart}
          onSelect={handleDrawerSelect}
          onDoubleClick={handleDrawerDoubleClick}
          dragState={dragState}
          currentOffset={dragState?.drawerId === drawer.id ? currentOffset : null}
        />
      ))}

      <CursorTracker />
      <CursorProjector />
    </>
  );
}

export function DrawerScene() {
  const drawersRecord = useDrawerStore((s) => s.drawers);
  const drawerOrder = useDrawerStore((s) => s.drawerOrder);

  const drawers = useMemo(
    () => drawerOrder.map((id) => drawersRecord[id]).filter(Boolean),
    [drawersRecord, drawerOrder]
  );

  const bounds = useMemo(() => calculateSceneBounds(drawers), [drawers]);

  const [initialCamera] = useState<{ center: [number, number, number]; zoom: number } | null>(() => {
    if (drawers.length === 0) return null;
    const maxDimension = Math.max(bounds.width, bounds.height);
    return {
      center: [bounds.centerX, bounds.centerY, 0],
      zoom: Math.min(100, 80 / (maxDimension / 4)),
    };
  });

  const initialCenter = initialCamera?.center || [bounds.centerX, bounds.centerY, 0] as [number, number, number];
  const zoom = initialCamera?.zoom || 50;

  if (drawers.length === 0) {
    return (
      <div className="drawer-scene-empty">
        <p>No drawers. Click + to add one.</p>
      </div>
    );
  }

  return (
    <div className="drawer-scene">
      <Canvas>
        <OrthographicCamera
          makeDefault
          position={[initialCenter[0], initialCenter[1], 15]}
          zoom={zoom}
          near={0.1}
          far={100}
        />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-3, 5, 8]} intensity={0.4} />
        <directionalLight position={[0, -2, 5]} intensity={0.2} />

        <Suspense fallback={null}>
          <SceneContent drawers={drawers} bounds={bounds} initialCenter={initialCenter} />
        </Suspense>
      </Canvas>
    </div>
  );
}
