# Public Bot Setup Guide

This guide explains how to make your bot available for others to add to their Discord servers.

## Current Setup vs Public Bot

### Current Setup (Private/Development)
- Commands registered to a specific guild (server)
- Only works in your test server
- Fast command registration (instant)
- Uses `DISCORD_GUILD_ID` for guild-specific commands

### Public Bot (Available to Everyone)
- Commands registered globally (all servers)
- Anyone can add your bot to their server
- Slower command registration (up to 1 hour to propagate)
- Requires OAuth2 setup for invite links
- No `DISCORD_GUILD_ID` needed (or set it for dev only)

---

## Making Your Bot Public

### Step 1: Enable Public Bot in Discord Developer Portal

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Select your bot application
3. Go to **"Bot"** section
4. Under **"Privileged Gateway Intents"**, enable:
   - ✅ **MESSAGE CONTENT INTENT** (if your bot reads message content)
   - ✅ **SERVER MEMBERS INTENT** (if you need member data)
5. Scroll down to **"PUBLIC BOT"** section
6. Toggle **"Public Bot"** to **ON**
7. Save changes

### Step 2: Update Command Registration

**Option A: Global Commands (Recommended for Public Bot)**

Remove or don't set `DISCORD_GUILD_ID` in your environment variables:

```bash
# In Railway/Render/etc, remove or leave empty:
DISCORD_GUILD_ID=  # Leave empty for global commands
```

Or modify `registerCommands.ts` to default to global:

```typescript
// If DISCORD_GUILD_ID is not set, register globally
const guildId = process.env.DISCORD_GUILD_ID || undefined;
```

**Option B: Keep Guild ID for Development**

You can keep `DISCORD_GUILD_ID` set for your test server, but also register globally:

```typescript
// Register to both guild (for testing) and globally (for public)
await rest.put(
  Routes.applicationGuildCommands(clientId, guildId),
  { body: commands }
);
// Also register globally
await rest.put(
  Routes.applicationCommands(clientId),
  { body: commands }
);
```

### Step 3: Create Invite Link

Generate an OAuth2 invite URL that others can use:

**Basic Permissions Needed:**
- Read Messages
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands

**Invite URL Generator:**
Go to Discord Developer Portal → OAuth2 → URL Generator

Select:
- ✅ `bot`
- ✅ `applications.commands` (for slash commands)

Select Bot Permissions:
- ✅ Send Messages
- ✅ Embed Links
- ✅ Read Message History
- ✅ Use Slash Commands
- ✅ Read Messages/View Channels

**Generated URL will look like:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=PERMISSIONS&scope=bot%20applications.commands
```

**Share this URL** so others can add your bot!

### Step 4: Update Registration Script

Modify `src/registerCommands.ts` to support both modes:

```typescript
// Register commands globally (for public) or to guild (for dev)
const guildId = process.env.DISCORD_GUILD_ID;

if (guildId) {
  // Development: Register to specific guild (instant)
  console.log("Registering commands to guild:", guildId);
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );
} else {
  // Production: Register globally (takes up to 1 hour)
  console.log("Registering commands globally...");
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log("Global commands registered. May take up to 1 hour to appear.");
}
```

---

## Deployment Considerations

### Railway/Render Still Works!

Public bot deployment works the same way:
- ✅ Still use Railway/Render
- ✅ Same environment variables (just remove/leave empty `DISCORD_GUILD_ID`)
- ✅ Same auto-deploy workflow
- ✅ No changes needed to deployment process

### Environment Variables for Public Bot

```bash
# Required
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
NEYNAR_API_KEY=your-neynar-key
ZORA_API_KEY=your-zora-key

# Optional (leave empty for global commands)
DISCORD_GUILD_ID=  # Empty = global commands

# Optional
APP_VERSION=1.0.0
BRAND_NAME=InfoBot
```

---

## Testing Public Bot Setup

### 1. Test Locally with Global Commands

```bash
# Remove DISCORD_GUILD_ID from .env or leave it empty
# Then register commands
npm run register-commands

# Should see: "Registering commands globally..."
```

### 2. Test in a Different Server

1. Create a test Discord server (or use a friend's)
2. Add your bot using the invite link
3. Wait up to 1 hour for commands to appear
4. Test that commands work

### 3. Deploy to Cloud

```bash
# Push to GitHub
git add .
git commit -m "Enable public bot with global commands"
git push origin main

# Railway/Render will auto-deploy
# Commands will register globally
```

---

## Command Registration Strategy

### Development (Fast Testing)
- Set `DISCORD_GUILD_ID` in local `.env`
- Commands register instantly to your test server
- Fast iteration during development

### Production (Public Bot)
- Don't set `DISCORD_GUILD_ID` (or leave empty)
- Commands register globally
- Takes up to 1 hour to propagate
- Works in all servers

### Hybrid Approach
You can register to both:
- Guild commands for your test server (instant)
- Global commands for public use (slower)

---

## Monitoring Public Bot

### Track Usage
- Discord Developer Portal → Analytics
- See server count, command usage
- Monitor rate limits

### Rate Limits
- Global command registration: Limited to 200 commands/day
- Guild command registration: 50 commands/day per guild
- Be mindful when updating commands frequently

### Error Handling
Make sure your bot handles:
- Commands in servers it wasn't tested in
- Missing permissions
- Different server configurations

---

## Quick Checklist for Public Bot

- [ ] Enable "Public Bot" in Discord Developer Portal
- [ ] Enable required Gateway Intents
- [ ] Remove or leave empty `DISCORD_GUILD_ID` for global commands
- [ ] Update `registerCommands.ts` to support global registration
- [ ] Generate OAuth2 invite URL with proper permissions
- [ ] Test bot in a different server
- [ ] Deploy to Railway/Render
- [ ] Share invite link!

---

## Example: Updated registerCommands.ts

```typescript
import { REST, Routes } from "discord.js";
import { env } from "./config";
import { commands } from "./commands";

const rest = new REST().setToken(env.discordToken);

async function registerCommands() {
  try {
    const clientId = env.discordClientId;
    const guildId = env.discordGuildId; // Can be undefined

    if (guildId) {
      // Development: Guild-specific (instant)
      console.log(`Registering ${commands.length} commands to guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log("✅ Guild commands registered!");
    } else {
      // Production: Global (takes up to 1 hour)
      console.log(`Registering ${commands.length} commands globally...`);
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log("✅ Global commands registered!");
      console.log("⏳ Commands may take up to 1 hour to appear in servers.");
    }
  } catch (error) {
    console.error("Failed to register commands:", error);
    process.exit(1);
  }
}

registerCommands();
```

---

## Summary

**Making your bot public does NOT change:**
- ✅ Railway/Render deployment (works the same)
- ✅ GitHub workflow (same push process)
- ✅ Code structure (no major changes needed)

**What DOES change:**
- 🔄 Command registration (global vs guild)
- 🔄 Need to enable "Public Bot" in Discord portal
- 🔄 Need to generate invite URL
- 🔄 Commands take longer to register (up to 1 hour)

**Workflow stays the same:**
1. Test locally
2. Push to GitHub
3. Auto-deploy to Railway
4. Bot is live and public!

