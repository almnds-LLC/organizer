import { useConflictStore } from '../../store/conflictStore';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import styles from './ConflictModal.module.css';

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function getChangedFields(local: Record<string, unknown>, remote: Record<string, unknown>): string[] {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  return Array.from(allKeys).filter(key => {
    const localVal = JSON.stringify(local[key]);
    const remoteVal = JSON.stringify(remote[key]);
    return localVal !== remoteVal;
  });
}

export function ConflictModal() {
  const { activeConflict, resolveConflict, dismissConflict, conflicts } = useConflictStore();
  const { currentRoomId } = useAuthStore();

  if (!activeConflict) return null;

  const handleResolve = async (choice: 'local' | 'remote') => {
    if (!activeConflict || !currentRoomId) return;

    try {
      if (choice === 'local') {
        // Apply local version to server
        switch (activeConflict.entity) {
          case 'drawer':
            await api.updateDrawer(
              currentRoomId,
              activeConflict.entityId,
              activeConflict.localVersion as { name?: string; gridX?: number; gridY?: number }
            );
            break;
          case 'category':
            await api.updateCategory(
              currentRoomId,
              activeConflict.entityId,
              activeConflict.localVersion as { name?: string; colorIndex?: number; color?: string }
            );
            break;
          case 'subCompartment': {
            const drawerId = activeConflict.localVersion.drawerId as string;
            const item = activeConflict.localVersion.item as { label?: string; categoryId?: string; quantity?: number } | null;
            await api.updateSubCompartment(drawerId, activeConflict.entityId, {
              itemLabel: item?.label ?? null,
              itemCategoryId: item?.categoryId ?? null,
              itemQuantity: item?.quantity ?? null,
            });
            break;
          }
        }
      } else {
        // Apply remote version to local store - this is already handled by the websocket
        // The remote version should already be applied when the conflict was detected
      }

      resolveConflict(activeConflict.id, choice);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  const handleDismiss = () => {
    dismissConflict(activeConflict.id);
  };

  const changedFields = getChangedFields(
    activeConflict.localVersion,
    activeConflict.remoteVersion
  );

  const entityLabel = {
    drawer: 'Drawer',
    compartment: 'Compartment',
    subCompartment: 'Item',
    category: 'Category',
  }[activeConflict.entity];

  return (
    <div className={styles['conflict-modal-overlay']} onClick={handleDismiss}>
      <div className={styles['conflict-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['conflict-modal-header']}>
          <h2>Sync Conflict</h2>
          <button className={styles['conflict-close-btn']} onClick={handleDismiss} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles['conflict-modal-body']}>
          <p className={styles['conflict-description']}>
            This <strong>{entityLabel.toLowerCase()}</strong>
            {activeConflict.entityName && <> "<strong>{activeConflict.entityName}</strong>"</>}
            {' '}was modified both locally and on the server. Choose which version to keep.
          </p>

          {conflicts.length > 1 && (
            <p className={styles['conflict-count']}>
              {conflicts.length} conflicts remaining
            </p>
          )}

          <div className={styles['conflict-comparison']}>
            <div className={`${styles['conflict-version']} ${styles.local}`}>
              <div className={styles['version-header']}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <h3>Your Version</h3>
              </div>
              <div className={styles['version-content']}>
                {changedFields.map(field => (
                  <div key={field} className={styles['field-row']}>
                    <span className={styles['field-name']}>{field}:</span>
                    <span className={styles['field-value']}>{formatValue(activeConflict.localVersion[field])}</span>
                  </div>
                ))}
              </div>
              <button
                className={`${styles['resolve-btn']} ${styles['local-btn']}`}
                onClick={() => handleResolve('local')}
              >
                Keep Your Version
              </button>
            </div>

            <div className={styles['conflict-divider']}>
              <span>OR</span>
            </div>

            <div className={`${styles['conflict-version']} ${styles.remote}`}>
              <div className={styles['version-header']}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                </svg>
                <h3>Server Version</h3>
              </div>
              <div className={styles['version-content']}>
                {changedFields.map(field => (
                  <div key={field} className={styles['field-row']}>
                    <span className={styles['field-name']}>{field}:</span>
                    <span className={styles['field-value']}>{formatValue(activeConflict.remoteVersion[field])}</span>
                  </div>
                ))}
              </div>
              <button
                className={`${styles['resolve-btn']} ${styles['remote-btn']}`}
                onClick={() => handleResolve('remote')}
              >
                Keep Server Version
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
