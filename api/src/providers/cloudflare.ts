import type { IStorageProvider } from './storage';
import type { IRealtimeProvider, IRealtimeRoom, ConnectionInfo } from '../realtime/interfaces';
import { UserRepository } from '../storage/d1/users';
import { RefreshTokenRepository } from '../storage/d1/refresh-tokens';
import { RoomRepository } from '../storage/d1/rooms';
import { DrawerRepository, CompartmentRepository, SubCompartmentRepository } from '../storage/d1/drawers';
import { CategoryRepository } from '../storage/d1/categories';

export interface CloudflareBindings {
  DB: D1Database;
  JWT_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  ROOM_SYNC: DurableObjectNamespace;
}

export function createStorageProvider(env: { DB: D1Database }): IStorageProvider {
  return {
    users: new UserRepository(env.DB),
    refreshTokens: new RefreshTokenRepository(env.DB),
    rooms: new RoomRepository(env.DB),
    drawers: new DrawerRepository(env.DB),
    compartments: new CompartmentRepository(env.DB),
    subCompartments: new SubCompartmentRepository(env.DB),
    categories: new CategoryRepository(env.DB),
  };
}

export function createRealtimeProvider(env: { ROOM_SYNC: DurableObjectNamespace }): IRealtimeProvider {
  return {
    getRoom(roomId: string): IRealtimeRoom {
      const id = env.ROOM_SYNC.idFromName(roomId);
      const stub = env.ROOM_SYNC.get(id);

      return {
        async getConnectedUsers(): Promise<ConnectionInfo[]> {
          const response = await stub.fetch('http://internal/connections');
          const data = await response.json() as { users: ConnectionInfo[] };
          return data.users;
        },

        async broadcast(message: Record<string, unknown>) {
          try {
            await stub.fetch('http://internal/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(message),
            });
          } catch (error) {
            console.error('Failed to broadcast message:', error);
          }
        },
      };
    },

    async handleWebSocketUpgrade(request, roomId, userInfo) {
      const id = env.ROOM_SYNC.idFromName(roomId);
      const stub = env.ROOM_SYNC.get(id);

      const url = new URL(request.url);
      url.pathname = '/ws';
      url.searchParams.set('userId', userInfo.userId);
      url.searchParams.set('username', userInfo.username);
      url.searchParams.set('role', userInfo.role);

      return stub.fetch(url.toString(), request);
    },
  };
}
