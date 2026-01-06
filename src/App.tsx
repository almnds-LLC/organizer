import { useEffect } from 'react';
import { DrawerScene } from './components/three/DrawerScene';
import { Header } from './components/ui/Header';
import { UnifiedPanel } from './components/ui/UnifiedPanel';
import { AddDrawerModal } from './components/ui/AddDrawerModal';
import { CategoryModal } from './components/ui/CategoryModal';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { ConflictModal } from './components/ui/ConflictModal';
import { CollaboratorCursors } from './components/ui/CollaboratorCursors';
import { useAuthStore } from './store/authStore';
import { useDrawerStore } from './store/drawerStore';
import { useRoomSync } from './hooks/useRoomSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useWebRTC } from './hooks/useWebRTC';
import { api } from './api/client';
import './App.css';

function App() {
  const { checkAuth, isAuthenticated, isInitialized, currentRoomId, mode } = useAuthStore();
  const { loadFromApi } = useDrawerStore();

  // Initialize real-time sync
  useRoomSync();

  // Initialize WebRTC for peer-to-peer cursor sharing
  useWebRTC();

  // Track online/offline status
  useOnlineStatus();

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load room data when authenticated and room is selected
  useEffect(() => {
    if (!isAuthenticated || !currentRoomId || mode !== 'online') return;

    const loadRoomData = async () => {
      try {
        const room = await api.getRoom(currentRoomId);
        loadFromApi(room);
      } catch (error) {
        console.error('Failed to load room data:', error);
      }
    };

    loadRoomData();
  }, [isAuthenticated, currentRoomId, mode, loadFromApi]);

  // Show loading state until initialized
  if (!isInitialized) {
    return (
      <div className="app loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      <div className="main-content">
        <main className="scene-container">
          <DrawerScene />
        </main>
        <UnifiedPanel />
      </div>
      <div className="status-bar">
        <OfflineIndicator />
      </div>
      <AddDrawerModal />
      <CategoryModal />
      <ConflictModal />
      {isAuthenticated && <CollaboratorCursors />}
    </div>
  );
}

export default App;
