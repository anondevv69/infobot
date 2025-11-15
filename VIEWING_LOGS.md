# How to View Bot Logs

## Option 1: Railway Dashboard (Easiest) 🌐

### Real-time Logs:
1. Go to: https://railway.com/project/d1245913-ef84-4f98-bc60-6b5012d7e1a8
2. Click on **"infobot"** service
3. Click **"Deployments"** tab
4. Click on the latest deployment
5. View **"Deploy Logs"** or **"Build Logs"**

### Live Logs (Current Running Bot):
1. Go to your Railway project
2. Click **"infobot"** service
3. Click **"Logs"** tab (or **"View Logs"** button)
4. See real-time logs from your running bot!

**Best for:** Quick viewing, real-time monitoring

---

## Option 2: Railway CLI (Command Line) 💻

### View Current Logs:
```bash
railway logs
```

### View Specific Service Logs:
```bash
railway logs --service infobot
```

### View Build Logs:
```bash
railway logs --build
```

### View Deployment Logs:
```bash
railway logs --deploy
```

### Filter Logs:
```bash
railway logs --filter "error"
railway logs --filter "Logged in"
```

### Follow Logs (Real-time):
```bash
railway logs --follow
```

**Best for:** Command line users, automation, filtering

---

## Option 3: Railway MCP Tools (In Cursor/AI) 🤖

I can view logs for you using Railway MCP tools:

- **Deployment logs:** Latest deployment activity
- **Build logs:** Build process and compilation
- **Filtered logs:** Search for specific terms
- **Recent logs:** Last N lines

Just ask me to check logs and I'll pull them for you!

**Best for:** Quick checks, debugging with AI assistance

---

## What to Look For in Logs

### ✅ Good Signs:
- `Logged in as Infobot#0934` - Bot connected successfully
- `Registered global commands` - Commands registered
- No error messages
- Bot responding to commands

### ⚠️ Warning Signs:
- `Error:` or `Failed:` messages
- `Missing required environment variable` - Config issue
- `Rate limit` - API limits hit
- `Connection timeout` - Network issues

### 🔍 Common Log Patterns:

**Startup:**
```
[dotenv] injecting env...
Logged in as Infobot#0934
Registered global commands
```

**Command Execution:**
```
Interaction received: /search
Processing query: 0x...
```

**Errors:**
```
Error: Missing required environment variable DISCORD_TOKEN
Failed to fetch...
```

---

## Log Filtering Examples

### Find Errors:
```bash
railway logs --filter "error" --service infobot
```

### Find Specific Command:
```bash
railway logs --filter "/search" --service infobot
```

### Find API Calls:
```bash
railway logs --filter "API" --service infobot
```

---

## Railway Dashboard Log Features

### Real-time Streaming:
- Logs update automatically
- See new messages as they happen
- Scroll to bottom for latest

### Search/Filter:
- Use search box to find specific terms
- Filter by log level (info, warn, error)
- Export logs if needed

### Deployment History:
- View logs from past deployments
- Compare different deployments
- See what changed

---

## Quick Commands Reference

```bash
# View current logs
railway logs

# Follow logs in real-time
railway logs --follow

# View last 50 lines
railway logs --lines 50

# Filter for errors
railway logs --filter "error"

# View build logs
railway logs --build

# View deployment logs  
railway logs --deploy

# View specific service
railway logs --service infobot
```

---

## Pro Tips

1. **Keep Dashboard Open:** Railway dashboard shows logs in real-time
2. **Use Filters:** Filter for "error" to quickly find issues
3. **Check Recent Deployments:** If bot stops working, check latest deployment logs
4. **Monitor Startup:** Watch for "Logged in" message to confirm bot is running
5. **Set Up Alerts:** Railway can send alerts on errors (in Settings)

---

## Troubleshooting with Logs

**Bot not responding?**
- Check logs for "Logged in" message
- Look for error messages
- Verify environment variables are set

**Commands not working?**
- Check for "Registered global commands" message
- Look for command registration errors
- Verify DISCORD_CLIENT_ID is correct

**API errors?**
- Check for rate limit messages
- Verify API keys are set correctly
- Look for network timeout errors

---

## Summary

**Easiest:** Railway Dashboard → Service → Logs tab  
**Command Line:** `railway logs`  
**AI Help:** Ask me to check logs using MCP tools

All methods show the same logs, just different interfaces!

