# Bot Invite Link for Website

## Optimal Invite URL (All Permissions)

Use this link on your website - it includes all permissions needed for full functionality:

```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands
```

**Permission Value:** `277025508416`

### What This Includes:

✅ **Send Messages** - Bot can send text messages  
✅ **Embed Links** - Bot can send rich embeds (required for all your embeds)  
✅ **Attach Files** - Bot can send images/files  
✅ **Read Message History** - Bot can read past messages  
✅ **Use Slash Commands** - Required for `/search`, `/help`, etc.  
✅ **Read Messages/View Channels** - Bot can see messages to detect addresses/usernames  
✅ **Add Reactions** - Bot can react to messages (if needed)  
✅ **Use External Emojis** - Bot can use custom emojis  

---

## Minimal Permissions (If You Want Less)

If you want to request fewer permissions, use this:

```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=18432&scope=bot%20applications.commands
```

**Permission Value:** `18432`

### What This Includes:

✅ **Send Messages**  
✅ **Embed Links**  
✅ **Read Message History**  
✅ **Use Slash Commands**  
✅ **Read Messages/View Channels**  

**Note:** This minimal set works for most features, but may limit some functionality.

---

## For Your Website

### HTML Button/Link:

```html
<a href="https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands" 
   target="_blank" 
   class="discord-invite-button">
   Add InfoBot to Discord
</a>
```

### Markdown (for README, etc.):

```markdown
[![Add InfoBot](https://img.shields.io/badge/Add%20to%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands)
```

### Discord Embed Button Style:

```html
<div style="text-align: center; margin: 20px 0;">
  <a href="https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands" 
     target="_blank"
     style="display: inline-block; padding: 12px 24px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
    ➕ Add InfoBot to Your Server
  </a>
</div>
```

---

## Permission Breakdown

| Permission | Why Needed | Required? |
|------------|------------|-----------|
| Send Messages | Bot responds to commands | ✅ Yes |
| Embed Links | All responses use embeds | ✅ Yes |
| Read Message History | Bot reads messages for auto-detection | ✅ Yes |
| Use Slash Commands | `/search`, `/help`, `/zora`, etc. | ✅ Yes |
| Read Messages/View Channels | Bot needs to see messages | ✅ Yes |
| Attach Files | Bot may send images | ⚠️ Optional |
| Add Reactions | Bot may react to messages | ⚠️ Optional |
| Use External Emojis | Custom emojis in embeds | ⚠️ Optional |

---

## Recommended: Use Full Permissions

**Best URL for your website:**
```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands
```

This ensures all features work correctly!

---

## Testing

1. Click the invite link
2. Select a test server
3. Review permissions (should show all the permissions listed above)
4. Authorize
5. Bot joins server
6. Try `/help` to verify it works

---

## Quick Copy-Paste for Website

**Full Permissions (Recommended):**
```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=277025508416&scope=bot%20applications.commands
```

**Minimal Permissions:**
```
https://discord.com/api/oauth2/authorize?client_id=1436900748959940619&permissions=18432&scope=bot%20applications.commands
```

