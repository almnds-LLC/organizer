import { useOfflineStore } from '../../store/offlineStore';
import { useAuthStore } from '../../store/authStore';
import styles from './OfflineIndicator.module.css';

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingOperations, lastSyncError, clearSyncError, syncPendingOperations } = useOfflineStore();
  const { mode } = useAuthStore();
  const pendingCount = pendingOperations.length;

  // Don't show if in local mode
  if (mode !== 'online') return null;

  // Don't show if online with no pending and no error
  if (isOnline && pendingCount === 0 && !lastSyncError) return null;

  return (
    <div className={styles['offline-indicator']}>
      {!isOnline && (
        <span className={styles['offline-badge']}>
          <span className={styles['offline-icon']}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </span>
          Offline
        </span>
      )}

      {pendingCount > 0 && (
        <span className={styles['pending-badge']} title={`${pendingCount} pending changes will sync when online`}>
          <span className={styles['pending-icon']}>
            {isSyncing ? (
              <svg className={styles.spinning} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
          </span>
          {isSyncing ? 'Syncing...' : `${pendingCount} pending`}
        </span>
      )}

      {lastSyncError && (
        <span className={styles['error-badge']} onClick={clearSyncError} title="Click to dismiss">
          <span className={styles['error-icon']}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </span>
          Sync error
        </span>
      )}

      {isOnline && pendingCount > 0 && !isSyncing && (
        <button
          className={styles['sync-now-btn']}
          onClick={() => syncPendingOperations()}
          title="Sync now"
        >
          Sync now
        </button>
      )}
    </div>
  );
}
