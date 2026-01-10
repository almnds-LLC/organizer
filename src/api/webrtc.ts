import { roomWebSocket, type SyncMessage } from './websocket';

interface PeerConnection {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  userId: string;
  username: string;
  // Track if we're waiting for an answer (we sent an offer)
  makingOffer: boolean;
  // Queue ICE candidates until remote description is set
  pendingCandidates: RTCIceCandidateInit[];
  // Track reconnection attempts
  reconnectAttempts: number;
  // Timer for delayed reconnection
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface CursorPosition {
  worldX: number;
  worldY: number;
  drawerId?: string;
  compartmentId?: string;
  // Selected compartments for mass selection highlight
  selectedCompartmentIds?: string[];
}

type CursorUpdateHandler = (userId: string, username: string, position: CursorPosition | null) => void;

class WebRTCManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localUserId: string | null = null;
  private cursorHandlers: Set<CursorUpdateHandler> = new Set();
  private isMobile: boolean = false;
  private unsubscribe: (() => void) | null = null;

  private readonly rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  };

  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY = 2000;

  // Determine if we're the "polite" peer (yields on glare)
  private isPolite(remoteUserId: string): boolean {
    return (this.localUserId || '') < remoteUserId;
  }

  initialize(userId: string, _username: string, isMobile: boolean): void {
    this.localUserId = userId;
    this.isMobile = isMobile;
    this.unsubscribe = roomWebSocket.onMessage(this.handleSignalingMessage);
  }

  cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.peers.forEach((peer) => {
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
      }
      peer.dataChannel?.close();
      peer.connection.close();
    });
    this.peers.clear();
  }

  async connectToPeer(userId: string, username: string, isReconnect = false): Promise<void> {
    if (userId === this.localUserId) return;

    // If reconnecting, get existing attempt count; otherwise check if peer exists
    const existingPeer = this.peers.get(userId);
    if (existingPeer && !isReconnect) return;

    const reconnectAttempts = isReconnect ? (existingPeer?.reconnectAttempts ?? 0) : 0;

    // Clean up existing peer if reconnecting
    if (existingPeer) {
      if (existingPeer.reconnectTimer) {
        clearTimeout(existingPeer.reconnectTimer);
      }
      existingPeer.dataChannel?.close();
      existingPeer.connection.close();
      this.peers.delete(userId);
    }

    const connection = new RTCPeerConnection(this.rtcConfig);
    const peer: PeerConnection = {
      connection,
      dataChannel: null,
      userId,
      username,
      makingOffer: true,
      pendingCandidates: [],
      reconnectAttempts,
      reconnectTimer: null,
    };

    const dataChannel = connection.createDataChannel('cursors', {
      ordered: false,
      maxRetransmits: 0,
    });

    peer.dataChannel = dataChannel;
    this.setupDataChannel(dataChannel, userId, username);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        roomWebSocket.send({
          type: 'rtc_ice_candidate',
          targetUserId: userId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    connection.onconnectionstatechange = () => {
      this.handleConnectionStateChange(userId, connection.connectionState);
    };

    this.peers.set(userId, peer);

    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);

      roomWebSocket.send({
        type: 'rtc_offer',
        targetUserId: userId,
        sdp: offer,
      });
    } catch (error) {
      console.error('Failed to create WebRTC offer:', error);
      this.scheduleReconnect(userId, username);
    }
  }

  private handleConnectionStateChange(userId: string, state: RTCPeerConnectionState): void {
    const peer = this.peers.get(userId);
    if (!peer) return;

    if (state === 'connected') {
      // Reset reconnect attempts on successful connection
      peer.reconnectAttempts = 0;
    } else if (state === 'disconnected') {
      // Schedule reconnect after a delay (connection might recover)
      peer.reconnectTimer = setTimeout(() => {
        const currentPeer = this.peers.get(userId);
        if (currentPeer?.connection.connectionState === 'disconnected') {
          this.scheduleReconnect(userId, peer.username);
        }
      }, this.RECONNECT_DELAY);
    } else if (state === 'failed') {
      // Immediate reconnect attempt
      this.scheduleReconnect(userId, peer.username);
    }
  }

  private scheduleReconnect(userId: string, username: string): void {
    const peer = this.peers.get(userId);
    const attempts = peer?.reconnectAttempts ?? 0;

    if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.removePeer(userId);
      return;
    }

    // Increment attempts before reconnecting
    if (peer) {
      peer.reconnectAttempts = attempts + 1;
    }

    const delay = this.RECONNECT_DELAY * Math.pow(2, attempts);
    setTimeout(() => {
      // Only reconnect if WebSocket is still connected and user hasn't left
      if (roomWebSocket.isConnected()) {
        const connectedUsers = roomWebSocket.getConnectedUsers();
        if (connectedUsers.some(u => u.userId === userId)) {
          this.connectToPeer(userId, username, true);
        }
      }
    }, delay);
  }

  private handleSignalingMessage = async (message: SyncMessage): Promise<void> => {
    switch (message.type) {
      case 'rtc_offer':
        if (message.senderId && message.senderUsername) {
          await this.handleOffer(message.senderId, message.senderUsername, message.sdp);
        }
        break;
      case 'rtc_answer':
        if (message.senderId) {
          await this.handleAnswer(message.senderId, message.sdp);
        }
        break;
      case 'rtc_ice_candidate':
        if (message.senderId) {
          await this.handleIceCandidate(message.senderId, message.candidate);
        }
        break;
      case 'user_joined':
        await this.connectToPeer(message.userId, message.username);
        break;
      case 'user_left':
        this.removePeer(message.userId);
        this.cursorHandlers.forEach(h => h(message.userId, '', null));
        break;
    }
  };

  private async handleOffer(senderId: string, senderUsername: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (senderId === this.localUserId) return;

    const existingPeer = this.peers.get(senderId);

    // Handle glare: both peers sent offers simultaneously
    if (existingPeer?.makingOffer) {
      // If we're the "impolite" peer, ignore their offer - they'll accept ours
      if (!this.isPolite(senderId)) {
        return;
      }
      // We're the polite peer - close our connection and accept theirs
      if (existingPeer.reconnectTimer) {
        clearTimeout(existingPeer.reconnectTimer);
      }
      existingPeer.dataChannel?.close();
      existingPeer.connection.close();
      this.peers.delete(senderId);
    }

    const connection = new RTCPeerConnection(this.rtcConfig);
    const peer: PeerConnection = {
      connection,
      dataChannel: null,
      userId: senderId,
      username: senderUsername,
      makingOffer: false,
      pendingCandidates: existingPeer?.pendingCandidates || [],
      reconnectAttempts: 0,
      reconnectTimer: null,
    };

    connection.ondatachannel = (event) => {
      peer.dataChannel = event.channel;
      this.setupDataChannel(event.channel, senderId, senderUsername);
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        roomWebSocket.send({
          type: 'rtc_ice_candidate',
          targetUserId: senderId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    connection.onconnectionstatechange = () => {
      this.handleConnectionStateChange(senderId, connection.connectionState);
    };

    this.peers.set(senderId, peer);

    try {
      await connection.setRemoteDescription(sdp);

      // Process any ICE candidates that arrived before the offer
      for (const candidate of peer.pendingCandidates) {
        await connection.addIceCandidate(candidate);
      }
      peer.pendingCandidates = [];

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      roomWebSocket.send({
        type: 'rtc_answer',
        targetUserId: senderId,
        sdp: answer,
      });
    } catch (error) {
      console.error('Failed to handle WebRTC offer:', error);
      this.scheduleReconnect(senderId, senderUsername);
    }
  }

  private async handleAnswer(senderId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(senderId);
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(sdp);
      peer.makingOffer = false;

      // Process any ICE candidates that arrived before the answer
      for (const candidate of peer.pendingCandidates) {
        await peer.connection.addIceCandidate(candidate);
      }
      peer.pendingCandidates = [];
    } catch (error) {
      console.error('Failed to handle WebRTC answer:', error);
      this.removePeer(senderId);
    }
  }

  private async handleIceCandidate(senderId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(senderId);
    if (!peer) {
      // Candidate arrived before we have a peer connection - can happen in glare scenarios
      // We'll ignore it; the connection will be re-established with fresh ICE candidates
      return;
    }

    // Queue candidate if remote description not set yet
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }

    try {
      await peer.connection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string, peerUsername: string): void {
    channel.onopen = () => {};

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'cursor') {
          this.cursorHandlers.forEach(h => h(peerId, peerUsername, data.position));
        }
      } catch (error) {
        console.error('Failed to parse WebRTC message:', error);
      }
    };

    channel.onclose = () => {
      // Only notify cursor removal if this peer is actually gone
      // (not during glare when we're accepting a new connection)
      const peer = this.peers.get(peerId);
      if (!peer || peer.dataChannel === channel) {
        this.cursorHandlers.forEach(h => h(peerId, peerUsername, null));
      }
    };

    channel.onerror = () => {};
  }

  private removePeer(userId: string): void {
    const peer = this.peers.get(userId);
    if (peer) {
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
      }
      peer.dataChannel?.close();
      peer.connection.close();
      this.peers.delete(userId);
      // Notify handlers that cursor is gone
      this.cursorHandlers.forEach(h => h(userId, peer.username, null));
    }
  }

  broadcastCursor(position: CursorPosition): void {
    if (this.isMobile) return;

    const message = JSON.stringify({ type: 'cursor', position });
    this.peers.forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(message);
      }
    });
  }

  onCursorUpdate(handler: CursorUpdateHandler): () => void {
    this.cursorHandlers.add(handler);
    return () => this.cursorHandlers.delete(handler);
  }
}

export const webRTCManager = new WebRTCManager();
