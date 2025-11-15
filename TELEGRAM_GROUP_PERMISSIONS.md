# Telegram Bot Group Permissions Guide

## How to Check Bot Permissions in a Group

### Method 1: Check via Group Settings

1. **Open the Telegram group**
2. **Tap the group name** at the top (or click the group info)
3. **Go to "Administrators"** or **"Members"**
4. **Find your bot** in the list
5. **Tap on the bot** to see its permissions

### Method 2: Check via BotFather

1. **Open BotFather** in Telegram (`@BotFather`)
2. **Send `/mybots`**
3. **Select your bot**
4. **Go to "Bot Settings" → "Group Privacy"**
5. **Check the privacy setting:**
   - **"Enabled"** = Bot can only see messages that mention it (commands still work)
   - **"Disabled"** = Bot can see all messages in groups

### Method 3: Test in the Group

Try these commands in the group:
- `/start` - Should work (commands always work)
- `/help` - Should work
- `/search 0x123...` - Should work
- Send an address like `0x123...` - Only works if privacy is disabled OR you mention the bot

## Important Notes

### Commands Always Work
- Commands starting with `/` **always work** in groups, regardless of privacy settings
- You don't need to mention the bot for commands
- Examples: `/search`, `/zora`, `/clanker`, `/help`

### Regular Messages (Auto-Detection)
- If **Privacy Mode is ENABLED**: Bot only sees messages that mention it
  - Example: `@yourbotname 0x123...` or `@yourbotname @username`
- If **Privacy Mode is DISABLED**: Bot sees all messages
  - Example: Just send `0x123...` or `@username` without mentioning the bot

## Recommended Settings

For the best user experience:

1. **Keep Privacy Mode ENABLED** (default)
   - Commands work without mentions: `/search 0x123...`
   - Regular messages require mention: `@botname 0x123...`
   - This prevents spam and respects user privacy

2. **Or DISABLE Privacy Mode** if you want:
   - Auto-detection of addresses/usernames without mentions
   - Bot responds to all messages in the group
   - ⚠️ This can be noisy in active groups

## How to Change Privacy Mode

1. Open **BotFather** (`@BotFather`)
2. Send `/mybots`
3. Select your bot
4. Go to **"Bot Settings"**
5. Select **"Group Privacy"**
6. Choose:
   - **"Enable"** = Privacy mode ON (recommended)
   - **"Disable"** = Privacy mode OFF

## Current Bot Behavior

Your bot is configured to:
- ✅ **Always respond to commands** (`/search`, `/zora`, etc.) in groups
- ✅ **Respond to addresses/usernames** if:
  - Privacy mode is disabled, OR
  - The bot is mentioned in the message

## Troubleshooting

### Commands Not Working?
- Make sure the bot is added to the group
- Try `/start` first
- Check if the bot is blocked or removed

### Auto-Detection Not Working?
- Check if privacy mode is enabled
- Try mentioning the bot: `@botname 0x123...`
- Or disable privacy mode in BotFather

### Bot Not Responding at All?
- Check if bot is online (should show "online" status)
- Verify `TELEGRAM_BOT_TOKEN` is set correctly
- Check Railway logs for errors

