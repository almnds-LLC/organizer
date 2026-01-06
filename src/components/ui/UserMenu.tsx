import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useDrawerStore } from '../../store/drawerStore';
import { RoomSettingsModal } from './RoomSettingsModal';
import styles from './UserMenu.module.css';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    user,
    logout,
    rooms,
    currentRoomId,
    setCurrentRoom,
    createRoom,
    getCurrentRoom,
    invitations,
    acceptInvitation,
    declineInvitation,
  } = useAuthStore();
  const { loadFromApi } = useDrawerStore();

  const currentRoom = rooms.find(r => r.id === currentRoomId);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus input when creating room
  useEffect(() => {
    if (isCreatingRoom && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreatingRoom]);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  const handleRoomChange = async (roomId: string) => {
    setCurrentRoom(roomId);
    // Load the new room's data
    const room = await getCurrentRoom();
    if (room) {
      loadFromApi(room);
    }
    setIsOpen(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setError(null);
    try {
      await createRoom(newRoomName.trim());
      // Load the new room's data
      const room = await getCurrentRoom();
      if (room) {
        loadFromApi(room);
      }
      setNewRoomName('');
      setIsCreatingRoom(false);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  };

  const handleCancelCreate = () => {
    setIsCreatingRoom(false);
    setNewRoomName('');
    setError(null);
  };

  const handleOpenSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    setError(null);
    try {
      await acceptInvitation(invitationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    setError(null);
    try {
      await declineInvitation(invitationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline invitation');
    }
  };

  if (!user) return null;

  return (
    <>
      <div className={styles['user-menu']} ref={menuRef}>
        <button
          className={styles['user-menu-trigger']}
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <div className={styles['user-avatar']}>
            {user.displayName?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
          </div>
          <span className={styles['user-name']}>{user.displayName || user.username}</span>
          <svg
            className={`${styles.chevron} ${isOpen ? styles.open : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {isOpen && (
          <div className={styles['user-menu-dropdown']}>
            <div className={styles['user-menu-header']}>
              <div className={`${styles['user-avatar']} ${styles.large}`}>
                {user.displayName?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
              </div>
              <div className={styles['user-info']}>
                <span className={styles['user-display-name']}>{user.displayName || user.username}</span>
                <span className={styles['user-username']}>@{user.username}</span>
              </div>
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <>
                <div className={styles['user-menu-section-title']}>Invitations ({invitations.length})</div>
                {invitations.map(invitation => (
                  <div key={invitation.id} className={styles['invitation-item']}>
                    <div className={styles['invitation-info']}>
                      <span className={styles['invitation-room']}>{invitation.roomName}</span>
                      <span className={styles['invitation-from']}>from @{invitation.inviterUsername}</span>
                    </div>
                    <div className={styles['invitation-actions']}>
                      <button
                        className={styles['invitation-accept']}
                        onClick={() => handleAcceptInvitation(invitation.id)}
                        title="Accept"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        className={styles['invitation-decline']}
                        onClick={() => handleDeclineInvitation(invitation.id)}
                        title="Decline"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className={styles['user-menu-divider']} />
              </>
            )}

            <div className={styles['user-menu-section-title']}>Rooms</div>
            {rooms.map(room => (
              <button
                key={room.id}
                className={`${styles['user-menu-item']} ${styles['room-item']} ${room.id === currentRoomId ? styles.active : ''}`}
                onClick={() => handleRoomChange(room.id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span>{room.name}</span>
                {room.id === currentRoomId && (
                  <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}

            {isCreatingRoom ? (
              <form className={styles['create-room-form']} onSubmit={handleCreateRoom}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Room name"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className={styles['create-room-input']}
                />
                <div className={styles['create-room-actions']}>
                  <button type="button" className={styles['create-room-cancel']} onClick={handleCancelCreate}>
                    Cancel
                  </button>
                  <button type="submit" className={styles['create-room-submit']} disabled={!newRoomName.trim()}>
                    Create
                  </button>
                </div>
                {error && <div className={styles['create-room-error']}>{error}</div>}
              </form>
            ) : (
              <button
                className={styles['user-menu-item']}
                onClick={() => setIsCreatingRoom(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Create New Room</span>
              </button>
            )}

            {/* Room Settings */}
            {currentRoom && (
              <>
                <div className={styles['user-menu-divider']} />
                <button className={styles['user-menu-item']} onClick={handleOpenSettings}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Room Settings</span>
                </button>
              </>
            )}

            <div className={styles['user-menu-divider']} />

            <button className={`${styles['user-menu-item']} ${styles.logout}`} onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>

      <RoomSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
