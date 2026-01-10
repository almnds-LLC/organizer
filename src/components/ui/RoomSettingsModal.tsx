import { useState, useEffect, useCallback } from 'react';
import { useAuthStore, type RoomMember } from '../../store/authStore';
import { useDrawerStore } from '../../store/drawerStore';
import { Modal, Button, Switch } from './shared';
import type { PendingInvitation } from '../../api/client';
import styles from './RoomSettingsModal.module.css';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RoomSettingsModal({ isOpen, onClose }: RoomSettingsModalProps) {
  const {
    user,
    rooms,
    currentRoomId,
    updateRoom,
    deleteRoom,
    getMembers,
    removeMember,
    leaveRoom,
    inviteUser,
    getCurrentRoom,
    getPendingInvitations,
    cancelInvitation,
    updateMember,
  } = useAuthStore();
  const { loadFromApi } = useDrawerStore();

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const isOwner = currentRoom?.role === 'owner';
  const canInviteUsers = isOwner || currentRoom?.canInvite;
  const canDeleteRoom = isOwner && rooms.length > 1;
  const canLeaveRoom = !isOwner;
  const showDangerZone = canDeleteRoom || canLeaveRoom;

  // Form state
  const [roomName, setRoomName] = useState(currentRoom?.name || '');
  const [inviteForm, setInviteForm] = useState({
    username: '',
    role: 'editor' as 'owner' | 'editor' | 'viewer',
    canInvite: false,
  });

  // Data state
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<
    | { type: 'delete' }
    | { type: 'leave' }
    | { type: 'removeMember'; member: RoomMember }
    | { type: 'cancelInvite'; invite: PendingInvitation }
    | null
  >(null);

  const availableRoles = (() => {
    if (!currentRoom) return [];
    switch (currentRoom.role) {
      case 'owner': return ['owner', 'editor', 'viewer'] as const;
      case 'editor': return ['editor', 'viewer'] as const;
      case 'viewer': return ['viewer'] as const;
      default: return [] as const;
    }
  })();

  const loadMembersAndInvites = useCallback(async () => {
    if (!currentRoomId) return;
    setIsLoadingMembers(true);
    try {
      const memberList = await getMembers(currentRoomId);
      setMembers(memberList);

      // Load pending invites if user can invite
      if (canInviteUsers) {
        try {
          const invites = await getPendingInvitations(currentRoomId);
          setPendingInvites(invites);
        } catch (error) {
          console.error('Failed to load pending invitations:', error);
          setPendingInvites([]);
        }
      }
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [currentRoomId, getMembers, getPendingInvitations, canInviteUsers]);

  useEffect(() => {
    if (isOpen && currentRoomId) {
      setRoomName(currentRoom?.name || '');
      setInviteForm({ username: '', role: 'editor', canInvite: false });
      setError(null);
      setConfirmDialog(null);
      loadMembersAndInvites();
    }
  }, [isOpen, currentRoomId, currentRoom?.name, loadMembersAndInvites]);

  const handleSaveName = async () => {
    if (!currentRoomId || !roomName.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await updateRoom(currentRoomId, roomName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoomId || !inviteForm.username.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await inviteUser(currentRoomId, inviteForm.username.trim(), inviteForm.role, inviteForm.canInvite);
      // Reload pending invites after successful invite
      const invites = await getPendingInvitations(currentRoomId);
      setPendingInvites(invites);
      setInviteForm({ username: '', role: 'editor', canInvite: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelInvite = async () => {
    if (!currentRoomId || confirmDialog?.type !== 'cancelInvite') return;
    const { invite } = confirmDialog;
    setIsSubmitting(true);
    setError(null);
    try {
      await cancelInvitation(currentRoomId, invite.id);
      setPendingInvites(prev => prev.filter(inv => inv.id !== invite.id));
      setConfirmDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleCanInvite = async (member: RoomMember) => {
    if (!currentRoomId) return;
    setError(null);
    try {
      await updateMember(currentRoomId, member.userId, { canInvite: !member.canInvite });
      setMembers(prev => prev.map(m =>
        m.userId === member.userId ? { ...m, canInvite: !m.canInvite } : m
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!currentRoomId || confirmDialog?.type !== 'removeMember') return;
    const { member } = confirmDialog;
    setIsSubmitting(true);
    setError(null);
    try {
      await removeMember(currentRoomId, member.userId);
      setConfirmDialog(null);
      await loadMembersAndInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!currentRoomId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await deleteRoom(currentRoomId);
      const room = await getCurrentRoom();
      if (room) {
        loadFromApi(room);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room');
      setIsSubmitting(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!currentRoomId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await leaveRoom(currentRoomId);
      const room = await getCurrentRoom();
      if (room) {
        loadFromApi(room);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave room');
      setIsSubmitting(false);
    }
  };

  const roleLevel = (role: string): number => {
    switch (role) {
      case 'owner': return 3;
      case 'editor': return 2;
      case 'viewer': return 1;
      default: return 0;
    }
  };

  const canRemoveMember = (member: RoomMember): boolean => {
    if (!currentRoom || !user) return false;
    if (member.userId === user.id) return false;
    if (currentRoom.role === 'owner') return member.role !== 'owner' || members.filter(m => m.role === 'owner').length > 1;
    return roleLevel(currentRoom.role) > roleLevel(member.role);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Room Settings" className={styles.modal}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <h3>Room Name</h3>
        {isOwner ? (
          <div className={styles.roomNameEdit}>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name"
            />
            <Button
              size="sm"
              onClick={handleSaveName}
              disabled={isSubmitting || !roomName.trim() || roomName === currentRoom?.name}
            >
              Save
            </Button>
          </div>
        ) : (
          <p className={styles.roomNameDisplay}>{currentRoom?.name}</p>
        )}
      </div>

      <div className={styles.section}>
        <h3>Members</h3>
        {isLoadingMembers ? (
          <p className={styles.loadingText}>Loading...</p>
        ) : (
          <ul className={styles.membersList}>
            {members.map((member) => (
              <li key={member.userId} className={styles.memberItem}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>
                    @{member.username}
                    {member.userId === user?.id && <span className={styles.youBadge}>you</span>}
                  </span>
                  <span className={`${styles.memberRole} ${styles[`role${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}`]}`}>
                    {member.role}
                  </span>
                  {isOwner && member.role !== 'owner' && (
                    <div className={`${styles.canInvitePill} ${member.canInvite ? styles.active : ''}`}>
                      <Switch
                        checked={member.canInvite}
                        onChange={() => handleToggleCanInvite(member)}
                        size="xs"
                      />
                      <span>Can invite</span>
                    </div>
                  )}
                </div>
                <div className={styles.memberActions}>
                  {canRemoveMember(member) && (
                    <button
                      className={styles.memberRemove}
                      onClick={() => setConfirmDialog({ type: 'removeMember', member })}
                      disabled={isSubmitting}
                      title="Remove member"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}

            {pendingInvites.map((invite) => (
              <li key={invite.id} className={`${styles.memberItem} ${styles.pendingInvite}`}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>
                    @{invite.inviteeUsername}
                    <span className={styles.pendingBadge}>pending</span>
                  </span>
                  <span className={`${styles.memberRole} ${styles[`role${invite.role.charAt(0).toUpperCase()}${invite.role.slice(1)}`]}`}>
                    {invite.role}
                  </span>
                </div>
                <button
                  className={styles.memberRemove}
                  onClick={() => setConfirmDialog({ type: 'cancelInvite', invite })}
                  disabled={isSubmitting}
                  title="Cancel invitation"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {canInviteUsers && (
          <form className={styles.inviteFormStandalone} onSubmit={handleInvite}>
            <div className={styles.inviteInputRow}>
              <input
                type="text"
                value={inviteForm.username}
                onChange={(e) => setInviteForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Enter username to invite"
                className={styles.inviteInputField}
              />
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value as 'owner' | 'editor' | 'viewer' }))}
                className={styles.inviteRoleSelect}
              >
                {availableRoles.map(role => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.inviteOptionsRow}>
              {isOwner && (
                <div className={`${styles.canInvitePill} ${inviteForm.canInvite ? styles.active : ''}`}>
                  <Switch
                    checked={inviteForm.canInvite}
                    onChange={(checked) => setInviteForm(prev => ({ ...prev, canInvite: checked }))}
                    size="xs"
                  />
                  <span>Can invite</span>
                </div>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !inviteForm.username.trim()}
              >
                Invite
              </Button>
            </div>
          </form>
        )}
      </div>

      {showDangerZone && (
        <div className={`${styles.section} ${styles.dangerZone}`}>
          <h3>Danger Zone</h3>
          {canDeleteRoom ? (
            confirmDialog?.type === 'delete' ? (
              <div className={styles.confirmAction}>
                <p>Are you sure? This will permanently delete this room and all its contents.</p>
                <div className={styles.confirmButtons}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDialog(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteRoom}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Deleting...' : 'Delete Room'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDialog({ type: 'delete' })}>
                Delete Room
              </Button>
            )
          ) : canLeaveRoom ? (
            confirmDialog?.type === 'leave' ? (
              <div className={styles.confirmAction}>
                <p>Are you sure you want to leave this room?</p>
                <div className={styles.confirmButtons}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDialog(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleLeaveRoom}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Leaving...' : 'Leave Room'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDialog({ type: 'leave' })}>
                Leave Room
              </Button>
            )
          ) : null}
        </div>
      )}

      {confirmDialog?.type === 'removeMember' && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDialog(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <p>Remove <strong>@{confirmDialog.member.username}</strong> from this room?</p>
            <div className={styles.confirmButtons}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDialog(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmRemoveMember}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog?.type === 'cancelInvite' && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDialog(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <p>Cancel invitation for <strong>@{confirmDialog.invite.inviteeUsername}</strong>?</p>
            <div className={styles.confirmButtons}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDialog(null)}
                disabled={isSubmitting}
              >
                Keep
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancelInvite}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Canceling...' : 'Cancel Invite'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
