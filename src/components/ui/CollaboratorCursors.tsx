import { useEffect } from 'react';
import { useCursorStore } from '../../store/cursorStore';
import { webRTCManager } from '../../api/webrtc';
import { useDrawerStore } from '../../store/drawerStore';
import styles from './CollaboratorCursors.module.css';

export function CollaboratorCursors() {
  const remoteCursors = useCursorStore((s) => s.remoteCursors);
  const updateCursor = useCursorStore((s) => s.updateCursor);
  const activeDrawerId = useDrawerStore((s) => s.activeDrawerId);

  useEffect(() => {
    return webRTCManager.onCursorUpdate((userId, username, position) => {
      updateCursor(userId, username, position);
    });
  }, [updateCursor]);

  // Show cursors that are on the same drawer (or both on room view with no drawer selected)
  const visibleCursors = Array.from(remoteCursors.values()).filter(
    (cursor) => (cursor.drawerId || null) === (activeDrawerId || null)
  );

  return (
    <div className={styles.overlay}>
      {visibleCursors.map((cursor) => (
        <div
          key={cursor.userId}
          className={styles.cursor}
          style={{
            left: cursor.screenX,
            top: cursor.screenY,
            // Offset to align cursor tip (at ~5.5, 3 in SVG) with the actual position
            transform: 'translate(-5px, -3px)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill={cursor.color}
            className={styles.cursorIcon}
          >
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36z" />
          </svg>
          <div
            className={styles.cursorLabel}
            style={{ background: cursor.color }}
          >
            {cursor.username}
          </div>
        </div>
      ))}
    </div>
  );
}
