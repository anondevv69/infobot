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

export interface BroadcastedClankerToken {
  id: string;
  contract_address: string;
  deployer_fid: number;
  deployer_score: number;
  broadcasted_at: Date;
  created_at: Date;
}

export interface SeenTelegramChat {
  id: string;
  chat_id: string;
  chat_title: string;
  chat_type: string;
  member_count: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
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
    CREATE TABLE IF NOT EXISTS broadcasted_clanker_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_address TEXT NOT NULL UNIQUE,
      deployer_fid INTEGER NOT NULL,
      deployer_score INTEGER NOT NULL,
      broadcasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_broadcasted_clanker_contract ON broadcasted_clanker_tokens(contract_address);
    CREATE INDEX IF NOT EXISTS idx_broadcasted_clanker_fid ON broadcasted_clanker_tokens(deployer_fid);
    CREATE TABLE IF NOT EXISTS seen_telegram_chats (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id TEXT NOT NULL UNIQUE,
      chat_title TEXT NOT NULL,
      chat_type TEXT NOT NULL,
      member_count INTEGER,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_seen_telegram_chat_id ON seen_telegram_chats(chat_id);
    CREATE TABLE IF NOT EXISTS seen_discord_guilds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL UNIQUE,
      guild_name TEXT NOT NULL,
      member_count INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_seen_discord_guild_id ON seen_discord_guilds(guild_id);
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

export async function hasBroadcastedClankerToken(contractAddress: string): Promise<boolean> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM broadcasted_clanker_tokens WHERE contract_address = $1`,
    [contractAddress.toLowerCase()],
  );
  return parseInt(rows[0]?.count || "0", 10) > 0;
}

export async function markClankerTokenAsBroadcasted(
  contractAddress: string,
  deployerFid: number,
  deployerScore: number,
): Promise<BroadcastedClankerToken> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  const { rows } = await pool.query<BroadcastedClankerToken>(
    `
      INSERT INTO broadcasted_clanker_tokens (contract_address, deployer_fid, deployer_score)
      VALUES ($1, $2, $3)
      ON CONFLICT (contract_address) DO UPDATE SET 
        deployer_fid = EXCLUDED.deployer_fid,
        deployer_score = EXCLUDED.deployer_score,
        broadcasted_at = NOW()
      RETURNING *;
    `,
    [contractAddress.toLowerCase(), deployerFid, deployerScore],
  );
  return rows[0];
}

export async function hasSeenTelegramChat(chatId: string): Promise<boolean> {
  if (!pool) {
    return false; // If no DB, allow logging (fallback to in-memory)
  }
  
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM seen_telegram_chats WHERE chat_id = $1`,
    [chatId],
  );
  return parseInt(rows[0]?.count || "0", 10) > 0;
}

export async function markTelegramChatAsSeen(
  chatId: string,
  chatTitle: string,
  chatType: string,
  memberCount: number | null,
): Promise<{ record: SeenTelegramChat; isNew: boolean }> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  // Check if it already exists first
  const existing = await hasSeenTelegramChat(chatId);
  
  const { rows } = await pool.query<SeenTelegramChat>(
    `
      INSERT INTO seen_telegram_chats (chat_id, chat_title, chat_type, member_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (chat_id) DO UPDATE SET 
        chat_title = EXCLUDED.chat_title,
        chat_type = EXCLUDED.chat_type,
        member_count = EXCLUDED.member_count,
        last_seen_at = NOW()
      RETURNING *;
    `,
    [chatId, chatTitle, chatType, memberCount],
  );
  
  return {
    record: rows[0],
    isNew: !existing, // Return whether this was a new insert
  };
}

export async function hasSeenDiscordGuild(guildId: string): Promise<boolean> {
  if (!pool) {
    return false; // If no DB, allow logging (fallback to in-memory)
  }
  
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM seen_discord_guilds WHERE guild_id = $1`,
    [guildId],
  );
  return parseInt(rows[0]?.count || "0", 10) > 0;
}

export async function markDiscordGuildAsSeen(
  guildId: string,
  guildName: string,
  memberCount: number,
  ownerId: string,
): Promise<void> {
  if (!pool) {
    throw new Error("Database not configured (DATABASE_URL not set)");
  }
  
  await pool.query(
    `
      INSERT INTO seen_discord_guilds (guild_id, guild_name, member_count, owner_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (guild_id) DO UPDATE SET 
        guild_name = EXCLUDED.guild_name,
        member_count = EXCLUDED.member_count,
        owner_id = EXCLUDED.owner_id,
        last_seen_at = NOW()
    `,
    [guildId, guildName, memberCount, ownerId],
  );
}

