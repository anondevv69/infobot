import { config as loadEnv } from "dotenv";

loadEnv({ override: true });

const requiredEnv = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "NEYNAR_API_KEY",
  "ZORA_API_KEY",
] as const;

type RequiredEnvKey = typeof requiredEnv[number];

export const env = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordGuildId: process.env.DISCORD_GUILD_ID,
  discordGuildIds: process.env.DISCORD_GUILD_IDS,
  neynarApiKey: process.env.NEYNAR_API_KEY,
  zoraApiKey: process.env.ZORA_API_KEY,
  bitqueryApiKey: process.env.BITQUERY_API_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  basescanApiKey: process.env.BASESCAN_API_KEY, // Optional: for better rate limits
  quicknodeApiKey: process.env.QUICKNODE_API_KEY, // Optional: for premium RPC endpoints
  oneinchApiKey: process.env.ONEINCH_API_KEY, // Optional: for 1inch DEX aggregator (better rate limits)
  farcasterReferralCode: process.env.FARCASTER_REFERRAL_CODE ?? "2ORGMS",
  backendUrl: process.env.BACKEND_URL || "https://infobot-production-f74e.up.railway.app", // Backend URL for SIWF callbacks
  miniappUrl: process.env.MINIAPP_URL || "https://farcaster.xyz/miniapps/J68v-h9yA2J3/infobot", // Mini App URL for Farcaster authentication (Farcaster-hosted URL)
  signerEncryptionKey: process.env.SIGNER_ENCRYPTION_KEY, // Encryption key for signer private keys (REQUIRED in production)
  brandName: process.env.BRAND_NAME ?? "InfoBot",
  brandIconUrl:
    process.env.BRAND_ICON_URL ??
    "https://cdn.discordapp.com/icons/1437648173580419135/cb1a16f9db86f0a68fb7bbde8c99d650.png?size=96",
  appVersion:
    process.env.APP_VERSION ??
    process.env.npm_package_version ??
    "dev",
  autoDeleteDelay: process.env.AUTO_DELETE_DELAY
    ? parseInt(process.env.AUTO_DELETE_DELAY, 10)
    : undefined, // Delay in seconds, undefined = disabled
} as const;

export function requireEnv(value: string | undefined, key: RequiredEnvKey): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

export function validateRequiredEnv(): void {
  requiredEnv.forEach((key) => requireEnv(envMap[key], key));
}

const envMap: Record<RequiredEnvKey, string | undefined> = {
  DISCORD_TOKEN: env.discordToken,
  DISCORD_CLIENT_ID: env.discordClientId,
  NEYNAR_API_KEY: env.neynarApiKey,
  ZORA_API_KEY: env.zoraApiKey,
};

