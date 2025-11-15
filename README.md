# Discord Neynar Search Bot

This bot lets you query [Neynar](https://github.com/neynarxyz/OAS) for Farcaster user data directly from Discord. It responds to two search flows through a single `/search` command—wallet addresses and usernames—and includes a `/help` command for quick usage reminders. The overall structure mirrors the lightweight Discord bot template from snyk-snippets while swapping in Neynar lookups for Wordle logic [https://github.com/snyk-snippets/discord-wordle-bot-template](https://github.com/snyk-snippets/discord-wordle-bot-template).

## Prerequisites

- Node.js 18+ (Discord.js and Neynar SDK require the active LTS or higher).
- A Discord application with a bot token.
- A Neynar API key with permission to access user lookups.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `env.example` to `.env` and fill in your credentials:

   ```
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=discord-app-client-id
   DISCORD_GUILD_ID=optional-guild-id
   NEYNAR_API_KEY=your-neynar-api-key
   ```

   `DISCORD_GUILD_ID` is optional; include it to register commands to a development server instantly. Omit it for global registration (may take up to an hour to propagate).

3. Register slash commands:

   ```bash
   npm run register-commands
   ```

4. Start the bot:

   ```bash
   npm run dev
   ```

## Commands

- `/search <wallet|username>` – Looks up Farcaster profiles by wallet or username and shows recent Clanker deployments for that user when available.
- `/casts <keyword>` – Returns the earliest cast matching the keyword plus the most recent matching casts (default 2, configurable).
- `/help` – Displays a summary of the available commands and configuration requirements.
- Posting a Warpcast, fcast.me, or farcaster.xyz cast URL in a channel automatically triggers an embed with the cast text, author details, custody wallet, and verified ETH addresses.

Responses render rich embeds with usernames, FIDs, custody addresses, follower counts, bios, and a link to the user's Warpcast profile.

## Production Notes

- Global command registration can take time to synchronize across Discord; for faster feedback during development, set `DISCORD_GUILD_ID`.
- Neynar rate limits depend on your plan—consider adding retry/backoff or caching if you expect high traffic.
- Use `npm run build` followed by `npm start` for production deployments.

## Backend Service (Webhook + Subscriptions)

The `backend/` directory contains an Express-based API for managing guild subscriptions and receiving Neynar webhooks.

### Setup

```bash
cd backend
cp env.example .env # fill in DATABASE_URL, DISCORD_BOT_TOKEN, NEYNAR_API_KEY, WEBHOOK_SECRET
npm install
npm run dev
```

The service exposes:

- `POST /api/subscriptions` – create or update a guild subscription (`guildId`, `channelId`, `fid`).
- `DELETE /api/subscriptions` – remove a subscription.
- `GET /api/subscriptions?guildId=` – list subscriptions for a guild.
- `POST /webhooks/neynar` – webhook endpoint Neynar uses to deliver `cast.created` events (secured via `x-webhook-secret` header).

When deployed (e.g., on Railway), point Neynar’s webhook configuration at the `/webhooks/neynar` endpoint.

