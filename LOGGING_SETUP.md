# Logging Setup Guide

## Discord Webhook Logging

The bot now sends logs to a Discord webhook instead of saving files.

### Webhook URL

Your webhook URL:
```
https://discord.com/api/webhooks/1440704802190393344/hETWchv2MZTwRfVuLLHk39im5HT3wEBOlD25nBExa6DvZAb7rOY43qVIzKeeG1Xm0eu3
```

### Setup Instructions

1. **Add to Railway Environment Variables:**
   - Go to your Railway project
   - Navigate to Variables
   - Add new variable:
     - **Key:** `LOG_WEBHOOK_URL`
     - **Value:** `https://discord.com/api/webhooks/1440704802190393344/hETWchv2MZTwRfVuLLHk39im5HT3wEBOlD25nBExa6DvZAb7rOY43qVIzKeeG1Xm0eu3`
   - Save and redeploy

2. **Or add to `.env` file (for local development):**
   ```bash
   LOG_WEBHOOK_URL=https://discord.com/api/webhooks/1440704802190393344/hETWchv2MZTwRfVuLLHk39im5HT3wEBOlD25nBExa6DvZAb7rOY43qVIzKeeG1Xm0eu3
   ```

### What Gets Logged

✅ **Sent to Webhook:**
- 🔍 **Searches** - All `/search` commands with query, user, and result
- ⚙️ **System Activities** - Clanker checks, deployment monitoring, broadcasts
- ❌ **Errors** - Critical errors with context

❌ **NOT Sent to Webhook:**
- Regular commands (only console)
- Info/warn messages (only console)
- Debug messages (development only)

### Example Messages

**Search:**
```
🔍 **SEARCH** [DISCORD] Search: 0x1234... (User: 123456789, Guild: 987654321)
`query: 0x1234..., result: success, resultType: wallet`
```

**System Activity:**
```
⚙️ **SYSTEM** Clanker Watcher: Starting deployment check
`count: 5`
```

**Clanker Broadcast:**
```
⚙️ **SYSTEM** Clanker Watcher: Broadcasting high-score deployment
`tokenName: TOKEN, contractAddress: 0x..., deployerFid: 1234, deployerScore: 95`
```

### Rate Limiting

- Built-in rate limiting (1 second between webhook calls)
- Fails silently if webhook unavailable
- Console logging still works if webhook fails

### Security Note

⚠️ **Keep your webhook URL private!** Don't commit it to git or share it publicly. If exposed, regenerate the webhook in Discord.

