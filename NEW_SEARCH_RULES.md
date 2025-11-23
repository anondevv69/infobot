# InfoBot - New Search Rules (Updated)

## 🎯 **MAJOR CHANGES: Auto-Detection → Commands**

We've moved most searches from auto-detection to explicit commands to reduce chat noise and improve bot responsiveness.

---

## ✅ **AUTO-DETECTION (Still Works - Just Paste!)**

The bot **automatically detects** these when pasted in chat (no commands needed):

### **Addresses & Contracts**
- **`0x...`** (Ethereum/Base/Monad addresses)
  - Auto-detects in order:
    1. Zora coins (creator coins)
    2. Clanker tokens
    3. Base network tokens (DexScreener)
    4. Multi-chain tokens (Mantle, Monad, BSC, Polygon, etc.)
    5. Farcaster user with wallet
    6. Zora profile (as fallback)

- **Solana addresses** (base58 format)
  - Auto-detects profiles and tokens

### **URLs (Direct Links)**
- **`zora.co/...`** — Zora profile or coin links
- **`clanker.world/...`** — Clanker token links
- **`farcaster.xyz/...`** or **`warpcast.com/...`** — Farcaster cast or profile links
- **`paragraph.com/...`** or **`paragraph.xyz/...`** — Paragraph post links
- **`base.org/...`** or **`base.app/...`** — Base social post links

---

## 📋 **NEW COMMANDS (Use Slash Commands or `/` in Telegram)**

### **Discord Commands**

1. **`/search <query>`** or **`/info <query>`**
   - Universal search for wallets, contracts, Farcaster profiles, Zora accounts, or transactions
   - Example: `/search 0x1234...` or `/search @username`

2. **`/cast <keyword>`** or **`/casts <keyword>`**
   - Search Farcaster casts by keyword
   - Shows earliest match + 2 most recent (default)
   - Example: `/cast base` or `/casts base 3`

3. **`/far <query>`**
   - Search Farcaster users by username (with or without @) or wallet
   - Example: `/far vitalik` or `/far @vitalik` or `/far 0x1234...`

4. **`/z <query>`** or **`/zora <query>`**
   - Search Zora accounts, contracts, or creator coins
   - Example: `/z @username` or `/zora 0x1234...`

5. **`/w <query>`**
   - Lookup wallet address (Ethereum or Solana)
   - Example: `/w 0x1234...` or `/w 7xKXtg2...`

6. **`/x <query>`**
   - Lookup Farcaster profile by X/Twitter handle or URL
   - Example: `/x vitalik` or `/x https://x.com/vitalik`

7. **`/clanker <query>`**
   - Search Clanker deployments by keyword, symbol, address, username, or wallet
   - Example: `/clanker tokenname` or `/clanker 0x1234...`

8. **`/relay <transaction>`**
   - Cross-chain transaction lookup from Relay.link
   - Example: `/relay https://basescan.org/tx/0x...`

9. **`/help`**
   - Display command overview

### **Telegram Commands**

Same commands as Discord, but use `/` prefix:
- `/search` or `/info` - Universal search
- `/cast` or `/casts` - Cast search
- `/far` - Farcaster user search
- `/z` or `/zora` - Zora search
- `/w` - Wallet lookup
- `/x` - X/Twitter lookup
- `/clanker` - Clanker search
- `/relay` - Relay transaction lookup
- `/help` - Help menu

**Note:** In Telegram groups, you must mention the bot (`@infobot`) OR paste addresses/URLs directly.

---

## ❌ **REMOVED AUTO-DETECTIONS**

These **no longer auto-trigger** - use commands instead:

- ~~`@username`~~ → Use `/far @username` or `/search @username`
- ~~`cast <keyword>`~~ → Use `/cast <keyword>`
- ~~`far <keyword>`~~ → Use `/far <keyword>`
- ~~`zora <query>`~~ → Use `/z <query>` or `/zora <query>`
- ~~`wallet 0x...`~~ → Use `/w 0x...` or `/search 0x...`
- ~~`x.com/...` or `twitter.com/...`~~ → Use `/x <handle>` or `/x <url>`

---

## 📊 **Quick Reference**

| What You Want | How to Search |
|---------------|---------------|
| **Token/Contract Address** | Just paste `0x...` (auto-detects) |
| **Farcaster Profile** | Use `/far @username` or `/search @username` |
| **Farcaster Casts** | Use `/cast keyword` |
| **Zora Profile/Coin** | Paste `zora.co/...` (auto-detects) OR use `/z @username` |
| **Clanker Token** | Paste `clanker.world/...` (auto-detects) OR use `/clanker query` |
| **Wallet Info** | Use `/w 0x...` or `/search 0x...` |
| **X/Twitter → Farcaster** | Use `/x username` or `/x https://x.com/username` |
| **Paragraph Post** | Just paste `paragraph.com/...` (auto-detects) |
| **Base Post** | Just paste `base.org/...` (auto-detects) |
| **Relay Transaction** | Use `/relay <tx>` |

---

## 🎯 **Examples**

### **Auto-Detection (No Command Needed)**
```
Paste: 0x9B01d5145B55526FB180a837Ae398eFbD78fD0F2
→ Auto-detects: Token details, creator, factory, trading links

Paste: zora.co/@username
→ Auto-detects: Zora profile, creator coin, Farcaster info

Paste: paragraph.com/@blog/writer-coins
→ Auto-detects: Paragraph post and token information
```

### **Commands (Use Slash Commands)**
```
/ far @vitalik
→ Shows: Farcaster profile, wallets, recent casts, Clanker tokens

/ cast base
→ Shows: Earliest cast with "base" + 2 most recent

/ w 0x1234...
→ Shows: Wallet profile with all associations

/ x vitalik
→ Shows: Farcaster profile linked to X/Twitter handle
```

---

## 💡 **Why the Change?**

- **Reduced Chat Noise**: Bot only responds when explicitly needed
- **Faster Response**: Less processing of irrelevant messages
- **Clearer Intent**: Commands make it obvious what you're searching for
- **Better Performance**: Fewer API calls and faster response times

---

**Built by fc @rayblanco.eth** • Use `/help` anytime for the full command list!

