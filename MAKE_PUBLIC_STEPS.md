# Make Bot Public - Step by Step

## ✅ Step 1: Verify Railway Settings (Already Done!)

Your Railway variables are already set correctly:
- ✅ `DISCORD_GUILD_ID` is **NOT set** - Commands will register globally
- ✅ All required variables are set

**No changes needed in Railway!**

---

## Step 2: Enable Public Bot in Discord Portal

1. **Go to Discord Developer Portal:**
   - https://discord.com/developers/applications

2. **Select your bot application:**
   - Click on "Infobot" (or your bot name)

3. **Go to "Bot" section:**
   - Click "Bot" in the left sidebar

4. **Enable Public Bot:**
   - Scroll down to **"PUBLIC BOT"** section
   - Toggle **"Public Bot"** to **ON** ✅
   - Click **"Save Changes"**

5. **Enable Required Intents (if not already):**
   - In the same "Bot" section, find **"Privileged Gateway Intents"**
   - Enable: ✅ **MESSAGE CONTENT INTENT** (required for reading messages)
   - Save changes

---

## Step 3: Generate Invite Link

1. **Go to OAuth2 → URL Generator:**
   - In Discord Developer Portal, click **"OAuth2"** in left sidebar
   - Click **"URL Generator"**

2. **Select Scopes:**
   - ✅ `bot`
   - ✅ `applications.commands` (for slash commands)

3. **Select Bot Permissions:**
   - ✅ **Send Messages**
   - ✅ **Embed Links**
   - ✅ **Read Message History**
   - ✅ **Use Slash Commands**
   - ✅ **Read Messages/View Channels**
   - ✅ **Attach Files** (optional)
   - ✅ **Add Reactions** (optional)

4. **Copy the Generated URL:**
   - The URL will appear at the bottom
   - It looks like: `https://discord.com/api/oauth2/authorize?client_id=...`

---

## Step 4: Register Commands Globally

Your code already handles this! Since `DISCORD_GUILD_ID` is not set, commands will register globally.

**To trigger command registration:**
- Railway will auto-register on next deploy, OR
- You can manually trigger by pushing a small change to GitHub

---

## Step 5: Share Your Bot!

**Your Invite Link:**
Share the URL you generated in Step 3 with anyone who wants to add your bot.

**Quick Link (with your Client ID):**
```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands
```

This includes:
- Send Messages
- Embed Links  
- Read Message History
- Use Slash Commands
- Read Messages/View Channels

---

## Step 6: Test It!

1. **Add bot to a test server:**
   - Use your invite link
   - Select a server
   - Authorize

2. **Wait for commands (up to 1 hour):**
   - Global commands can take up to 1 hour to appear
   - Be patient!

3. **Test commands:**
   - Try `/help` or `/search`
   - Bot should respond!

---

## Summary

✅ **Railway:** Already configured correctly (no DISCORD_GUILD_ID)
✅ **Code:** Already supports global commands
⏳ **Discord Portal:** Enable "Public Bot" (Step 2)
⏳ **Invite Link:** Generate and share (Step 3)

Once you complete Steps 2-3, your bot will be fully public and anyone can add it!

