# How to Add Bot to Other Discord Servers

## Step 1: Enable Public Bot (If Not Done)

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application (Infobot)
3. Go to **"Bot"** section
4. Scroll down to **"PUBLIC BOT"**
5. Toggle **"Public Bot"** to **ON**
6. Save changes

## Step 2: Generate Invite Link

1. In Discord Developer Portal, go to **"OAuth2"** → **"URL Generator"**

2. **Select Scopes:**
   - ✅ `bot`
   - ✅ `applications.commands` (for slash commands)

3. **Select Bot Permissions:**
   - ✅ **Send Messages**
   - ✅ **Embed Links**
   - ✅ **Read Message History**
   - ✅ **Use Slash Commands**
   - ✅ **Read Messages/View Channels**
   - ✅ **Attach Files** (optional, if you want to send images)
   - ✅ **Add Reactions** (optional)

4. **Copy the Generated URL** - It will look like:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=PERMISSIONS&scope=bot%20applications.commands
   ```

## Step 3: Share the Invite Link

**For Others to Add Your Bot:**
1. Share the invite URL with server admins
2. They click the link
3. Select which server to add it to
4. Authorize the bot
5. Bot joins the server!

**For You to Add to Your Own Servers:**
1. Click your invite URL
2. Select the server
3. Authorize
4. Done!

## Step 4: Commands Will Appear

- **If `DISCORD_GUILD_ID` is NOT set** (global commands):
  - Commands appear in **all servers** within **1 hour**
  - Best for public bots

- **If `DISCORD_GUILD_ID` is set** (guild-specific):
  - Commands appear **instantly** in that specific server
  - Only works in the server you specified

## Quick Invite Link Generator

Your bot's Client ID: `1436900748959940619`

**Quick URL (with common permissions):**
```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands
```

This includes:
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Read Messages/View Channels

## Testing

1. Add bot to a test server using the invite link
2. Wait up to 1 hour for commands to appear (if using global commands)
3. Try `/help` or `/search` to test
4. Bot should respond!

## Troubleshooting

**Commands not appearing?**
- Wait up to 1 hour for global commands
- Or set `DISCORD_GUILD_ID` for instant commands in specific servers
- Re-register commands: `npm run register-commands` (locally) or Railway will do it on deploy

**Bot not responding?**
- Check Railway logs to see if bot is online
- Verify bot has proper permissions in the server
- Make sure bot is in the server (check member list)

