# InfoBot - Current Commands & Features

## 📋 DISCORD COMMANDS (Slash Commands)

### Search Commands
1. **`/search <query>`**
   - Universal search command
   - Searches: wallets, contracts, Farcaster profiles, Zora accounts, or transactions
   - Shows all associated tokens and profiles
   - Example: `/search 0x1234...` or `/search @username`

2. **`/zora <query>`**
   - Zora-specific search
   - Searches: Zora accounts, contracts, or creator coins
   - Shows: profile, creator coin, and latest posts
   - Example: `/zora @username` or `/zora 0x1234...`

3. **`/clanker <query>`**
   - Clanker deployment search
   - Searches: by wallet, Farcaster username, or token name/ticker
   - Shows: all deployments with pagination
   - Example: `/clanker tokenname` or `/clanker 0x1234...`

4. **`/casts <keyword> [recent_count]`**
   - Farcaster cast search
   - Searches casts by keyword
   - Shows: earliest match first, then 2 most recent (paginated)
   - Optional: `recent_count` (0-5, default: 2)
   - Example: `/casts keyword` or `/casts keyword 3`

5. **`/relay <transaction>`**
   - Cross-chain transaction lookup
   - Gets transaction details from Relay.link
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

### Search Commands
1. **`/start`** or **`/help`**
   - Start bot and see help
   - Displays all available commands and auto-detection features

2. **`/search <query>`**
   - Universal search command
   - Searches: wallets, contracts, Farcaster profiles, or Zora accounts
   - Example: `/search 0x1234...` or `/search @username`

3. **`/zora <query>`**
   - Zora-specific search
   - Searches: Zora accounts, contracts, or creator coins
   - Example: `/zora @username` or `/zora 0x1234...`

4. **`/clanker <query>`**
   - Clanker deployment search
   - Example: `/clanker tokenname` or `/clanker 0x1234...`

5. **`/casts <keyword>`**
   - Farcaster cast search by keyword
   - Example: `/casts keyword`

6. **`/relay <transaction>`**
   - Cross-chain transaction lookup from Relay.link
   - Accepts: full transaction link or transaction hash
   - Also accepts wallet addresses to find most recent Relay transaction
   - Example: `/relay https://basescan.org/tx/0x...` or `/relay 0x...` or `/relay 0x...` (wallet)

---

## 🔍 AUTO-DETECTION FEATURES

### Discord Auto-Detection (Paste in Chat)

The bot automatically detects and responds to:

1. **Farcaster Usernames** (`@username`)
   - Detects: `@username` mentions or `farcaster.xyz/username` links
   - Shows: Farcaster profile with wallets, recent cast, Clanker deployments, and Zora info

2. **X/Twitter Links** (`x.com`, `twitter.com`)
   - Detects: X.com or Twitter.com profile links
   - Shows: Farcaster profile (if linked to Farcaster)

3. **Zora Profile Links** (`zora.co/...`)
   - Detects: Zora profile URLs
   - Shows: Zora profile with creator coin and Farcaster info

4. **Base Social Posts** (`base.org/...`)
   - Detects: Base social post links
   - Shows: Base post details

5. **Clanker Addresses/Links** (`clanker.world` or `0x...` Clanker tokens)
   - Detects: Clanker token addresses or `clanker.world` links
   - Shows: Clanker token details with deployer info, Farcaster profile, and Zora info

6. **Zora Contract Addresses** (`0x...` Zora coins)
   - Detects: Zora coin contract addresses
   - Shows: Zora coin details with creator info, creator coin, and Farcaster profile

7. **Cast Keywords** (`cast <keyword>`)
   - Detects: Messages containing "cast" keyword
   - Triggers: Cast search by keyword

8. **Far Search** (`far <keyword>`)
   - Detects: Messages starting with "far "
   - Triggers: Farcaster search

9. **Zora Search** (`zora <query>`)
   - Detects: Messages starting with "zora "
   - Triggers: Zora search

10. **Wallet Search** (`wallet 0x...`)
    - Detects: Messages starting with "wallet " followed by address
    - Shows: Wallet profile with Farcaster, Zora, and Clanker associations

11. **Farcaster Cast Links** (`farcaster.xyz/...`, `warpcast.com/...`)
    - Detects: Farcaster cast URLs
    - Shows: Cast details

12. **Ethereum/Solana Addresses** (`0x...` or Solana addresses)
    - Detects: Any Ethereum (0x...) or Solana wallet address
    - Auto-detects in order:
      1. Zora coins (creator coins)
      2. Clanker tokens
      3. Base network tokens (DexScreener)
      4. Multi-chain tokens (Mantle, BSC, etc.)
      5. Farcaster user with wallet (includes Zora profile if associated)
      6. Zora profile (as fallback)

---

### Telegram Auto-Detection (Paste in Chat)

The bot automatically detects and responds to:

1. **Ethereum Addresses** (`0x...`)
   - Auto-detects in order:
     1. Zora coins (creator coins)
     2. Clanker tokens
     3. Base network tokens (DexScreener)
     4. Multi-chain tokens (Mantle, BSC, etc.)
     5. Farcaster user with wallet
     6. Zora profile (as fallback)

2. **Farcaster Usernames** (`@username`)
   - Looks up Farcaster profile

3. **Zora URLs** (`zora.co/...`)
   - Looks up Zora profile/coin

4. **X/Twitter Links** (`x.com`, `twitter.com`)
   - Looks up Farcaster user by X handle

5. **Farcaster Cast Links** (`farcaster.xyz/...`)
   - Looks up cast details

6. **Base Post Links** (`base.org/...`)
   - Looks up Base post

7. **Clanker Links** (`clanker.world`)
   - Looks up Clanker token

---

## ✨ CORE FEATURES

### 1. Multi-Page Cards
- All cards support pagination when there's more information
- Navigate through multiple pages of data
- Available on both Discord and Telegram

### 2. Zora Integration
- **Zora Coins**: Shows coin details, creator info, creator coin, and Farcaster profile
- **Zora Profiles**: Shows profile, creator coin, and latest posts
- **Creator Detection**: Automatically associates coins with creators

### 3. Farcaster Integration
- **Farcaster Profiles**: Shows profile, wallets, recent cast, Clanker deployments, and Zora info
- **Cast Search**: Search casts by keyword (earliest + recent)
- **Username Lookup**: Find users by @username or wallet address
- **X/Twitter Integration**: Find Farcaster users by X handle

### 4. Clanker Integration
- **Token Search**: Search by wallet, Farcaster username, or token name/ticker
- **Token Details**: Shows token details, deployer info, Farcaster profile, and Zora info
- **Deployment Tracking**: Shows all token deployments with pagination
- **Reputation System**: Filters tokens based on deployer reputation

### 5. Wallet Lookups
- **Multi-Chain Support**: Ethereum, Solana, Base, and more
- **Automatic Detection**: Automatically detects and shows:
  - Farcaster profiles
  - Zora accounts
  - Clanker tokens
  - Base tokens
  - Multi-chain tokens

### 6. Transaction Lookup
- **Relay Integration**: Cross-chain transaction details from Relay.link
- **Transaction Hash**: Look up by transaction hash or link
- **Wallet History**: Find most recent Relay transaction by wallet address

### 7. Base Token Detection
- **DexScreener Integration**: Real-time token data
- **Factory Detection**: Identifies token factory (Fey, ApeStore, KLIK, etc.)
- **Creator Detection**: Finds contract creator address
- **Creation Date**: Shows when token was created

### 8. Multi-Chain Token Support
- **Supported Chains**: Mantle, BSC, Polygon, Arbitrum, Optimism, Avalanche, Fantom, and more
- **Token Data**: Price, volume, liquidity, and market data
- **Chain Detection**: Automatically detects chain from token address

### 9. Pagination System
- **Multi-Page Embeds**: Automatically splits long content into pages
- **Navigation Buttons**: Easy navigation between pages
- **Page Labels**: Custom labels for different page types

### 10. Statistics & Monitoring
- **Bot Statistics**: Track servers, users, searches, uptime, memory, response times
- **User Tracking**: Track unique users across Discord and Telegram
- **Search Logging**: Log all searches to Discord webhook
- **System Updates**: Notify when bot joins new servers/groups

### 11. Error Handling & Performance
- **Timeout Protection**: API calls have timeouts to prevent hanging
- **Parallel Processing**: Multiple API calls run in parallel for faster results
- **Graceful Fallbacks**: Falls back to alternative data sources when primary fails
- **Error Logging**: Comprehensive error logging to Discord webhook

### 12. Database Integration
- **Persistent Storage**: PostgreSQL database for:
  - Seen Telegram chats (prevents duplicate notifications)
  - Seen Discord guilds (prevents duplicate notifications)
  - Clanker broadcast tracking
- **Atomic Operations**: Prevents race conditions and duplicate entries

---

## 🚫 REMOVED FEATURES

The following features have been removed:
- ❌ `/debug` - SIWF debug command
- ❌ `/connect-signer` - Trading signer connection
- ❌ `/disconnect-signer` - Trading signer removal
- ❌ Trading execution (buy/sell/swap commands exist but are disabled)

---

## 📊 SUMMARY

**Total Discord Commands**: 6 slash commands + 1 admin command (webhook channel only)
**Total Telegram Commands**: 6 commands
**Auto-Detection Handlers**: 12 (Discord) / 7 (Telegram)
**Core Features**: 12 major features

**Platform Support**:
- ✅ Discord (slash commands + auto-detection)
- ✅ Telegram (commands + auto-detection)
- ✅ Multi-chain blockchain support
- ✅ Farcaster ecosystem integration
- ✅ Zora platform integration
- ✅ Clanker token platform integration

