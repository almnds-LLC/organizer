import { useDrawerStore } from '../../store/drawerStore';
import { useAuthStore } from '../../store/authStore';
import { AuthDropdown } from './AuthDropdown';
import { UserMenu } from './UserMenu';
import styles from './Header.module.css';

export function Header() {
  const {
    selectedCompartmentIds,
    selectedDrawerIds,
    setAddDrawerModalOpen,
    drawers,
  } = useDrawerStore();

  const { isAuthenticated, isInitialized } = useAuthStore();

  // Get selected drawer name(s) for display
  const selectionInfo = (() => {
    if (selectedDrawerIds.size === 1) {
      const drawerId = Array.from(selectedDrawerIds)[0];
      return drawers[drawerId]?.name || 'Drawer';
    }
    if (selectedDrawerIds.size > 1) {
      return `${selectedDrawerIds.size} Drawers`;
    }
    if (selectedCompartmentIds.size === 1) {
      return '1 Compartment';
    }
    if (selectedCompartmentIds.size > 1) {
      return `${selectedCompartmentIds.size} Compartments`;
    }
    return 'Drawer Organizer';
  })();

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <h1 className={styles.drawerName}>{selectionInfo}</h1>
      </div>

      <div className={styles.headerRight}>
        <button
          className={styles.addDrawerButton}
          onClick={() => setAddDrawerModalOpen(true)}
          aria-label="Add drawer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {isInitialized && (
          isAuthenticated ? <UserMenu /> : <AuthDropdown />
        )}
      </div>
    </header>
  );
}
