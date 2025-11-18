import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DISCORD_BOT_TOKEN: z.string().min(1),
  NEYNAR_API_KEY: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  DATABASE_URL: z.string().url().optional(),
  BACKEND_URL: z.string().url().optional(),
  FARCASTER_REFERRAL_CODE: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const isDevelopment = env.NODE_ENV === "development";

