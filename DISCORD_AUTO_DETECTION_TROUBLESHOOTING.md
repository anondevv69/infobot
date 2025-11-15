# Discord Auto-Detection Troubleshooting Guide

## Why the Bot Isn't Picking Up Contract Addresses

The bot should automatically detect and respond to:
- Ethereum addresses (0x...)
- Solana addresses
- Zora contract references (base:0x...)
- Farcaster usernames (@username)
- Zora profile links

If it's not working, check these common issues:

## 1. Bot Permissions in Server

The bot needs these permissions:
- ✅ **View Channels** - To see messages
- ✅ **Read Message History** - To read past messages
- ✅ **Send Messages** - To reply
- ✅ **Embed Links** - To send rich embeds
- ✅ **Attach Files** - For some features

### How to Check/Set Permissions:

1. **Right-click your server** → **Server Settings** → **Roles**
2. Find your bot's role (or @everyone if bot has no role)
3. Make sure these permissions are enabled
4. Or use the invite link with permissions: [See INVITE_LINK.md](./INVITE_LINK.md)

## 2. Message Content Intent (REQUIRED)

**This is the most common issue!** Discord requires bots to explicitly enable the "Message Content Intent" to read message content.

### How to Enable:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to **Bot** section
4. Scroll down to **Privileged Gateway Intents**
5. **Enable "MESSAGE CONTENT INTENT"** ✅
6. Save changes
7. **Restart your bot** (Railway will auto-restart if deployed)

### Verify in Code:

The bot should have this in `src/index.ts`:
```typescript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // ← This is required!
  ],
});
```

## 3. Bot is Online

Check if the bot is online:
- Look for the bot in your server member list
- It should show as "Online" (green dot)
- If offline, check Railway logs for errors

## 4. Bot Can See the Channel

Make sure:
- Bot has access to the channel
- Channel isn't hidden from the bot's role
- Bot isn't blocked/muted in the channel

## 5. Test the Bot

Try these in a channel the bot can see:

**Ethereum Address:**
```
0x337aa04e9b09bF2Ba44181ab1e65909a772DFb07
```

**Farcaster Username:**
```
@username
```

**Zora Contract:**
```
base:0x1234...5678
```

**Or use commands:**
```
/search 0x337aa04e9b09bF2Ba44181ab1e65909a772DFb07
/clanker 0x337aa04e9b09bF2Ba44181ab1e65909a772DFb07
/zora @username
```

## 6. Check Bot Logs

If deployed on Railway:
1. Go to Railway dashboard
2. Click on your service
3. Go to **Logs** tab
4. Look for errors or warnings
5. Check if you see: `Logged in as YourBot#1234`

## 7. Common Issues

### Bot Responds to Commands but Not Auto-Detection
- **Issue**: Message Content Intent not enabled
- **Fix**: Enable in Discord Developer Portal (see #2 above)

### Bot Doesn't Respond at All
- **Issue**: Bot offline or permissions missing
- **Fix**: Check bot status and permissions (see #1 and #3 above)

### Bot Responds in Some Channels but Not Others
- **Issue**: Channel-specific permissions
- **Fix**: Check channel permissions for bot role

### Bot Responds to Some Addresses but Not Others
- **Issue**: Address format or API issues
- **Fix**: Check Railway logs for API errors

## Quick Checklist

- [ ] Bot is online (green dot in member list)
- [ ] Bot has "View Channels" permission
- [ ] Bot has "Read Message History" permission
- [ ] Bot has "Send Messages" permission
- [ ] **Message Content Intent is enabled** (Discord Developer Portal)
- [ ] Bot code has `GatewayIntentBits.MessageContent` in intents
- [ ] Bot is in the server and not blocked
- [ ] Channel is visible to bot
- [ ] No errors in Railway logs

## Still Not Working?

1. Check Railway logs for specific errors
2. Try using `/search` command instead of auto-detection
3. Verify the bot token is correct in Railway environment variables
4. Make sure the bot is actually running (check Railway deployment status)

## Testing Locally

If testing locally, make sure:
- `.env` file has `DISCORD_TOKEN` set
- Bot is running (`npm run dev`)
- Bot shows "Logged in as..." in console
- Try sending a message with an address in a test server

