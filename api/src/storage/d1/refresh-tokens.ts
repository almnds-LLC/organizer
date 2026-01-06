import type { RefreshToken } from '../types';
import type { IRefreshTokenRepository } from '../interfaces';
import { generateId } from '../../lib/id';
import {
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashToken,
} from '../../auth/tokens';

export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private db: D1Database) {}

  async create(userId: string): Promise<{ token: string; record: RefreshToken }> {
    const id = generateId();
    const token = generateRefreshToken();
    const tokenHash = hashToken(token);
    const expiresAt = getRefreshTokenExpiry();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, userId, tokenHash, expiresAt, now)
      .run();

    return {
      token,
      record: {
        id,
        userId,
        tokenHash,
        expiresAt,
        createdAt: now,
        revokedAt: null,
      },
    };
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const tokenHash = hashToken(token);
    const row = await this.db
      .prepare(
        `SELECT * FROM refresh_tokens
         WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')`
      )
      .bind(tokenHash)
      .first<RefreshTokenRow>();
    return row ? mapRowToRefreshToken(row) : null;
  }

  async revoke(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
      .bind(now, id)
      .run();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL'
      )
      .bind(now, userId)
      .run();
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db
      .prepare("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')")
      .run();
    return result.meta.changes ?? 0;
  }
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

function mapRowToRefreshToken(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}
