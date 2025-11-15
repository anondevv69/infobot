# Crash Recovery & Auto-Restart

## ✅ Yes! Railway Auto-Restarts Your Bot

Railway has **automatic crash recovery** built-in. Your bot will automatically restart if it crashes!

---

## How Railway Handles Crashes

### Automatic Restart Policy

Your bot is configured with:
- **Restart Policy:** `ON_FAILURE` ✅
- **Max Retries:** `10` attempts
- **Auto-restart:** Enabled by default

### What This Means:

1. **If bot crashes:**
   - Railway detects the crash immediately
   - Automatically restarts the bot
   - Usually restarts within seconds

2. **If bot keeps crashing:**
   - Railway will retry up to 10 times
   - If it fails 10 times, Railway will stop (to prevent infinite loops)
   - You'll get notified via Railway dashboard

3. **If bot exits cleanly:**
   - Railway will restart it automatically
   - Keeps your bot running 24/7

---

## Types of Crashes Railway Handles

### ✅ Handled Automatically:

- **Uncaught exceptions** - Bot crashes due to error
- **Process exits** - Bot shuts down unexpectedly  
- **Out of memory** - Bot runs out of memory
- **Network timeouts** - Connection issues
- **API errors** - External API failures (if not handled)

### ⚠️ May Need Your Attention:

- **Invalid environment variables** - Bot won't start
- **Code errors** - Syntax errors, type errors
- **Rate limiting** - Too many API calls
- **Discord API issues** - Discord service down

---

## Monitoring & Alerts

### Railway Dashboard:

1. **Check Status:**
   - Go to Railway dashboard
   - Service shows "Active" = Running
   - Service shows "Failed" = Needs attention

2. **View Restart History:**
   - Check "Deployments" tab
   - See restart attempts
   - View logs for crash reasons

3. **Set Up Alerts (Optional):**
   - Railway can send email alerts on failures
   - Configure in Settings → Notifications

---

## Best Practices to Prevent Crashes

### 1. Error Handling

Your code should handle errors gracefully:

```typescript
try {
  // Your code
} catch (error) {
  console.error("Error:", error);
  // Don't crash - log and continue
}
```

### 2. Unhandled Promise Rejections

Add this to your `index.ts`:

```typescript
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  // Log but don't crash
});
```

### 3. Health Checks

Railway can check if your bot is healthy (optional):

```typescript
// Add a health check endpoint if needed
// Railway will ping it to verify bot is running
```

---

## What Happens During a Crash

### Timeline:

1. **Crash occurs** (e.g., uncaught error)
2. **Railway detects** (within seconds)
3. **Railway restarts** (automatic)
4. **Bot reconnects** to Discord
5. **Back online** (usually < 30 seconds)

### Example Logs:

```
[ERROR] Uncaught exception: ...
Bot crashed, restarting...
Starting Container
Logged in as Infobot#0934
Bot restarted successfully
```

---

## Checking if Bot Crashed

### Via Railway Dashboard:

1. Go to your Railway project
2. Check **"Deployments"** tab
3. Look for multiple recent deployments (indicates restarts)
4. Check logs for error messages

### Via Logs:

```bash
railway logs --filter "error" --service infobot
railway logs --filter "restart" --service infobot
```

### Via Discord:

- Bot appears offline in Discord
- Commands don't respond
- Check Railway to see if it's restarting

---

## Manual Restart (If Needed)

### Via Railway Dashboard:

1. Go to service
2. Click **"Redeploy"** or **"Restart"**
3. Bot restarts immediately

### Via CLI:

```bash
railway restart
```

### Via MCP Tools:

I can restart it for you using Railway MCP tools!

---

## Preventing Crashes

### Common Causes:

1. **Missing environment variables**
   - ✅ Already set in Railway
   - Bot won't start if missing

2. **API rate limits**
   - Add retry logic
   - Handle rate limit errors

3. **Memory issues**
   - Monitor memory usage
   - Railway will restart if OOM

4. **Network issues**
   - Add timeout handling
   - Retry failed requests

---

## Railway Restart Configuration

Your current setup:

```json
{
  "restartPolicyType": "ON_FAILURE",
  "restartPolicyMaxRetries": 10
}
```

This means:
- ✅ Restarts on any failure
- ✅ Tries up to 10 times
- ✅ Automatic recovery

---

## Summary

**✅ Railway automatically restarts your bot if it crashes**

- **Detection:** Immediate
- **Restart:** Automatic (within seconds)
- **Retries:** Up to 10 attempts
- **Uptime:** 24/7 monitoring

**Your bot will stay online even if it crashes!**

### What You Should Do:

1. **Monitor occasionally:** Check Railway dashboard
2. **Set up alerts:** Get notified of issues
3. **Check logs:** If bot keeps crashing, check logs for errors
4. **Handle errors:** Add error handling to prevent crashes

**Bottom line:** Railway has you covered! Your bot will auto-restart if it crashes, even in the middle of the night. 🌙

