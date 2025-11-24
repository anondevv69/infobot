# InfoBot - Current Commands & Features

## 📋 DISCORD COMMANDS (Slash Commands)

### Universal Search Commands
1. **`/search <query>`** - Universal search (wallets, contracts, Farcaster, Zora, Clanker, transactions)
2. **`/info <query>`** - Alias for `/search` (same functionality)

### Specialized Commands
3. **`/zora <query>`** - Zora-specific search (accounts, contracts, creator coins)
4. **`/z <query>`** - Short alias for `/zora`
5. **`/clanker <query>`** - Clanker token deployments search
6. **`/casts <keyword> [recent_count]`** - Search Farcaster casts by keyword
7. **`/cast <keyword> [recent_count]`** - Alias for `/casts`
8. **`/far <query>`** - Search Farcaster users (username or wallet)
9. **`/w <query>`** - Wallet lookup (Ethereum or Solana)
10. **`/x <query>`** - Farcaster profile by X/Twitter handle/URL
11. **`/relay <transaction>`** - Cross-chain transaction lookup (Relay.link)
12. **`/help`** - Display command overview

### Text Commands (No Slash Needed)
- **`info <query>`** - Same as `/info` or `/search` (e.g., `info 0x1234...` or `info @username`)

### Admin Commands (Webhook Channel Only)
- **`!stats`** or **`/stats`** - Bot statistics

---

## 📱 TELEGRAM COMMANDS

### Universal Search Commands
1. **`/search <query>`** - Universal search (wallets, contracts, Farcaster, Zora, Clanker)
2. **`/info <query>`** - Alias for `/search` (same functionality)

### Specialized Commands
3. **`/zora <query>`** - Zora-specific search
4. **`/z <query>`** - Short alias for `/zora`
5. **`/clanker <query>`** - Clanker token deployments search
6. **`/casts <keyword>`** - Search Farcaster casts by keyword
7. **`/cast <keyword>`** - Alias for `/casts`
8. **`/far <query>`** - Search Farcaster users
9. **`/w <query>`** - Wallet lookup
10. **`/x <query>`** - Farcaster profile by X/Twitter handle/URL
11. **`/relay <transaction>`** - Cross-chain transaction lookup (Relay.link)
12. **`/help`** or **`/start`** - Display command overview

### Text Commands (No Slash Needed)
- **`info <query>`** - Same as `/info` or `/search` (e.g., `info 0x1234...` or `info @username`)

---

## 🔍 AUTO-DETECTION (Just Paste in Chat!)

### What Auto-Detects (No Command Needed)

#### Discord Auto-Detection:
- ✅ **Paragraph URLs** - `https://paragraph.com/@publication/post-slug`
- ✅ **Base Social Posts** - `https://base.org/post/...` or `https://base.app/post/...`
- ✅ **Zora Profile URLs** - `https://zora.co/@username` or `https://zora.co/profile/...`
- ✅ **Zora Coin URLs** - `https://zora.co/collect/...` or `https://zora.co/coin/...`
- ✅ **Clanker URLs** - `https://clanker.world/...`
- ✅ **Farcaster Cast Links** - `https://farcaster.xyz/...` or `https://warpcast.com/...`

#### Telegram Auto-Detection:
- ✅ **Paragraph URLs** - `https://paragraph.com/@publication/post-slug`
- ✅ **Base Social Posts** - `https://base.org/post/...` or `https://base.app/post/...`
- ✅ **Zora Profile URLs** - `https://zora.co/@username` or `https://zora.co/profile/...`
- ✅ **Zora Coin URLs** - `https://zora.co/collect/...` or `https://zora.co/coin/...`
- ✅ **Clanker URLs** - `https://clanker.world/...`
- ✅ **Farcaster Cast Links** - `https://farcaster.xyz/...` or `https://warpcast.com/...`

**Note:** In Telegram groups, you need to mention the bot (`@infobot`) OR paste a URL. In private chats, just paste the URL.

---

## ❌ What NO LONGER Auto-Detects

### Removed Auto-Detections (Now Require Commands):
- ❌ **Addresses (`0x...`)** - Use `info 0x...` or `/info 0x...` or `/search 0x...`
- ❌ **`@username`** - Use `/far @username` or `/search @username` or `info @username`
- ❌ **`cast <keyword>`** - Use `/casts <keyword>` or `/cast <keyword>`
- ❌ **`far <keyword>`** - Use `/far <keyword>` or `/search <keyword>`
- ❌ **`zora <query>`** - Use `/zora <query>` or `/z <query>`
- ❌ **`wallet 0x...`** - Use `/w 0x...` or `/search 0x...` or `info 0x...`
- ❌ **X/Twitter links** - Use `/x <url>` or `/search <url>`

---

## 🚀 Quick Shows (Text Commands)

These are the fastest ways to search without typing `/`:

### Discord & Telegram:
- **`info <query>`** - Universal search (works for everything)
  - Examples: `info 0x1234...`, `info @username`, `info tokenname`

---

## 📊 Summary

| Feature | Discord | Telegram |
|---------|---------|----------|
| **Slash Commands** | ✅ 12 commands | ✅ 12 commands |
| **Text Commands** | ✅ `info <query>` | ✅ `info <query>` |
| **URL Auto-Detection** | ✅ 6 URL types | ✅ 6 URL types |
| **Address Auto-Detection** | ❌ Removed | ❌ Removed |
| **Keyword Auto-Detection** | ❌ Removed | ❌ Removed |
| **Admin Stats** | ✅ Webhook only | ❌ Not available |

---

## 💡 Usage Examples

### Quick Search (Text Command):
```
Discord/Telegram: info 0x23Af95d5F9D35eB3212e4C84C03A48eAF64a7777
→ Searches: Zora, Clanker, Base tokens, Multi-chain tokens, Farcaster, etc.
```

### Slash Commands:
```
/search 0x1234...     → Universal search
/info 0x1234...      → Same as /search
/zora @username      → Zora profile
/far @username       → Farcaster user
/casts base          → Cast keyword search
```

### Auto-Detection (Just Paste):
```
https://paragraph.com/@blog/writer-coins
→ Automatically shows Paragraph token info

https://zora.co/@username
→ Automatically shows Zora profile

https://farcaster.xyz/username/cast-hash
→ Automatically shows cast details
```

---

**Built by fc @rayblanco.eth** • Use `/help` anytime for the full command list!

