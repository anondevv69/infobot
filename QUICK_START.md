# Quick Start Guide

## 🚀 Local Testing → GitHub → Cloud Deployment

### Daily Workflow

```bash
# 1. Make your changes to code

# 2. Test locally
npm run build          # Check for errors
npm run dev            # Test in Discord

# 3. Push to GitHub
git add .
git commit -m "Your update message"
git push origin main

# 4. Auto-deploys to Railway! ✨
```

---

## 📦 First Time Setup

### 1. Initialize GitHub (if not done)

```bash
# Check if git is initialized
git status

# If not, initialize:
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 2. Setup Railway

1. Go to [railway.app](https://railway.app) and sign up
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway auto-detects Node.js

### 3. Add Environment Variables

In Railway dashboard → Variables tab, add:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
NEYNAR_API_KEY=your-neynar-key
ZORA_API_KEY=your-zora-key
APP_VERSION=1.0.0
BRAND_NAME=InfoBot
```

**For Public Bot:** Leave `DISCORD_GUILD_ID` empty or don't set it.

### 4. Deploy!

Railway will automatically:
- Install dependencies
- Build (`npm run build`)
- Start (`npm start`)
- Keep bot running 24/7

---

## 🔄 Making Updates

```bash
# 1. Edit code locally
# 2. Test: npm run build && npm run dev
# 3. Push: git add . && git commit -m "Update" && git push
# 4. Railway auto-deploys! 🎉
```

---

## 🌐 Making Bot Public (Optional)

### Enable Public Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Select your bot
3. Bot tab → Toggle "Public Bot" ON
4. Enable "MESSAGE CONTENT INTENT" (if needed)

### Register Commands Globally

**Option 1:** Remove `DISCORD_GUILD_ID` from Railway variables
- Commands register globally
- Takes up to 1 hour to appear

**Option 2:** Keep both (current code supports this!)
- If `DISCORD_GUILD_ID` is set → registers to that guild (instant)
- If not set → registers globally (for public)

### Create Invite Link

1. Discord Developer Portal → OAuth2 → URL Generator
2. Select: `bot` + `applications.commands`
3. Select permissions:
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Slash Commands
4. Copy the generated URL
5. Share it so others can add your bot!

---

## ✅ Your Code Already Supports Public Bots!

Your `registerCommands.ts` already handles both:
- ✅ If `DISCORD_GUILD_ID` is set → Guild commands (fast, for testing)
- ✅ If `DISCORD_GUILD_ID` is NOT set → Global commands (for public)

**No code changes needed!** Just:
- Remove `DISCORD_GUILD_ID` from Railway for public bot
- Keep it in local `.env` for fast testing
- Enable "Public Bot" in Discord portal

---

## 📝 Environment Variables Summary

### Local (.env file)
```bash
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=your-test-server-id  # For fast testing
NEYNAR_API_KEY=...
ZORA_API_KEY=...
```

### Railway (Public Bot)
```bash
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
# DISCORD_GUILD_ID=  # Leave empty for global commands
NEYNAR_API_KEY=...
ZORA_API_KEY=...
APP_VERSION=1.0.0
BRAND_NAME=InfoBot
```

---

## 🎯 Summary

**Testing Locally:**
```bash
npm run build && npm run dev
```

**Pushing Updates:**
```bash
git add . && git commit -m "Update" && git push
```

**Public Bot:**
- ✅ Railway works the same
- ✅ Just remove `DISCORD_GUILD_ID` for global commands
- ✅ Enable "Public Bot" in Discord portal
- ✅ Generate invite URL
- ✅ Share with others!

**No major changes needed!** Your code already supports both private and public bots. 🎉

