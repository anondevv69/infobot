# Telegram Bot Setup Guide

## Step 1: Create Telegram Bot

1. **Open Telegram** and search for [@BotFather](https://t.me/botfather)

2. **Start a chat** with BotFather

3. **Create a new bot:**
   - Send: `/newbot`
   - Follow instructions to name your bot
   - BotFather will give you a **bot token**

4. **Save your bot token** - You'll need it for Railway

**Example token format:**
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

## Step 2: Add Token to Railway

1. **Go to Railway Dashboard:**
   - https://railway.com/project/d1245913-ef84-4f98-bc60-6b5012d7e1a8
   - Click **"infobot"** service
   - Go to **"Variables"** tab

2. **Add new variable:**
   - Name: `TELEGRAM_BOT_TOKEN`
   - Value: `your-bot-token-from-botfather`
   - Click **"Add"**

3. **Redeploy** (or wait for next auto-deploy):
   - Railway will automatically restart with new token
   - Bot will start connecting to Telegram

---

## Step 3: Test Your Bot

1. **Find your bot on Telegram:**
   - Search for your bot's username (from BotFather)
   - Or use: `https://t.me/your_bot_username`

2. **Start a chat:**
   - Click "Start" or send `/start`
   - Bot should respond!

3. **Test commands:**
   - `/help` - See available commands
   - `/search 0x...` - Search for address
   - `/zora <query>` - Search Zora
   - `/clanker <query>` - Search Clanker

---

## Available Commands

### Telegram Commands:

- `/start` - Welcome message
- `/help` - Show help and available commands
- `/search <query>` - Search wallets, addresses, usernames
- `/zora <query>` - Search Zora accounts/coins
- `/clanker <query>` - Search Clanker deployments
- `/casts <keyword>` - Search Farcaster casts

### Auto-Detection:

The bot also auto-detects:
- **Ethereum addresses** (0x...) - Looks up as Clanker, Zora, or wallet
- **Farcaster usernames** (@username) - Looks up Farcaster profile
- **Zora URLs** - Looks up Zora profile/coin

---

## How It Works

### Shared Core Logic:

- ✅ **Same services** - Uses your existing Neynar, Zora, Clanker APIs
- ✅ **Same data** - Gets the same information
- ✅ **Different format** - Converts Discord embeds to Telegram messages

### Architecture:

```
src/
├── services/          # Shared (Neynar, Zora, Clanker)
├── utils/             # Shared utilities
├── platforms/
│   ├── discord/       # Discord-specific (existing)
│   └── telegram/      # Telegram-specific (new)
│       ├── handlers/  # Command & message handlers
│       └── adapters/  # Convert to Telegram format
└── index.ts           # Starts both bots
```

---

## Troubleshooting

### Bot not responding?

1. **Check Railway logs:**
   ```bash
   railway logs --filter "Telegram"
   ```

2. **Verify token:**
   - Check Railway variables
   - Make sure `TELEGRAM_BOT_TOKEN` is set correctly
   - Token should start with numbers and colon

3. **Check bot status:**
   - Go to BotFather
   - Send `/mybots`
   - Select your bot
   - Check if it's enabled

### Commands not working?

- Make sure you're sending commands correctly
- Use `/help` to see available commands
- Check Railway logs for errors

### Bot keeps restarting?

- Check Railway logs for errors
- Verify all environment variables are set
- Check if Telegram API is having issues

---

## Next Steps

1. ✅ Get bot token from BotFather
2. ✅ Add `TELEGRAM_BOT_TOKEN` to Railway
3. ✅ Wait for auto-deploy (or manually redeploy)
4. ✅ Test bot on Telegram
5. ✅ Share bot username with users!

---

## Bot Features

Your Telegram bot has the same features as Discord:
- ✅ Wallet lookups
- ✅ Farcaster profile search
- ✅ Zora coin/profile search
- ✅ Clanker token search
- ✅ Cast keyword search
- ✅ Market cap display
- ✅ All the same data!

Just in Telegram format instead of Discord embeds!

---

## Quick Reference

**Get Bot Token:**
- Message [@BotFather](https://t.me/botfather)
- Send `/newbot`
- Follow instructions

**Add to Railway:**
- Variable: `TELEGRAM_BOT_TOKEN`
- Value: Your token from BotFather

**Test:**
- Find your bot on Telegram
- Send `/start` or `/help`

**Done!** 🎉

