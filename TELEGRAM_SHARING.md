# How to Share Your Telegram Bot

## Telegram Bots Work Differently Than Discord

**Discord:** Uses invite links  
**Telegram:** Uses bot username (no invite link needed!)

---

## How to Share Your Bot

### Option 1: Share Bot Username

Just share your bot's username:
```
@your_bot_username
```

Users can:
- Search for it in Telegram
- Click it to start a chat
- Add it to groups

### Option 2: Share Direct Link

Use Telegram's `t.me` link format:
```
https://t.me/your_bot_username
```

**Example:**
If your bot username is `infobot`, the link would be:
```
https://t.me/infobot
```

---

## How Users Add Bot to Groups

### Step 1: Add Bot to Group

1. Open the Telegram group
2. Go to group settings (tap group name)
3. Tap "Add Members" or "Add Admins"
4. Search for your bot's username (e.g., `@infobot`)
5. Select and add it

### Step 2: Use Commands

Once added, users can use commands in the group:
- `/help` - Show commands
- `/search <query>` - Search
- `/zora <query>` - Zora search
- etc.

---

## Find Your Bot's Username

1. **Go to BotFather** on Telegram
2. Send `/mybots`
3. Select your bot
4. Your bot's username is shown there
5. It will be something like: `@infobot` or `@your_bot_name_bot`

---

## For Your Website

### HTML Link:

```html
<a href="https://t.me/your_bot_username" 
   target="_blank"
   style="display: inline-block; padding: 12px 24px; background-color: #0088cc; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
   💬 Chat with InfoBot on Telegram
</a>
```

### Markdown Badge:

```markdown
[![Telegram](https://img.shields.io/badge/Telegram-0088cc?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/your_bot_username)
```

### Simple Text:

```
Chat with InfoBot on Telegram: https://t.me/your_bot_username
```

---

## Important Notes

### Bot Privacy Settings:

By default, Telegram bots can:
- ✅ Respond to direct messages
- ✅ Respond in groups (if added)
- ❌ Cannot read all group messages (unless made admin)

### For Group Functionality:

If you want the bot to auto-detect addresses/usernames in groups:
1. Add bot to group
2. Make bot an **admin** (optional, but recommended)
3. Bot can then read messages and respond

### Privacy Mode:

If your bot has "Privacy Mode" enabled (default):
- Bot only sees messages that:
  - Start with `/` (commands)
  - Mention the bot directly (`@botname`)
  - Reply to bot's messages

To disable privacy mode (bot sees all messages):
1. Message BotFather
2. Send `/mybots`
3. Select your bot
4. Go to "Bot Settings"
5. Go to "Privacy"
6. Turn OFF "Privacy Mode"

---

## Quick Reference

**Share Link Format:**
```
https://t.me/YOUR_BOT_USERNAME
```

**To Add to Group:**
1. Group Settings → Add Members
2. Search bot username
3. Add it

**Commands Work:**
- In direct messages ✅
- In groups (if added) ✅
- In channels (if added as admin) ✅

---

## Example

If your bot username is `infobot`:

**Share this link:**
```
https://t.me/infobot
```

**Or just share:**
```
@infobot
```

Users can click either to start chatting or add to groups!

