import { type ReactNode, useRef, useCallback } from 'react';
import { useDrag } from '@use-gesture/react';
import { useIsMobile } from '../../../hooks/useMediaQuery';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const isMobile = useIsMobile();
  const sheetRef = useRef<HTMLDivElement>(null);

  const bind = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], last, cancel, event }) => {
      if (!sheetRef.current || !isMobile) return;

      // Don't drag if touching interactive element
      const target = event?.target as HTMLElement | null;
      if (target?.closest('button, input, select, textarea, a, [role="button"]')) {
        cancel();
        return;
      }

      if (last) {
        // Close if dragged down far enough or with enough velocity
        if (my > 100 || (vy > 0.5 && dy > 0)) {
          sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
          sheetRef.current.style.transform = 'translateY(100%)';
          setTimeout(onClose, 300);
        } else {
          sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
          sheetRef.current.style.transform = 'translateY(0)';
        }
      } else {
        // Only allow dragging down
        const dragY = Math.max(0, my);
        sheetRef.current.style.transition = 'none';
        sheetRef.current.style.transform = `translateY(${dragY}px)`;
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <div className={styles.sheetOverlay} onClick={handleOverlayClick}>
        <div
          ref={sheetRef}
          {...bind()}
          className={`${styles.sheet} ${className || ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.sheetHandle}>
            <div className={styles.sheetHandleBar} />
          </div>
          <div className={styles.header}>
            <h2>{title}</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className={styles.body}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${className || ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Export sub-components for more flexibility
Modal.Overlay = function ModalOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      {children}
    </div>
  );
};

Modal.Container = function ModalContainer({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div className={`${styles.modal} ${className || ''}`} onClick={onClick}>
      {children}
    </div>
  );
};

Modal.Header = function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className={styles.header}>
      <h2>{title}</h2>
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

Modal.Body = function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.body} ${className || ''}`}>
      {children}
    </div>
  );
};
