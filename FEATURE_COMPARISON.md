# InfoBot Feature Comparison & Analysis

## 📋 DISCORD COMMANDS (Slash Commands)

### ✅ Fully Implemented
1. **`/search <query>`** - Universal search (wallets, contracts, Farcaster, Zora, transactions)
2. **`/zora <query>`** - Zora-specific search (accounts, contracts, creator coins)
3. **`/clanker <query>`** - Clanker deployment search
4. **`/casts <keyword>`** - Farcaster cast search by keyword
5. **`/help`** - Command help
6. **`/relay <transaction>`** - Cross-chain transaction details (Relay.link)
7. **`/debug`** - SIWF URL generation debug
8. **`/connect-signer`** - Connect trading signer (private key)
9. **`/disconnect-signer`** - Remove trading signer

### ⚠️ Registered but NOT in handler
- **`/stats`** - Registered in `register-global-commands.ts` but NOT in `src/registerCommands.ts` and NOT in `handleChatCommand` switch statement
  - **Status**: Only accessible via `!stats` in webhook channel (not as slash command)

---

## 📋 TELEGRAM COMMANDS

### ✅ Fully Implemented
1. **`/start`** - Start bot and show help
2. **`/help`** - Show help and commands
3. **`/search <query>`** - Universal search (same as Discord)
4. **`/zora <query>`** - Zora-specific search
5. **`/clanker <query>`** - Clanker deployment search
6. **`/casts <keyword>`** - Farcaster cast search
7. **`/relay <transaction>`** - Cross-chain transaction details
8. **`/connect-signer`** - Connect trading signer
9. **`/disconnect-signer`** - Remove trading signer

### ❌ Missing from Telegram
- **`/debug`** - Not implemented in Telegram

---

## 🔍 AUTO-DETECTION (Pasted Content)

### DISCORD Auto-Detection Handlers (in order of execution)

**Note**: Most handlers return `true`/`false` and exit early if they handle the message. `handleUsernameMessage` doesn't return early (processes all usernames).

1. **`handleUsernameMessage`** - `@username` mentions
   - Looks up Farcaster profile by username
   - **Returns**: `void` (doesn't exit early, continues to next handler)
   - **Pattern**: `@username` or `farcaster.xyz/username`

2. **`handleXAccountMessage`** - X/Twitter links (`x.com`, `twitter.com`)
   - Looks up Farcaster user by X handle
   - **Returns**: `boolean` (exits early if `true`)

3. **`handleZoraProfileMessage`** - Zora profile links (`zora.co/...`)
   - Looks up Zora profile
   - **Returns**: `boolean` (exits early if `true`)

4. **`handleBasePostMessage`** - Base social posts (`base.org/...`)
   - Looks up Base post details
   - **Returns**: `boolean` (exits early if `true`)

5. **`handleClankerAddressMessage`** - Clanker addresses/links (`clanker.world`)
   - Detects Clanker token addresses
   - **Returns**: `boolean` (exits early if `true`)

6. **`handleZoraAddressMessage`** - Zora contract addresses
   - Detects Zora coin addresses
   - **Returns**: `boolean` (exits early if `true`)

7. **`handleCastKeywordMessage`** - Messages containing "cast" keyword
   - Triggers cast search
   - **Returns**: `boolean` (exits early if `true`)

8. **`handleFarSearchMessage`** - Messages starting with "far "
   - Farcaster search trigger
   - **Returns**: `boolean` (exits early if `true`)

9. **`handleZoraSearchMessage`** - Messages starting with "zora "
   - Zora search trigger
   - **Returns**: `boolean` (exits early if `true`)

10. **`handleWalletSearchMessage`** - Messages starting with "wallet " or containing `0x...`
    - Wallet/address lookup (if not caught by other handlers)
    - **Returns**: `boolean` (exits early if `true`)
    - **Pattern**: `wallet 0x...` (explicit wallet search)

11. **`handleCastLinkMessage`** - Farcaster cast links (`farcaster.xyz/...`)
    - Looks up cast details
    - **Returns**: `void` (always runs last, no early exit)

---

### TELEGRAM Auto-Detection (in `processMessage`)

**Single unified handler** that processes:
- **Ethereum addresses** (`0x...`) - Detects in order:
  1. Zora coins (creator coins)
  2. Clanker tokens
  3. Base network tokens (DexScreener)
  4. Multi-chain tokens (Mantle, BSC, etc.)
  5. Farcaster user with wallet
  6. Zora profile (as fallback)

- **Farcaster usernames** (`@username`)
  - Looks up Farcaster profile

- **Zora URLs** (`zora.co/...`)
  - Looks up Zora profile/coin

- **X/Twitter links** (`x.com`, `twitter.com`)
  - Looks up Farcaster user by X handle

- **Farcaster cast links** (`farcaster.xyz/...`)
  - Looks up cast details

- **Base post links** (`base.org/...`)
  - Looks up Base post

- **Clanker links** (`clanker.world`)
  - Looks up Clanker token

---

## 🔄 SEARCH FLOW COMPARISON

### Discord `/search` Command Flow:
1. Check if transaction hash → `handleTransactionSearch`
2. Check if address (ETH/SOL) → `handleWalletSearch`
3. Try Farcaster username → `replyWithUsernameLookup`
4. Try Zora lookup → `replyWithZoraLookup`
5. Try Clanker lookup → `replyWithClankerTokenLookup`
6. Try Clanker user lookup → `replyWithClankerUserLookup`
7. Fallback: "Not found"

### Telegram `/search` Command Flow:
1. Check if transaction hash → Transaction lookup
2. Check if address (ETH/SOL) → Wallet search
3. Try Farcaster username → Username lookup
4. Try Zora lookup → Zora search
5. Try Clanker lookup → Clanker search
6. Fallback: "Not found"

**Note**: Telegram search flow is similar but uses different handlers (`handleSearchQuery`)

---

## ⚠️ POTENTIALLY UNUSED/INCOMPLETE FEATURES

### 1. **Trading Features** (`/connect-signer`, `/disconnect-signer`)
   - **Status**: Implemented in both Discord and Telegram
   - **Usage**: Unknown if actively used
   - **Bottleneck Risk**: Medium (requires private key storage, encryption)
   - **Recommendation**: Monitor usage, consider removing if unused

### 2. **Relay Command** (`/relay`)
   - **Status**: Implemented in both platforms
   - **Usage**: Unknown
   - **Bottleneck Risk**: Low (external API call)
   - **Recommendation**: Keep if useful, remove if unused

### 3. **Debug Command** (`/debug`)
   - **Status**: Discord only (not in Telegram)
   - **Usage**: Development/debugging
   - **Bottleneck Risk**: Low
   - **Recommendation**: Keep for development, or remove if not needed

### 4. **Stats Command** (`/stats` or `!stats`)
   - **Status**: Only accessible in webhook channel (not as slash command)
   - **Usage**: Admin monitoring
   - **Bottleneck Risk**: Low (database query)
   - **Recommendation**: Keep (admin feature)

### 5. **Multiple Auto-Detection Handlers (Discord)**
   - **Issue**: 11 different handlers run sequentially
   - **Bottleneck Risk**: HIGH - Each handler checks message content
   - **Recommendation**: 
     - Consolidate into single handler (like Telegram)
     - Use early returns to exit after first match
     - Consider parallel detection where possible

### 6. **Base Token Detection**
   - **Status**: Implemented in both platforms
   - **Bottleneck Risk**: Medium (multiple API calls: DexScreener, Basescan, RPC)
   - **Recommendation**: 
     - Cache factory detection results
     - Consider removing if not frequently used

### 7. **Multi-Chain Token Detection**
   - **Status**: Implemented in both platforms
   - **Bottleneck Risk**: Medium (external API calls)
   - **Recommendation**: Keep if useful, optimize with caching

### 8. **Zora Profile Fallback**
   - **Status**: Implemented in both platforms
   - **Bottleneck Risk**: Low (only runs if no token found)
   - **Recommendation**: Keep

---

## 🚨 BOTTLENECK ANALYSIS

### High Priority Optimizations:

1. **Discord Auto-Detection Chain** (11 sequential handlers)
   - **Current**: Each handler checks message content sequentially
   - **Impact**: Slower response times, unnecessary processing
   - **Fix**: Consolidate into single handler with early returns

2. **Base Token Factory Detection**
   - **Current**: Makes RPC call for every Base token
   - **Impact**: Extra latency per Base token lookup
   - **Fix**: Cache factory addresses or remove if not critical

3. **Trading Signer Storage**
   - **Current**: Stores encrypted private keys
   - **Impact**: Security risk, database overhead
   - **Fix**: Remove if unused, or move to external service

### Medium Priority:

4. **Multiple Zora Lookups**
   - **Current**: Multiple API calls for Zora data
   - **Impact**: Slower Zora searches
   - **Fix**: Already optimized with parallelization, but could cache more

5. **Clanker Token Lookups**
   - **Current**: Multiple API calls per search
   - **Impact**: Slower Clanker searches
   - **Fix**: Already optimized, but could add caching

### Low Priority:

6. **Relay Command**
   - **Impact**: External API dependency
   - **Fix**: Keep if useful, remove if unused

7. **Debug Command**
   - **Impact**: Minimal (Discord only, dev tool)
   - **Fix**: Keep for development

---

## 📊 FEATURE COMPLETENESS

### Fully Fleshed Out ✅
- Search functionality (Discord & Telegram)
- Zora integration (Discord & Telegram)
- Clanker integration (Discord & Telegram)
- Farcaster integration (Discord & Telegram)
- Wallet/address lookup (Discord & Telegram)
- Transaction lookup (Discord & Telegram)
- Cast search (Discord & Telegram)
- Pagination (Discord & Telegram)
- Statistics tracking (Discord & Telegram)
- Logging system (Discord webhook)

### Partially Implemented ⚠️
- Stats command (webhook channel only, not slash command)
- Trading features (implemented but usage unknown)

### Missing/Incomplete ❌
- Debug command in Telegram
- Global `/stats` slash command (only webhook channel)

---

## 🎯 RECOMMENDATIONS

### Immediate Actions:
1. **Optimize Discord auto-detection** - `handleUsernameMessage` doesn't exit early, causing unnecessary processing. Make it return early or consolidate handlers.
2. **Remove unused trading features** - If not actively used, remove to reduce complexity
3. **Cache Base token factory detection** - Reduce RPC calls
4. **Fix `/stats` inconsistency** - Registered in `register-global-commands.ts` but not in `src/registerCommands.ts` or handler. Either add it or remove it.

### Future Optimizations:
1. Add caching layer for frequently accessed data
2. Implement request queuing for rate-limited APIs
3. Add feature flags to disable unused features
4. Monitor feature usage and remove unused code

---

## 📝 SUMMARY

**Total Commands:**
- Discord: 9 slash commands (+ 1 webhook-only)
- Telegram: 9 commands

**Auto-Detection Handlers:**
- Discord: 11 separate handlers (sequential)
- Telegram: 1 unified handler (more efficient)

**Key Differences:**
- Discord has more granular auto-detection (11 handlers)
- Telegram has unified handler (better performance)
- Discord has `/debug` command
- Both have trading features (usage unknown)

**Bottleneck Risks:**
- HIGH: Discord auto-detection chain (11 sequential handlers)
- MEDIUM: Base token factory detection (RPC calls)
- MEDIUM: Trading features (if unused, remove)

