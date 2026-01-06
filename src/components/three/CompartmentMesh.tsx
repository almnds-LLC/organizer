import { useState, useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Pencil } from 'lucide-react';
import type { Compartment } from '../../types/drawer';
import { useDrawerStore, getCategoryColor } from '../../store/drawerStore';
import { useCursorStore } from '../../store/cursorStore';
import { getContrastColor } from '../../utils/colorHelpers';
import {
  COMPARTMENT_WIDTH,
  COMPARTMENT_HEIGHT,
  COMPARTMENT_DEPTH,
  COMPARTMENT_GAP,
  SEARCH_MATCH_COLOR,
  DEFAULT_ITEM_COLOR,
} from '../../constants/defaults';

interface CompartmentMeshProps {
  compartment: Compartment;
  drawerId: string;
  totalRows: number;
}

const OPEN_DISTANCE = 0.6;

export function CompartmentMesh({ compartment, drawerId, totalRows }: CompartmentMeshProps) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const slideProgress = useRef(0);
  const lastClickTimeRef = useRef(0);

  const {
    selectedCompartmentIds,
    searchMatchIds,
    categories,
    selectCompartment,
    toggleCompartmentSelection,
    selectRectangle,
    lastSelectedPosition,
    navigateToItem,
    activeDrawerId,
    setHoveredCompartment,
  } = useDrawerStore();

  const remoteCursors = useCursorStore((s) => s.remoteCursors);

  const isSelected = selectedCompartmentIds.has(compartment.id);
  const isSearchMatch = searchMatchIds.has(compartment.id);
  const isSingleSelected = isSelected && selectedCompartmentIds.size === 1;

  // Find collaborator hovering on this compartment or has it selected
  const collaboratorOnThis = useMemo(() => {
    return Array.from(remoteCursors.values()).find(
      (c) => c.drawerId === drawerId && (
        c.compartmentId === compartment.id ||
        c.selectedCompartmentIds?.includes(compartment.id)
      )
    );
  }, [remoteCursors, drawerId, compartment.id]);

  useFrame((_, delta) => {
    const target = isSingleSelected ? 1 : 0;
    const speed = 8;
    slideProgress.current += (target - slideProgress.current) * Math.min(delta * speed, 1);

    if (groupRef.current) {
      groupRef.current.position.z = slideProgress.current * OPEN_DISTANCE;
    }
  });

  // Calculate dimensions based on spans (for merged compartments)
  const dimensions = useMemo(() => {
    const rowSpan = compartment.rowSpan ?? 1;
    const colSpan = compartment.colSpan ?? 1;
    const width = colSpan * COMPARTMENT_WIDTH + (colSpan - 1) * COMPARTMENT_GAP;
    const height = rowSpan * COMPARTMENT_HEIGHT + (rowSpan - 1) * COMPARTMENT_GAP;
    return { width, height, rowSpan, colSpan };
  }, [compartment.rowSpan, compartment.colSpan]);

  const position: [number, number, number] = useMemo(
    () => [
      // Position at anchor (top-left) plus offset to center of merged area
      compartment.col * (COMPARTMENT_WIDTH + COMPARTMENT_GAP) + (dimensions.width - COMPARTMENT_WIDTH) / 2,
      (totalRows - 1 - compartment.row) * (COMPARTMENT_HEIGHT + COMPARTMENT_GAP) - (dimensions.height - COMPARTMENT_HEIGHT) / 2,
      0,
    ],
    [compartment.row, compartment.col, totalRows, dimensions.width, dimensions.height]
  );

  // Handle single click action
  const doSingleClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const nativeEvent = e.nativeEvent;
      const isSameDrawer = activeDrawerId === drawerId;

      if ((nativeEvent.ctrlKey || nativeEvent.metaKey) && isSameDrawer) {
        toggleCompartmentSelection(compartment.id);
      } else if (nativeEvent.shiftKey && lastSelectedPosition && isSameDrawer) {
        selectRectangle(
          lastSelectedPosition.row,
          lastSelectedPosition.col,
          compartment.row,
          compartment.col
        );
      } else {
        selectCompartment(compartment.id, false, drawerId);
      }
    },
    [compartment.id, compartment.row, compartment.col, drawerId, activeDrawerId, selectCompartment, toggleCompartmentSelection, selectRectangle, lastSelectedPosition]
  );

  // Handle double click action
  const doDoubleClick = useCallback(() => {
    navigateToItem(drawerId, compartment.id);
  }, [compartment.id, drawerId, navigateToItem]);

  // Use pointer-based click detection for consistent touch behavior
  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300) {
        // Double click/tap
        doDoubleClick();
      } else {
        // Single click/tap
        doSingleClick(e);
      }

      lastClickTimeRef.current = now;
    },
    [doSingleClick, doDoubleClick]
  );

  const hasContents = compartment.subCompartments.some((sc) => sc.item);
  const drawerFaceColor = isSearchMatch
    ? SEARCH_MATCH_COLOR
    : hovered || isSelected
      ? '#d1d5db'
      : '#e5e7eb';
  const handleColor = isSelected ? '#60a5fa' : '#4b5563';
  const drawerSideColor = '#9ca3af';
  const drawerInsideColor = '#6b7280';

  const depth = COMPARTMENT_DEPTH;
  const wallThickness = 0.02;

  const frontMeshEvents = {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => e.stopPropagation(),
    onPointerUp: handlePointerUp,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      setHoveredCompartment(compartment.id);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      setHovered(false);
      setHoveredCompartment(null);
      document.body.style.cursor = 'default';
    },
  };

  const sideMeshEvents = isSingleSelected ? frontMeshEvents : {};

  return (
    <group position={position}>
      <group ref={groupRef}>
        <mesh position={[0, 0, 0.02]} {...frontMeshEvents}>
          <boxGeometry args={[dimensions.width, dimensions.height, 0.04]} />
          <meshStandardMaterial color={drawerFaceColor} />
        </mesh>

        <mesh position={[0, 0, 0.06]} {...frontMeshEvents}>
          <boxGeometry args={[Math.min(0.3, dimensions.width * 0.4), 0.04, 0.03]} />
          <meshStandardMaterial color={handleColor} metalness={0.4} roughness={0.4} />
        </mesh>

        <mesh position={[0, 0, -depth + wallThickness / 2]} {...sideMeshEvents}>
          <boxGeometry args={[dimensions.width, dimensions.height, wallThickness]} />
          <meshStandardMaterial color={drawerInsideColor} />
        </mesh>

        <mesh position={[-dimensions.width / 2 + wallThickness / 2, 0, -depth / 2]} {...sideMeshEvents}>
          <boxGeometry args={[wallThickness, dimensions.height, depth]} />
          <meshStandardMaterial color={drawerSideColor} />
        </mesh>

        <mesh position={[dimensions.width / 2 - wallThickness / 2, 0, -depth / 2]} {...sideMeshEvents}>
          <boxGeometry args={[wallThickness, dimensions.height, depth]} />
          <meshStandardMaterial color={drawerSideColor} />
        </mesh>

        <mesh position={[0, -dimensions.height / 2 + wallThickness / 2, -depth / 2]} {...sideMeshEvents}>
          <boxGeometry args={[dimensions.width, wallThickness, depth]} />
          <meshStandardMaterial color={drawerSideColor} />
        </mesh>

        {hasContents && (
          <group position={[0, -dimensions.height * 0.25, 0.05]}>
            {compartment.subCompartments.map((sc, i) => {
              if (!sc.item) return null;
              const count = compartment.subCompartments.filter(s => s.item).length;
              const spacing = Math.min(0.12, Math.min(dimensions.width, dimensions.height) * 0.5 / count);
              const offset = (i - (compartment.subCompartments.length - 1) / 2) * spacing;
              const category = sc.item.categoryId ? categories[sc.item.categoryId] : null;
              const color = category ? getCategoryColor(category) : DEFAULT_ITEM_COLOR;
              return (
                <mesh key={sc.id} position={[offset, 0, 0]}>
                  <boxGeometry args={[0.06, 0.06, 0.01]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              );
            })}
          </group>
        )}

        {isSelected && (
          <lineSegments position={[0, 0, 0.03]}>
            <edgesGeometry
              args={[new THREE.BoxGeometry(dimensions.width + 0.04, dimensions.height + 0.04, 0.02)]}
            />
            <lineBasicMaterial color="#3b82f6" linewidth={2} />
          </lineSegments>
        )}

        {collaboratorOnThis && !isSelected && (
          <lineSegments position={[0, 0, 0.03]}>
            <edgesGeometry
              args={[new THREE.BoxGeometry(dimensions.width + 0.04, dimensions.height + 0.04, 0.02)]}
            />
            <lineBasicMaterial color={collaboratorOnThis.color} linewidth={2} transparent opacity={0.7} />
          </lineSegments>
        )}

        {isSingleSelected && (
          <Html
            position={[0, dimensions.height / 2 + 0.05, 0.06]}
            zIndexRange={[10, 10]}
            style={{
              pointerEvents: 'auto',
              transform: 'translate(-50%, -100%)',
              marginTop: '-8px',
            }}
          >
            <DrawerPopup compartmentId={compartment.id} />
          </Html>
        )}
      </group>
    </group>
  );
}

function DrawerPopup({ compartmentId }: { compartmentId: string }) {
  const categories = useDrawerStore((s) => s.categories);
  const setPanelMode = useDrawerStore((s) => s.setPanelMode);
  const setPanelVisible = useDrawerStore((s) => s.setPanelVisible);

  const compartment = useDrawerStore((s) => {
    const drawer = s.activeDrawerId ? s.drawers[s.activeDrawerId] : null;
    return drawer?.compartments[compartmentId] || null;
  });

  if (!compartment) return null;

  const isHorizontal = compartment.dividerOrientation === 'horizontal';

  const handleEditClick = () => {
    setPanelMode('edit');
    setPanelVisible(true);
  };

  return (
    <div
      style={{
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          padding: '12px',
          minWidth: '160px',
          fontSize: '13px',
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          fontWeight: 600,
          marginBottom: '8px',
          color: '#111827',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>
            {String.fromCharCode(65 + compartment.col)}{compartment.row + 1}
          </span>
          <button
            onClick={handleEditClick}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Edit"
          >
            <Pencil size={14} />
          </button>
        </div>

      <div style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'column' : 'row',
        gap: '6px',
      }}>
        {compartment.subCompartments.map((sc) => {
          const category = sc.item?.categoryId ? categories[sc.item.categoryId] : null;
          const bgColor = category ? getCategoryColor(category) : '#f3f4f6';
          const textColor = category ? getContrastColor(bgColor) : '#111827';
          return (
            <div
              key={sc.id}
              style={{
                flex: sc.relativeSize,
                padding: '8px',
                background: bgColor,
                borderRadius: '4px',
                textAlign: 'center',
                minHeight: '40px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {sc.item ? (
                <>
                  <span style={{ fontWeight: 500, color: textColor, fontSize: '12px' }}>
                    {sc.item.label}
                  </span>
                  {category && (
                    <span style={{ fontSize: '10px', color: textColor, opacity: 0.7 }}>
                      {category.name}
                    </span>
                  )}
                  {sc.item.quantity !== undefined && (
                    <span style={{ fontSize: '11px', color: textColor, opacity: 0.8 }}>
                      ×{sc.item.quantity}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Empty</span>
              )}
            </div>
          );
        })}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid white',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
