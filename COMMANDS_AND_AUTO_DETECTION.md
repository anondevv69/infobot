# InfoBot - Commands & Auto-Detection Reference

## 📋 DISCORD COMMANDS (Slash Commands)

### Available Commands

1. **`/search <query>`**
   - Universal search for wallets, contracts, Farcaster profiles, Zora accounts, or transactions
   - Example: `/search 0x1234...` or `/search @username`

2. **`/zora <query>`**
   - Zora-specific search for accounts, contracts, or creator coins
   - Example: `/zora @username` or `/zora 0x1234...`

3. **`/clanker <query>`**
   - Search Clanker token deployments by wallet, Farcaster username, or token name/ticker
   - Example: `/clanker tokenname` or `/clanker 0x1234...`

4. **`/casts <keyword> [recent_count]`**
   - Search Farcaster casts by keyword
   - Shows earliest match first, then 2 most recent (default)
   - Optional: `recent_count` (0-5) to change number of recent casts
   - Example: `/casts base` or `/casts base 3`

5. **`/relay <transaction>`**
   - Cross-chain transaction lookup from Relay.link
   - Accepts: full transaction link or transaction hash
   - Example: `/relay https://basescan.org/tx/0x...` or `/relay 0x...`

6. **`/help`**
   - Display command overview and auto-detection features

### Admin Commands (Webhook Channel Only)
7. **`!stats`** or **`/stats`** or **`stats`** or **`!info`**
   - Bot statistics (only accessible in the webhook channel)
   - Shows: Discord servers, total users, Telegram chats, searches, uptime, memory, avg response time

---

## 📱 TELEGRAM COMMANDS

### Available Commands

1. **`/start`** or **`/help`**
   - Start bot and see help
   - Displays all available commands and auto-detection features

2. **`/search <query>`**
   - Universal search for wallets, contracts, Farcaster profiles, or Zora accounts
   - Example: `/search 0x1234...` or `/search @username`

3. **`/zora <query>`**
   - Zora-specific search for accounts, contracts, or creator coins
   - Example: `/zora @username` or `/zora 0x1234...`

4. **`/clanker <query>`**
   - Search Clanker token deployments
   - Example: `/clanker tokenname` or `/clanker 0x1234...`

5. **`/casts <keyword>`**
   - Search Farcaster casts by keyword
   - Example: `/casts base`

6. **`/relay <transaction>`**
   - Cross-chain transaction lookup from Relay.link
   - Accepts: full transaction link, transaction hash, or wallet address (finds most recent)
   - Example: `/relay https://basescan.org/tx/0x...` or `/relay 0x...` (tx or wallet)

---

## 🔍 DISCORD AUTO-DETECTION (Just Paste in Chat!)

The bot automatically detects and responds to these when pasted in chat:

### Addresses & Wallets
- **`0x...`** (Ethereum/Base addresses)
  - Auto-detects in order:
    1. Zora coins (creator coins)
    2. Clanker tokens
    3. Base network tokens (DexScreener)
    4. Multi-chain tokens (Mantle, BSC, Polygon, etc.)
    5. Farcaster user with wallet
    6. Zora profile (as fallback)

- **Solana addresses** (base58 format)
  - Auto-detects profiles and tokens

### Farcaster
- **`@username`** — Farcaster profile lookup
- **`farcaster.xyz/...`** or **`warpcast.com/...`** — Farcaster cast or profile links
- **`x.com/...`** or **`twitter.com/...`** — Finds linked Farcaster profiles
- **`cast <keyword>`** — Search casts by keyword (e.g., `cast base`)
- **`far <keyword>`** — Search Farcaster users (e.g., `far vitalik`)

### Platforms
- **`zora.co/...`** — Zora profile or coin links
- **`clanker.world/...`** — Clanker token links
- **`base.org/...`** or **`base.app/...`** — Base social post links
- **`zora <query>`** — Zora search (e.g., `zora @username`)
- **`wallet 0x...`** — Wallet lookup (e.g., `wallet 0x1234...`)

---

## 🔍 TELEGRAM AUTO-DETECTION (Just Paste in Chat!)

The bot automatically detects and responds to these when pasted in chat:

### Addresses & Wallets
- **`0x...`** (Ethereum/Base addresses)
  - Auto-detects in order:
    1. Zora coins (creator coins)
    2. Clanker tokens
    3. Base network tokens (DexScreener)
    4. Multi-chain tokens (Mantle, BSC, Polygon, etc.)
    5. Farcaster user with wallet
    6. Zora profile (as fallback)

- **Solana addresses** (base58 format)
  - Auto-detects profiles and tokens

### Farcaster
- **`@username`** — Farcaster profile lookup
- **`farcaster.xyz/...`** — Farcaster cast or profile links
- **`x.com/...`** or **`twitter.com/...`** — Finds linked Farcaster profiles
- **`cast <keyword>`** — Search casts by keyword (e.g., `cast base`)
- **`far <keyword>`** — Search Farcaster users (e.g., `far vitalik`)

### Platforms
- **`zora.co/...`** — Zora profile or coin links
- **`clanker.world/...`** — Clanker token links
- **`base.org/...`** or **`base.app/...`** — Base social post links
- **`zora <query>`** — Zora search (e.g., `zora @username`)
- **`wallet 0x...`** — Wallet lookup (e.g., `wallet 0x1234...`)

---

## 📊 Quick Comparison

| Feature | Discord | Telegram |
|---------|---------|----------|
| **Slash Commands** | ✅ 6 commands | ✅ 6 commands |
| **Auto-Detection** | ✅ 12 triggers | ✅ 12 triggers |
| **Address Detection** | ✅ Full pipeline | ✅ Full pipeline |
| **URL Detection** | ✅ All types | ✅ All types |
| **Keyword Triggers** | ✅ 5 keywords | ✅ 5 keywords |
| **Admin Stats** | ✅ Webhook only | ❌ Not available |

---

## 💡 Usage Tips

### Discord
- **No commands needed!** Just paste addresses, usernames, or links in chat
- Use slash commands for specific searches: `/search`, `/zora`, `/clanker`, `/casts`, `/relay`
- Bot responds automatically to detected content

### Telegram
- **In groups:** Mention the bot (`@infobot`) or paste addresses/links directly
- **In private chats:** Just paste anything - no mention needed
- Use commands for specific searches: `/search`, `/zora`, `/clanker`, `/casts`, `/relay`

---

## 🎯 Examples

### Discord Examples
```
Paste: 0x9B01d5145B55526FB180a837Ae398eFbD78fD0F2
→ Shows: Token details, creator, factory, trading links

Paste: @vitalik
→ Shows: Farcaster profile, wallets, recent casts, Clanker tokens

Paste: zora.co/@username
→ Shows: Zora profile, creator coin, Farcaster info

Paste: cast base
→ Shows: Earliest cast with "base" + 2 most recent

Paste: far vitalik
→ Shows: Farcaster user search results
```

### Telegram Examples
```
Paste: 0x9B01d5145B55526FB180a837Ae398eFbD78fD0F2
→ Shows: Token details, creator, factory, trading links

Paste: @vitalik
→ Shows: Farcaster profile, wallets, recent casts

Paste: zora.co/@username
→ Shows: Zora profile, creator coin, Farcaster info

Paste: cast base
→ Shows: Earliest cast with "base" + 2 most recent

Paste: wallet 0x1234...
→ Shows: Wallet profile with all associations
```

---

**Built by rayblanco.eth** • Use `/help` anytime for the full command list!

