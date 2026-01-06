import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import type { Drawer } from '../../types/drawer';
import { CompartmentMesh } from './CompartmentMesh';
import { useDrawerStore } from '../../store/drawerStore';
import { useCursorStore } from '../../store/cursorStore';
import {
  COMPARTMENT_WIDTH,
  COMPARTMENT_HEIGHT,
  COMPARTMENT_DEPTH,
  COMPARTMENT_GAP,
  LABEL_STRIP_WIDTH,
  LABEL_STRIP_HEIGHT,
  NAME_LABEL_HEIGHT,
} from '../../constants/defaults';

interface DrawerGridProps {
  drawer: Drawer;
}

const CABINET_COLOR = '#374151';
const CABINET_INNER_COLOR = '#111827';
const ACTIVE_CABINET_COLOR = '#4b5563';
const CABINET_FLOOR_COLOR = '#1f2937';

export function DrawerGrid({ drawer }: DrawerGridProps) {
  const selectedDrawerIds = useDrawerStore((s) => s.selectedDrawerIds);
  const activeDrawerId = useDrawerStore((s) => s.activeDrawerId);
  const remoteCursors = useCursorStore((s) => s.remoteCursors);
  const isActive = selectedDrawerIds.has(drawer.id);

  // Find collaborators who have this drawer open
  const collaboratorsInDrawer = useMemo(() => {
    return Array.from(remoteCursors.values()).filter(
      (c) => c.drawerId === drawer.id
    );
  }, [remoteCursors, drawer.id]);

  // Only show collaborator indicators if we're not inside this drawer
  const showCollaboratorIndicators = activeDrawerId !== drawer.id && collaboratorsInDrawer.length > 0;

  const compartments = useMemo(
    () => Object.values(drawer.compartments),
    [drawer.compartments]
  );

  const cellWidth = COMPARTMENT_WIDTH + COMPARTMENT_GAP;
  const cellHeight = COMPARTMENT_HEIGHT + COMPARTMENT_GAP;

  // Cabinet dimensions including label strips and name label
  const cabinetWidth = drawer.cols * cellWidth + COMPARTMENT_GAP + LABEL_STRIP_WIDTH;
  const cabinetHeight = drawer.rows * cellHeight + COMPARTMENT_GAP + LABEL_STRIP_HEIGHT + NAME_LABEL_HEIGHT;
  const cabinetDepth = COMPARTMENT_DEPTH + 0.15;

  // Center offset for drawer compartments
  const centerX = (drawer.cols - 1) * cellWidth / 2;
  const centerY = (drawer.rows - 1) * cellHeight / 2;

  // Cabinet center (offset to account for label strips and name)
  const cabinetCenterX = centerX - LABEL_STRIP_WIDTH / 2;
  const cabinetCenterY = centerY + (LABEL_STRIP_HEIGHT + NAME_LABEL_HEIGHT) / 2;

  // Name label position (above the cabinet)
  const nameLabelY = drawer.rows * cellHeight - cellHeight / 2 + COMPARTMENT_GAP / 2 + LABEL_STRIP_HEIGHT + NAME_LABEL_HEIGHT / 2;

  // Inner compartment area dimensions (where drawers sit)
  const innerWidth = drawer.cols * cellWidth - COMPARTMENT_GAP;
  const innerHeight = drawer.rows * cellHeight - COMPARTMENT_GAP;
  const innerCenterX = centerX;
  const innerCenterY = centerY;
  const frameThickness = 0.08;

  const frameColor = isActive ? ACTIVE_CABINET_COLOR : CABINET_COLOR;

  return (
    <group>
      {/* Cabinet back panel */}
      <mesh position={[cabinetCenterX, cabinetCenterY, -cabinetDepth + 0.02]}>
        <boxGeometry args={[cabinetWidth, cabinetHeight, 0.04]} />
        <meshStandardMaterial color={CABINET_INNER_COLOR} roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Cabinet outer frame - top */}
      <mesh position={[cabinetCenterX, cabinetCenterY + cabinetHeight / 2 - frameThickness / 2, -cabinetDepth / 2]}>
        <boxGeometry args={[cabinetWidth, frameThickness, cabinetDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Cabinet outer frame - bottom */}
      <mesh position={[cabinetCenterX, cabinetCenterY - cabinetHeight / 2 + frameThickness / 2, -cabinetDepth / 2]}>
        <boxGeometry args={[cabinetWidth, frameThickness, cabinetDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Cabinet outer frame - left */}
      <mesh position={[cabinetCenterX - cabinetWidth / 2 + frameThickness / 2, cabinetCenterY, -cabinetDepth / 2]}>
        <boxGeometry args={[frameThickness, cabinetHeight - frameThickness * 2, cabinetDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Cabinet outer frame - right */}
      <mesh position={[cabinetCenterX + cabinetWidth / 2 - frameThickness / 2, cabinetCenterY, -cabinetDepth / 2]}>
        <boxGeometry args={[frameThickness, cabinetHeight - frameThickness * 2, cabinetDepth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Inner recessed area floor */}
      <mesh position={[innerCenterX, innerCenterY, -cabinetDepth + 0.06]}>
        <boxGeometry args={[innerWidth + 0.1, innerHeight + 0.1, 0.02]} />
        <meshStandardMaterial color={CABINET_FLOOR_COLOR} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Drawer name label (at top of cabinet) */}
      <Text
        position={[centerX, nameLabelY, 0.1]}
        fontSize={0.18}
        color={isActive ? '#60a5fa' : '#e5e7eb'}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        maxWidth={cabinetWidth - 0.2}
      >
        {drawer.name}
      </Text>

      {/* Collaborator presence indicators */}
      {showCollaboratorIndicators && collaboratorsInDrawer.slice(0, 4).map((collab, i) => (
        <mesh
          key={collab.userId}
          position={[
            centerX + cabinetWidth / 2 - 0.15 - (i * 0.2),
            nameLabelY,
            0.12
          ]}
        >
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color={collab.color} />
        </mesh>
      ))}

      {/* Row labels (numbers 1-N on left strip, 1 at top) */}
      {Array.from({ length: drawer.rows }).map((_, row) => (
        <Text
          key={`row-${row}`}
          position={[
            -cellWidth / 2 - COMPARTMENT_GAP / 2 - LABEL_STRIP_WIDTH / 2,
            (drawer.rows - 1 - row) * cellHeight,
            0.02
          ]}
          fontSize={0.12}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {String(row + 1)}
        </Text>
      ))}

      {/* Column labels (letters A-Z on top strip) */}
      {Array.from({ length: drawer.cols }).map((_, col) => (
        <Text
          key={`col-${col}`}
          position={[
            col * cellWidth,
            drawer.rows * cellHeight - cellHeight / 2 + COMPARTMENT_GAP / 2 + LABEL_STRIP_HEIGHT / 2,
            0.02
          ]}
          fontSize={0.12}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {String.fromCharCode(65 + col)}
        </Text>
      ))}

      {/* Compartments */}
      {compartments.map((compartment) => (
        <CompartmentMesh
          key={compartment.id}
          compartment={compartment}
          drawerId={drawer.id}
          totalRows={drawer.rows}
        />
      ))}
    </group>
  );
}
