# Testing Telegram Bot Locally

## Quick Start

### 1. Get a Telegram Bot Token

1. **Open Telegram** and search for [@BotFather](https://t.me/botfather)
2. **Start a chat** and send `/newbot`
3. **Follow instructions:**
   - Choose a name for your bot (e.g., "My Test Bot")
   - Choose a username (e.g., "my_test_bot")
4. **Save the token** BotFather gives you (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Create `.env` File

Create a `.env` file in the project root (`C:\Users\Administrator\Desktop\discord\.env`):

```env
# Discord (required)
DISCORD_TOKEN=your-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id

# Telegram (required for Telegram testing)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-from-botfather

# APIs (required)
NEYNAR_API_KEY=your-neynar-api-key
ZORA_API_KEY=your-zora-api-key

# Optional
BASESCAN_API_KEY=your-basescan-api-key
DISCORD_GUILD_ID=your-guild-id  # Leave empty for public bot
```

**Important:** Make sure `.env` is in your `.gitignore` so you don't commit secrets!

### 3. Install Dependencies (if not done)

```bash
cd C:\Users\Administrator\Desktop\discord
npm install
```

### 4. Build the Project

```bash
npm run build
```

### 5. Run Locally

```bash
npm run dev
```

You should see:
```
Logged in as YourBot#1234
```

The bot will now:
- ✅ Connect to Discord (if `DISCORD_TOKEN` is set)
- ✅ Connect to Telegram (if `TELEGRAM_BOT_TOKEN` is set)
- ✅ Start listening for messages on both platforms

### 6. Test on Telegram

1. **Find your bot on Telegram:**
   - Search for your bot's username (the one you set with BotFather)
   - Or use: `https://t.me/your_bot_username`

2. **Start a chat:**
   - Click "Start" or send `/start`
   - Bot should respond with help message

3. **Test commands:**
   ```
   /help                    # Show help
   /search 0x9E82eb4E6Cf4DDAd35C32941B2f90112cDB9b99c  # Test Mantle token
   /zora @username          # Search Zora
   /clanker query           # Search Clanker
   ```

4. **Test auto-detection:**
   - Send an Ethereum address: `0x9E82eb4E6Cf4DDAd35C32941B2f90112cDB9b99c`
   - Bot should detect it and show token info (not Zora profile!)

### 7. Stop the Bot

Press `Ctrl+C` in the terminal to stop.

---

## Testing the Fixes

To test that the Telegram handler matches Discord behavior:

### Test Case 1: Mantle Token (Should show token, NOT Zora profile)

**Address:** `0x9E82eb4E6Cf4DDAd35C32941B2f90112cDB9b99c`

**Expected Result:**
- ✅ Shows "mantle token detected"
- ✅ Shows token info (price, liquidity, etc.)
- ❌ Does NOT show "Zora Profile"

**How to test:**
1. Send the address in Telegram
2. Check console logs - you should see:
   ```
   [Telegram] Multi-chain token check for 0x9E82...: Found on Mantle (5000)
   [Telegram] ✅ Showing Mantle token for 0x9E82... (chainId: 5000)
   ```

### Test Case 2: Clanker Token

**Address:** Any Clanker deployment address

**Expected Result:**
- ✅ Shows Clanker token info
- ✅ Shows paginated pages (Token & Dev, Other Clankers, Wallets & Zora)

### Test Case 3: Base Token

**Address:** Any Base network token

**Expected Result:**
- ✅ Shows "Base token detected"
- ✅ Shows factory info if available

### Test Case 4: Zora Profile (No Token)

**Address:** A wallet that has a Zora profile but is NOT a token

**Expected Result:**
- ✅ Only shows Zora profile if NO tokens found
- ✅ Shows wallet info if Farcaster user found

---

## Debugging

### View Console Logs

When running `npm run dev`, you'll see all logs in the terminal:

```
[Telegram] Multi-chain token check for 0x9E82...: Found on Mantle (5000)
[Telegram] ✅ Showing Mantle token for 0x9E82... (chainId: 5000)
```

### Common Issues

**Bot not responding?**
- Check if `TELEGRAM_BOT_TOKEN` is set correctly in `.env`
- Check console for errors
- Make sure bot is running (`npm run dev`)

**Token not working?**
- Verify token from BotFather (send `/mybots` to BotFather)
- Make sure token is in `.env` file
- Restart the bot after changing `.env`

**Commands not working?**
- Make sure you're using `/` prefix
- Check console logs for errors
- Try `/help` to see available commands

**"TELEGRAM_BOT_TOKEN not set" warning?**
- Add `TELEGRAM_BOT_TOKEN=your-token` to `.env`
- Restart the bot

---

## Testing Checklist

Before deploying to Railway:

- [ ] Bot starts without errors (`npm run dev`)
- [ ] Can send `/start` and get response
- [ ] Mantle token shows as token (not Zora profile)
- [ ] Clanker tokens work correctly
- [ ] Base tokens work correctly
- [ ] Zora profiles only show when appropriate
- [ ] Console logs show correct detection flow
- [ ] No errors in console

---

## Quick Commands

```bash
# Build
npm run build

# Run locally (both Discord + Telegram)
npm run dev

# Stop bot
Ctrl+C
```

---

## Environment Variables Reference

**Required for Telegram:**
- `TELEGRAM_BOT_TOKEN` - From BotFather

**Required for Discord:**
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application ID

**Required for APIs:**
- `NEYNAR_API_KEY` - For Farcaster lookups
- `ZORA_API_KEY` - For Zora lookups

**Optional:**
- `BASESCAN_API_KEY` - For better rate limits on Base
- `DISCORD_GUILD_ID` - For guild-specific commands (leave empty for public)

---

## Next Steps

After local testing works:

1. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Fix Telegram token detection order"
   git push origin main
   ```

2. **Railway will auto-deploy** (if connected to GitHub)

3. **Or deploy manually:**
   ```bash
   railway deploy
   ```

4. **Test on production** Telegram bot

---

## Tips

- **Use a separate test bot** for local testing (don't use production bot token)
- **Keep `.env` local** - never commit it to Git
- **Check logs** - console output shows exactly what's happening
- **Test incrementally** - test one feature at a time

