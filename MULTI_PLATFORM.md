# Multi-Platform Support (Discord + Telegram)

This guide explains how to add Telegram support alongside Discord without rebuilding everything.

## Architecture Options

### Option 1: Shared Core Logic (Recommended) ✅

**Best for:** Code reuse, maintainability, single codebase

**Structure:**
```
src/
├── core/                    # Shared business logic
│   ├── services/           # API calls (Neynar, Zora, Clanker, DexScreener)
│   ├── utils/              # Shared utilities (formatting, parsing)
│   └── types/              # Shared TypeScript types
├── platforms/
│   ├── discord/            # Discord-specific code
│   │   ├── handlers/       # Discord message handlers
│   │   ├── commands/       # Discord slash commands
│   │   └── adapters/       # Convert core data → Discord embeds
│   └── telegram/           # Telegram-specific code
│       ├── handlers/       # Telegram message handlers
│       ├── commands/       # Telegram commands
│       └── adapters/       # Convert core data → Telegram messages
├── index.ts                # Main entry point
└── discord.ts              # Discord bot entry
└── telegram.ts              # Telegram bot entry
```

**How it works:**
- Core logic (services, utils) stays the same
- Platform-specific adapters convert data to Discord embeds or Telegram messages
- Run both bots from same codebase (or separate services)

---

### Option 2: Separate Services

**Best for:** Independent scaling, different deployment needs

**Structure:**
```
discord-bot/
├── src/
│   ├── services/           # Copy or share via npm package
│   ├── handlers/
│   └── index.ts

telegram-bot/
├── src/
│   ├── services/           # Copy or share via npm package
│   ├── handlers/
│   └── index.ts

shared-package/              # Optional: npm package
├── services/
└── utils/
```

**How it works:**
- Separate codebases
- Share core logic via npm package or copy
- Deploy independently

---

### Option 3: Single Service with Both Integrations

**Best for:** Simpler deployment, shared resources

**Structure:**
```
src/
├── services/               # Shared
├── utils/                  # Shared
├── platforms/
│   ├── discord.ts         # Discord bot instance
│   └── telegram.ts        # Telegram bot instance
└── index.ts                # Start both bots
```

**How it works:**
- Single Node.js process runs both bots
- Shared services and utilities
- Platform-specific handlers

---

## Recommended Approach: Option 1 (Shared Core)

### Step 1: Reorganize Current Code

Move shared logic to `core/`:

```bash
# Create new structure
mkdir -p src/core/services
mkdir -p src/core/utils
mkdir -p src/platforms/discord
mkdir -p src/platforms/telegram

# Move shared services
mv src/services/* src/core/services/

# Move shared utils (keep Discord-specific ones separate)
# Identify which utils are platform-agnostic
```

### Step 2: Create Platform Adapters

**Discord Adapter** (`src/platforms/discord/adapters/embedBuilder.ts`):
```typescript
import { EmbedBuilder } from "discord.js";
import type { ZoraCoinSummary } from "../../../core/types";

export function buildDiscordEmbed(data: ZoraCoinSummary): EmbedBuilder {
  // Your existing embed building logic
  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.description);
  return embed;
}
```

**Telegram Adapter** (`src/platforms/telegram/adapters/messageBuilder.ts`):
```typescript
import type { ZoraCoinSummary } from "../../../core/types";

export function buildTelegramMessage(data: ZoraCoinSummary): string {
  // Convert same data to Telegram format
  return `*${data.title}*\n\n${data.description}\n\n...`;
}
```

### Step 3: Create Telegram Bot

**Install Telegram library:**
```bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
```

**Telegram Handler** (`src/platforms/telegram/handlers/search.ts`):
```typescript
import TelegramBot from "node-telegram-bot-api";
import { findBestZoraSummary } from "../../../core/services/zora";
import { buildTelegramMessage } from "../adapters/messageBuilder";

export async function handleTelegramSearch(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  query: string
) {
  // Use same core service
  const summary = await findBestZoraSummary([query]);
  
  // Convert to Telegram format
  const message = buildTelegramMessage(summary);
  
  // Send to Telegram
  bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
}
```

### Step 4: Run Both Bots

**Option A: Separate Processes** (Recommended for production)

`package.json`:
```json
{
  "scripts": {
    "start:discord": "node dist/discord.js",
    "start:telegram": "node dist/telegram.js",
    "start:all": "concurrently \"npm run start:discord\" \"npm run start:telegram\""
  }
}
```

**Option B: Single Process**

`src/index.ts`:
```typescript
import { startDiscordBot } from "./platforms/discord";
import { startTelegramBot } from "./platforms/telegram";

async function main() {
  await Promise.all([
    startDiscordBot(),
    startTelegramBot(),
  ]);
}

main();
```

---

## Migration Strategy

### Phase 1: Prepare (No Breaking Changes)

1. **Identify shared code:**
   - Services (Neynar, Zora, Clanker, DexScreener) → Move to `core/services/`
   - Utils (formatting, parsing) → Move to `core/utils/`
   - Types → Move to `core/types/`

2. **Keep Discord code working:**
   - Update imports to point to `core/`
   - Test that Discord bot still works

### Phase 2: Add Telegram

1. **Create Telegram structure:**
   - `src/platforms/telegram/`
   - Handlers, adapters, commands

2. **Reuse core services:**
   - Import from `core/services/`
   - Same API calls, same data

3. **Create Telegram adapters:**
   - Convert core data → Telegram messages
   - Handle Telegram-specific features (keyboards, inline buttons)

### Phase 3: Deploy

**Option A: Same Service (Railway)**
- Single Railway service runs both bots
- Same environment variables
- Shared resources

**Option B: Separate Services (Railway)**
- Two Railway services
- Discord bot service
- Telegram bot service
- Each can scale independently

---

## Example: Shared Service Usage

**Before (Discord-only):**
```typescript
// src/handlers/zoraAddress.ts
import { fetchZoraCoin } from "../services/zora";
import { buildZoraCoinEmbed } from "../utils/zoraEmbeds";

const coin = await fetchZoraCoin(address);
const embed = buildZoraCoinEmbed(coin);
await message.reply({ embeds: [embed] });
```

**After (Multi-platform):**
```typescript
// src/platforms/discord/handlers/zoraAddress.ts
import { fetchZoraCoin } from "../../../core/services/zora";
import { buildDiscordZoraEmbed } from "../adapters/zoraAdapter";

const coin = await fetchZoraCoin(address);
const embed = buildDiscordZoraEmbed(coin);
await message.reply({ embeds: [embed] });

// src/platforms/telegram/handlers/zoraAddress.ts
import { fetchZoraCoin } from "../../../core/services/zora";
import { buildTelegramZoraMessage } from "../adapters/zoraAdapter";

const coin = await fetchZoraCoin(address);
const message = buildTelegramZoraMessage(coin);
await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
```

---

## Environment Variables

Add Telegram token:

```bash
# Discord (existing)
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...

# Telegram (new)
TELEGRAM_BOT_TOKEN=...

# Shared (existing)
NEYNAR_API_KEY=...
ZORA_API_KEY=...
```

---

## Deployment Options

### Option 1: Single Railway Service

**Pros:**
- One deployment
- Shared environment variables
- Simpler setup

**Cons:**
- If one crashes, both go down
- Can't scale independently

**Setup:**
- Add `TELEGRAM_BOT_TOKEN` to Railway variables
- Update start command to run both bots

### Option 2: Separate Railway Services

**Pros:**
- Independent scaling
- Isolated failures
- Different resource allocation

**Cons:**
- Two deployments to manage
- Duplicate environment variables

**Setup:**
- Create two Railway services
- One for Discord, one for Telegram
- Each has its own environment variables

---

## Quick Start: Adding Telegram

### 1. Install Dependencies

```bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
```

### 2. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. `/newbot` → Follow instructions
3. Get your bot token

### 3. Create Basic Telegram Handler

`src/platforms/telegram/index.ts`:
```typescript
import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config";

const bot = new TelegramBot(env.telegramBotToken!, { polling: true });

bot.onText(/\/search (.+)/, async (msg, match) => {
  const query = match![1];
  // Use your existing core services
  // Convert to Telegram message format
  bot.sendMessage(msg.chat.id, `Searching for: ${query}`);
});

export function startTelegramBot() {
  console.log("Telegram bot started");
}
```

### 4. Update Config

`src/config.ts`:
```typescript
export const env = {
  // ... existing
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
} as const;
```

### 5. Run Both

```typescript
// src/index.ts
import { startDiscordBot } from "./platforms/discord";
import { startTelegramBot } from "./platforms/telegram";

Promise.all([
  startDiscordBot(),
  startTelegramBot(),
]);
```

---

## Summary

**You DON'T need to rebuild everything!**

✅ **Reuse:**
- All services (Neynar, Zora, Clanker, DexScreener)
- All utilities (formatting, parsing)
- All business logic

🔄 **Adapt:**
- Discord embeds → Telegram messages
- Discord slash commands → Telegram commands
- Platform-specific UI differences

📦 **Deploy:**
- Same Railway service (both bots)
- Or separate services (independent scaling)

**The core logic stays the same - you just add platform-specific adapters!**

