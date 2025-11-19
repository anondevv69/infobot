import { Pool } from "pg";
import { env } from "../config";
import { logger } from "../utils/logger";

// Only create pool if DATABASE_URL is provided
export const pool = env.DATABASE_URL
  ? new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    })
  : null;

if (pool) {
  pool.on("error", (error: Error) => {
    logger.error("Unexpected error on idle PostgreSQL client", error);
  });
}

export interface SubscriptionRecord {
  id: string;
  guild_id: string;
  channel_id: string;
  fid: number;
  created_at: Date;
  updated_at: Date;
}

export async function ensureSchema(): Promise<void> {
  if (!pool) {
    logger.warn("Database not configured (DATABASE_URL not set). Skipping schema creation.");
    return;
  }
  
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      fid INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id, channel_id, fid)
    );
  `);
}

export async function createSubscription(
  guildId: string,
  channelId: string,
  fid: number,
): Promise<SubscriptionRecord> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  const { rows } = await pool.query<SubscriptionRecord>(
    `
      INSERT INTO subscriptions (guild_id, channel_id, fid)
      VALUES ($1, $2, $3)
      ON CONFLICT (guild_id, channel_id, fid) DO UPDATE SET updated_at = NOW()
      RETURNING *;
    `,
    [guildId, channelId, fid],
  );
  return rows[0];
}

export async function deleteSubscription(
  guildId: string,
  channelId: string,
  fid: number,
): Promise<boolean> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  const { rowCount } = await pool.query(
    `DELETE FROM subscriptions WHERE guild_id = $1 AND channel_id = $2 AND fid = $3`,
    [guildId, channelId, fid],
  );
  return (rowCount ?? 0) > 0;
}

export async function listSubscriptionsForGuild(
  guildId: string,
): Promise<SubscriptionRecord[]> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  const { rows } = await pool.query<SubscriptionRecord>(
    `SELECT * FROM subscriptions WHERE guild_id = $1 ORDER BY fid`,
    [guildId],
  );
  return rows;
}

export async function listSubscriptionsForFid(
  fid: number,
): Promise<SubscriptionRecord[]> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  const { rows } = await pool.query<SubscriptionRecord>(
    `SELECT * FROM subscriptions WHERE fid = $1`,
    [fid],
  );
  return rows;
}

