import { useEffect } from 'react';
import { webRTCManager } from '../api/webrtc';
import { useAuthStore } from '../store/authStore';
import { roomWebSocket } from '../api/websocket';
import { useCursorStore } from '../store/cursorStore';

export function useWebRTC() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearAllCursors = useCursorStore((s) => s.clearAllCursors);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleConnected = () => {
      webRTCManager.initialize(user.id, user.username, isMobile);

      // Connect to any users already in the room
      // This handles the race condition where user_joined events arrive
      // before this hook subscribes to messages
      const existingUsers = roomWebSocket.getConnectedUsers();
      for (const existingUser of existingUsers) {
        if (existingUser.userId !== user.id) {
          webRTCManager.connectToPeer(existingUser.userId, existingUser.username);
        }
      }
    };

    const handleDisconnected = () => {
      webRTCManager.cleanup();
      clearAllCursors();
    };

    const unsubscribe = roomWebSocket.onConnectionChange((connected) => {
      if (connected) handleConnected();
      else handleDisconnected();
    });

    if (roomWebSocket.isConnected()) {
      handleConnected();
    }

    return () => {
      unsubscribe();
      webRTCManager.cleanup();
      clearAllCursors();
    };
  }, [isAuthenticated, user, isMobile, clearAllCursors]);
}
