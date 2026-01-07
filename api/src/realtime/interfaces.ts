import type { SyncMessage, ConnectionInfo } from '../durable-objects/types';

export type { SyncMessage, ConnectionInfo };

export interface IRealtimeRoom {
  getConnectedUsers(): Promise<ConnectionInfo[]>;
  broadcast(message: SyncMessage, excludeUserId?: string): Promise<void>;
}

export interface IRealtimeProvider {
  getRoom(roomId: string): IRealtimeRoom;
  handleWebSocketUpgrade(
    request: Request,
    roomId: string,
    userInfo: { userId: string; username: string; role: string }
  ): Promise<Response>;
}
