import { useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useDrag } from '@use-gesture/react';
import { useDrawerStore, type PanelSnapPoint } from '../../../store/drawerStore';

interface BottomSheetProps {
  children: ReactNode;
}

const SNAP_HEIGHTS = {
  collapsed: 60,
  half: 50,
  full: 90,
} as const;

const VELOCITY_THRESHOLD = 0.5;

export function BottomSheet({ children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const panelSnapPoint = useDrawerStore((s) => s.panelSnapPoint);
  const setPanelSnapPoint = useDrawerStore((s) => s.setPanelSnapPoint);
  const selectedCompartmentIds = useDrawerStore((s) => s.selectedCompartmentIds);
  const selectedDrawerIds = useDrawerStore((s) => s.selectedDrawerIds);
  const setPanelMode = useDrawerStore((s) => s.setPanelMode);

  const getTranslateY = useCallback((snap: PanelSnapPoint): number => {
    switch (snap) {
      case 'collapsed':
        return window.innerHeight - SNAP_HEIGHTS.collapsed;
      case 'half':
        return window.innerHeight * (1 - SNAP_HEIGHTS.half / 100);
      case 'full':
        return window.innerHeight * (1 - SNAP_HEIGHTS.full / 100);
    }
  }, []);

  const getSnapFromY = useCallback((y: number, velocity: number, direction: number): PanelSnapPoint => {
    const vh = window.innerHeight;
    const collapsedY = vh - SNAP_HEIGHTS.collapsed;
    const halfY = vh * (1 - SNAP_HEIGHTS.half / 100);
    const fullY = vh * (1 - SNAP_HEIGHTS.full / 100);

    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      if (direction > 0) {
        if (panelSnapPoint === 'full') return 'half';
        return 'collapsed';
      } else {
        if (panelSnapPoint === 'collapsed') return 'half';
        return 'full';
      }
    }

    const distToCollapsed = Math.abs(y - collapsedY);
    const distToHalf = Math.abs(y - halfY);
    const distToFull = Math.abs(y - fullY);

    if (distToCollapsed <= distToHalf && distToCollapsed <= distToFull) {
      return 'collapsed';
    }
    if (distToHalf <= distToFull) {
      return 'half';
    }
    return 'full';
  }, [panelSnapPoint]);

  useEffect(() => {
    if (sheetRef.current) {
      // Ensure transition is set for programmatic changes
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = `translateY(${getTranslateY(panelSnapPoint)}px)`;
    }
  }, [panelSnapPoint, getTranslateY]);

  useEffect(() => {
    const handleResize = () => {
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${getTranslateY(panelSnapPoint)}px)`;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelSnapPoint, getTranslateY]);

  // Check if touch started on an interactive element
  const isInteractiveElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const interactive = target.closest('button, input, select, textarea, a, [role="button"]');
    return interactive !== null;
  }, []);

  // Check if content can scroll
  const canContentScroll = useCallback((direction: number): boolean => {
    if (!contentRef.current || panelSnapPoint === 'collapsed') return false;
    const content = contentRef.current;
    const isScrollable = content.scrollHeight > content.clientHeight;
    if (!isScrollable) return false;

    // Dragging down (direction > 0) - can scroll if not at top
    if (direction > 0) return content.scrollTop > 0;
    // Dragging up (direction < 0) - can scroll if not at bottom
    return content.scrollTop < content.scrollHeight - content.clientHeight;
  }, [panelSnapPoint]);

  const bind = useDrag(
    ({ event, first, movement: [, my], velocity: [, vy], direction: [, dy], last, memo, cancel }) => {
      if (!sheetRef.current) return;

      // On first touch, check if we should handle this drag
      if (first) {
        // Don't drag if touching interactive element
        if (isInteractiveElement(event?.target ?? null)) {
          cancel();
          return;
        }
        isDraggingRef.current = true;

        // Check if sheet is visually at collapsed position (not just target state)
        // This prevents mode swap during close animation
        if (sheetRef.current) {
          const transform = sheetRef.current.style.transform;
          const match = transform.match(/translateY\((.+)px\)/);
          const currentY = match ? parseFloat(match[1]) : 0;
          const collapsedY = getTranslateY('collapsed');
          const isVisuallyCollapsed = Math.abs(currentY - collapsedY) < 20;

          // If sheet is visually collapsed and nothing selected, swap to inventory
          const hasSelection = selectedCompartmentIds.size > 0 || selectedDrawerIds.size > 0;
          if (isVisuallyCollapsed && !hasSelection) {
            setPanelMode('inventory');
          }
        }
      }

      // Check if content should scroll instead
      if (canContentScroll(dy) && !isDraggingRef.current) {
        cancel();
        return;
      }

      // Once we start dragging the sheet, prevent content scroll
      if (contentRef.current && isDraggingRef.current) {
        contentRef.current.style.overflow = 'hidden';
      }

      const startY = memo ?? getTranslateY(panelSnapPoint);
      const newY = Math.max(
        getTranslateY('full'),
        Math.min(getTranslateY('collapsed'), startY + my)
      );

      if (last) {
        isDraggingRef.current = false;
        if (contentRef.current) {
          contentRef.current.style.overflow = 'auto';
        }
        const newSnap = getSnapFromY(newY, vy, dy);
        setPanelSnapPoint(newSnap);
        sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
        sheetRef.current.style.transform = `translateY(${getTranslateY(newSnap)}px)`;
      } else {
        sheetRef.current.style.transition = 'none';
        sheetRef.current.style.transform = `translateY(${newY}px)`;
      }

      return startY;
    },
    {
      axis: 'y',
      filterTaps: true,
      pointer: { touch: true },
      eventOptions: { passive: false },
    }
  );

  // Prevent default touch behavior on the sheet to stop page scrolling
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const preventDefaultTouch = (e: TouchEvent) => {
      // Allow touches on content area when expanded, but prevent on handle/background
      const target = e.target as HTMLElement;
      const isInContent = contentRef.current?.contains(target);
      const isInteractive = isInteractiveElement(target);

      // When collapsed, prevent all default touch behavior
      if (panelSnapPoint === 'collapsed') {
        e.preventDefault();
        return;
      }

      // When expanded, only allow default on content (for scrolling) and interactive elements
      if (!isInContent && !isInteractive) {
        e.preventDefault();
      }
    };

    sheet.addEventListener('touchmove', preventDefaultTouch, { passive: false });
    return () => sheet.removeEventListener('touchmove', preventDefaultTouch);
  }, [panelSnapPoint, isInteractiveElement]);

  return (
    <div
      ref={sheetRef}
      {...bind()}
      className="bottom-sheet"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: '90vh',
        background: 'white',
        borderRadius: '1rem 1rem 0 0',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        touchAction: 'none',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        willChange: 'transform',
      }}
    >
      {/* Drag handle */}
      <div
        style={{
          padding: '12px 0 8px 0',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: '#d1d5db',
            borderRadius: 2,
            margin: '0 auto',
          }}
        />
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflow: panelSnapPoint === 'collapsed' ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </div>
  );
}
