# Complete Search & Detection Reference

## 📋 ALL COMMANDS

### DISCORD Commands (Slash Commands)

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

### Text Commands (No Slash Needed - Discord Only)
- **`info <query>`** - Same as `/search` (e.g., `info 0x1234...` or `info @username`)

### Admin Commands (Webhook Channel Only - Discord)
- **`!stats`** or **`/stats`** or **`stats`** or **`!info`**
  - Bot statistics (only accessible in the webhook channel)
  - Shows: Discord servers, total users, Telegram chats, searches, uptime, memory, avg response time

---

### TELEGRAM Commands

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

### Text Commands (No Slash Needed - Telegram)
- **`info <query>`** - Same as `/search` (e.g., `info 0x1234...` or `info @username`)

---

## 🔍 AUTO-DETECTION (What We Check When Someone Pastes Content)

### DISCORD Auto-Detection

The bot automatically detects and responds to these when pasted in chat:

#### Addresses & Wallets
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

#### Farcaster
- **`@username`** — Farcaster profile lookup
- **`farcaster.xyz/...`** or **`warpcast.com/...`** — Farcaster cast or profile links
- **`x.com/...`** or **`twitter.com/...`** — Finds linked Farcaster profiles
- **`cast <keyword>`** — Search casts by keyword (e.g., `cast base`)
- **`far <keyword>`** — Search Farcaster users (e.g., `far vitalik`)

#### Platforms
- **`zora.co/...`** — Zora profile or coin links
- **`clanker.world/...`** — Clanker token links
- **`base.org/...`** or **`base.app/...`** — Base social post links
- **`paragraph.com/...`** or **`paragraph.xyz/...`** — Paragraph post links
- **`zora <query>`** — Zora search (e.g., `zora @username`)
- **`wallet 0x...`** — Wallet lookup (e.g., `wallet 0x1234...`)

---

### TELEGRAM Auto-Detection

The bot automatically detects and responds to these when pasted in chat:

#### Addresses & Wallets
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

#### Farcaster
- **`@username`** — Farcaster profile lookup
- **`farcaster.xyz/...`** — Farcaster cast or profile links
- **`x.com/...`** or **`twitter.com/...`** — Finds linked Farcaster profiles
- **`cast <keyword>`** — Search casts by keyword (e.g., `cast base`)
- **`far <keyword>`** — Search Farcaster users (e.g., `far vitalik`)

#### Platforms
- **`zora.co/...`** — Zora profile or coin links
- **`clanker.world/...`** — Clanker token links
- **`base.org/...`** or **`base.app/...`** — Base social post links
- **`paragraph.com/...`** or **`paragraph.xyz/...`** — Paragraph post links
- **`zora <query>`** — Zora search (e.g., `zora @username`)
- **`wallet 0x...`** — Wallet lookup (e.g., `wallet 0x1234...`)

---

## 🔄 DISCORD vs TELEGRAM COMPARISON

### Commands Comparison

| Feature | Discord | Telegram | Notes |
|---------|---------|----------|-------|
| **Slash Commands** | ✅ 6 commands | ✅ 6 commands | Same commands available |
| **Text Commands** | ✅ `info <query>` | ✅ `info <query>` | Both support text commands |
| **Auto-Detection** | ✅ 12 triggers | ✅ 12 triggers | Same detection logic |
| **Address Detection** | ✅ Full pipeline | ✅ Full pipeline | Identical search order |
| **URL Detection** | ✅ All types | ✅ All types | Same URL patterns |
| **Keyword Triggers** | ✅ 5 keywords | ✅ 5 keywords | Same keywords |
| **Admin Stats** | ✅ Webhook only | ❌ Not available | Discord-only feature |
| **Confirmation Prompts** | ✅ Buttons | ✅ Inline buttons | Different UI, same logic |

### Auto-Detection Response Comparison

**✅ IDENTICAL BEHAVIOR:**
- Both platforms use the **exact same search order** for addresses
- Both platforms detect the same URL patterns
- Both platforms use the same keyword triggers
- Both platforms show confirmation prompts for addresses, Farcaster links, X/Twitter links, and Zora links

**⚠️ DIFFERENCES:**
- **Discord**: Uses Discord buttons for confirmation prompts
- **Telegram**: Uses inline keyboard buttons for confirmation prompts
- **Discord**: Has admin stats command in webhook channel
- **Telegram**: No admin stats command

---

## 🔍 SEARCH ORDER (How We Search Things)

### When Processing an Ethereum Address (`0x...`)

**Both Discord and Telegram use this EXACT order:**

#### STEP 1: Zora Coins (Creator Coins)
- **API**: Zora API (`fetchZoraCoin`, `findBestZoraSummary`)
- **Check**: Is this address a Zora creator coin?
- **If Found**: Show Zora coin card → **EXIT** (don't check anything else)
- **If Not Found**: Continue to Step 2

#### STEP 2: Clanker Tokens
- **API**: Clanker API (`fetchTokensByAddress`)
- **Check**: Is this address a Clanker token contract?
- **Search Method**: 
  - Searches by `contractAddress` (exact match)
  - Searches by `q` (query search)
  - Searches by `pairAddress` (pair address)
  - All three searches run in parallel (3 second timeout each)
- **If Found**: Show Clanker token pages → **EXIT**
- **If Not Found**: Continue to Step 3

#### STEP 3: Base Network Tokens
- **API**: DexScreener API (`fetchBaseTokenData`)
- **Check**: Is this a token on Base network (chain ID 8453)?
- **Search Method**: 
  - Queries DexScreener `/tokens/{address}` endpoint
  - Filters results for `chainId === "base"` or `chainId === "8453"`
  - Selects pair with highest liquidity
- **If Found**: Show Base token embed → **EXIT**
- **If Not Found**: Continue to Step 4

#### STEP 4: Multi-Chain Tokens
- **API**: DexScreener API (`fetchMultiChainTokenData`)
- **Check**: Is this a token on other chains (Mantle, BSC, Polygon, Arbitrum, Optimism, Avalanche, Fantom, Monad, etc.)?
- **Search Method**: 
  - Queries DexScreener `/tokens/{address}` endpoint
  - Gets pair with highest liquidity across ALL chains
  - Filters out Base tokens (already checked in Step 3)
- **If Found**: Show multi-chain token embed → **EXIT**
- **If Not Found**: Continue to Step 5

#### STEP 5: Paragraph Coins (Tokenized Posts)
- **API**: Paragraph API (`getCoinByContract`)
- **Check**: Is this a Paragraph tokenized post coin?
- **Note**: This check happens in parallel with Base/multi-chain checks in some handlers
- **If Found**: Show Paragraph coin embed → **EXIT**
- **If Not Found**: Continue to Step 6

#### STEP 6: Farcaster User with Wallet
- **API**: Neynar API (`findUserByWallet`)
- **Check**: Does this wallet address belong to a Farcaster user?
- **Search Method**: 
  - Queries Neynar API by wallet address
  - Also checks Zora summary for Farcaster handle (fallback)
- **If Found**: Show wallet profile with Farcaster info → **EXIT**
- **If Not Found**: Continue to Step 7

#### STEP 7: Monad Token Fallback (RPC Detection)
- **API**: BlockVision API + RPC (`getMonadAccountInfo`, `detectTokenContract`)
- **Check**: Is this a Monad contract that's a token?
- **Search Method**: 
  - Checks if address is a contract on Monad (chain ID 5001)
  - Tries to read token info via RPC (name, symbol, decimals)
  - Checks if it's from a known factory (Nad.fun, Clanker, etc.)
  - For Nad.fun tokens, tries to get price data
- **If Found**: Show Monad token embed → **EXIT**
- **If Not Found**: Continue to Step 8

#### STEP 8: ERC-20 Token Detection (RPC Fallback)
- **API**: RPC calls to multiple chains (`detectTokenContract`)
- **Check**: Is this an ERC-20 token not yet indexed by DexScreener?
- **Search Method**: 
  - Calls `balanceOf`, `name`, `symbol`, `decimals`, `totalSupply` on multiple chains in parallel
  - Checks all supported chains (5 second timeout per chain)
  - Returns first successful result
- **If Found**: Show basic token embed → **EXIT**
- **If Not Found**: Continue to Step 9

#### STEP 9: Zora Profile Fallback
- **API**: Zora API (`findBestZoraSummary`)
- **Check**: Is this a Zora profile (wallet with Zora activity but no coin)?
- **Search Method**: 
  - Only shows if NO tokens were found in previous steps
  - Checks if Zora summary exists and is associated with address
  - Blocks if any token was found (prevents showing profile for token contracts)
- **If Found**: Show Zora wallet profile → **EXIT**
- **If Not Found**: Continue to Step 10

#### STEP 10: Multi-Chain Address Lookup (Final Fallback)
- **API**: Explorer APIs + RPC (`lookupAddress`)
- **Check**: Does this address have activity on any supported chain?
- **Search Method**: 
  - Checks all supported chains in parallel
  - Uses explorer APIs when available, falls back to RPC
  - Returns address info (isContract, balance, transactionCount) for each chain
- **If Found**: Show address information across chains → **EXIT**
- **If Not Found**: Show "not found" message

---

## 🎯 HOW WE DECIDE: Wallet vs Token vs Profile

### Decision Logic

1. **Token Priority**: If ANY token is found (Zora coin, Clanker token, Base token, multi-chain token, Paragraph coin, Monad token, ERC-20 token), we show token information and **DO NOT** show wallet profile.

2. **Farcaster User Priority**: If a Farcaster user is found with this wallet, we show wallet profile with Farcaster info (unless a token was found first).

3. **Zora Profile Fallback**: Only shown if:
   - NO tokens were found
   - NO Farcaster user was found
   - Zora summary exists and is associated with the address

4. **Address Lookup Fallback**: Only shown if nothing else was found.

### Token Detection Priority

1. **Zora Coins** (highest priority - creator coins are special)
2. **Clanker Tokens** (indexed tokens)
3. **Base Tokens** (DexScreener - Base network)
4. **Multi-Chain Tokens** (DexScreener - other chains)
5. **Paragraph Coins** (tokenized posts)
6. **Monad Tokens** (RPC detection)
7. **ERC-20 Tokens** (RPC detection - not on DEXes)

### Wallet Detection Priority

1. **Farcaster User** (if wallet linked to Farcaster profile)
2. **Zora Profile** (if wallet has Zora activity but no coin)
3. **Multi-Chain Address** (if address has activity on any chain)

---

## 🔗 HOW WE SEARCH CONTRACTS AND DETERMINE CHAINS

### Contract Detection Methods

#### Method 1: DexScreener API (Primary)
- **Endpoint**: `https://api.dexscreener.com/latest/dex/tokens/{address}`
- **Purpose**: Find tokens with trading pairs
- **Chain Detection**: 
  - Returns `chainId` in response (e.g., "base", "8453", "5001", "mantle")
  - Filters by chain ID to determine which chain the token is on
- **Used For**: Base tokens, multi-chain tokens

#### Method 2: Explorer APIs (Secondary)
- **APIs Used**:
  - Etherscan API (Ethereum)
  - Basescan API (Base)
  - Polygonscan API (Polygon)
  - Arbiscan API (Arbitrum)
  - Optimistic Etherscan API (Optimism)
  - Snowtrace API (Avalanche)
  - BSCscan API (BSC)
  - FTMScan API (Fantom)
- **Purpose**: Get contract creation info, deployer address, transaction count
- **Chain Detection**: Each API is chain-specific (we know the chain from the API endpoint)
- **Used For**: Contract creation lookup, deployer identification

#### Method 3: RPC Calls (Tertiary)
- **Purpose**: Detect ERC-20 tokens, check if address is contract
- **Chain Detection**: 
  - Calls `eth_getCode` on multiple chains in parallel
  - Returns chain ID where contract is found
  - Uses `detectTokenContract` which checks all chains simultaneously
- **Used For**: Token detection on chains not indexed by DexScreener

#### Method 4: BlockVision API (Monad Only)
- **API**: BlockVision API for Monad chain
- **Purpose**: Get Monad account info, token info
- **Chain Detection**: Always Monad (chain ID 5001)
- **Used For**: Monad-specific token detection

### Chain Detection from Transaction Links

When a transaction link is provided, we detect the chain from the URL:

- **`basescan.org`** → Base (8453)
- **`etherscan.io`** → Ethereum (1)
- **`arbiscan.io`** → Arbitrum (42161)
- **`optimistic.etherscan.io`** → Optimism (10)
- **`polygonscan.com`** → Polygon (137)
- **`snowtrace.io`** → Avalanche (43114)
- **`bscscan.com`** → BSC (56)
- **`ftmscan.com`** → Fantom (250)
- **`explorer.mantle.xyz`** → Mantle (5000)
- **`monadscan.com`** → Monad (5001)

---

## 🌐 FULLY SUPPORTED CHAINS

### Chains with Full Support (9 Chains)

1. **Base** (Chain ID: 8453)
   - ✅ Explorer API: Basescan V2 API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

2. **Ethereum** (Chain ID: 1)
   - ✅ Explorer API: Etherscan API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

3. **BSC (Binance Smart Chain)** (Chain ID: 56)
   - ✅ Explorer API: BSCscan API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

4. **Polygon** (Chain ID: 137)
   - ✅ Explorer API: Polygonscan API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

5. **Arbitrum** (Chain ID: 42161)
   - ✅ Explorer API: Arbiscan API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

6. **Optimism** (Chain ID: 10)
   - ✅ Explorer API: Optimistic Etherscan API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

7. **Avalanche** (Chain ID: 43114)
   - ✅ Explorer API: Snowtrace API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

8. **Fantom** (Chain ID: 250)
   - ✅ Explorer API: FTMScan API
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

9. **Mantle** (Chain ID: 5000)
   - ✅ Explorer API: Mantle Blockscout API (with RPC fallback)
   - ✅ Creator lookup: Full support
   - ✅ Creation TX: Full support (via RPC)
   - ✅ Farcaster/Zora: Full support
   - ✅ Token detection: DexScreener + RPC

### Chains with Partial Support

10. **Monad** (Chain ID: 5001)
    - ✅ Explorer: Monadscan (no public API)
    - ✅ Creator lookup: BlockVision API + RPC
    - ✅ Creation TX: BlockVision API + RPC
    - ✅ Farcaster/Zora: Full support
    - ✅ Token detection: DexScreener + BlockVision API + RPC
    - ⚠️ Limited explorer API support (uses BlockVision API instead)

11. **Gnosis** (Chain ID: 100)
    - ⚠️ Explorer API: Limited support
    - ⚠️ Token detection: DexScreener + RPC
    - ❌ Creator lookup: Not fully supported
    - ❌ Creation TX: Not fully supported

12. **Celo** (Chain ID: 42220)
    - ⚠️ Explorer API: Limited support
    - ⚠️ Token detection: DexScreener + RPC
    - ❌ Creator lookup: Not fully supported
    - ❌ Creation TX: Not fully supported

13. **Linea** (Chain ID: 59144)
    - ⚠️ Explorer API: Limited support
    - ⚠️ Token detection: DexScreener + RPC
    - ❌ Creator lookup: Not fully supported
    - ❌ Creation TX: Not fully supported

14. **Scroll** (Chain ID: 534352)
    - ⚠️ Explorer API: Limited support
    - ⚠️ Token detection: DexScreener + RPC
    - ❌ Creator lookup: Not fully supported
    - ❌ Creation TX: Not fully supported

---

## 🔍 BLOCK EXPLORERS AND SCANS WE PROVIDE

### Address Links

For each supported chain, we provide explorer links in this format:

1. **Ethereum** (Chain ID: 1)
   - Explorer: `https://etherscan.io/address/{address}`
   - API: `https://api.etherscan.io/api`

2. **Base** (Chain ID: 8453)
   - Explorer: `https://basescan.org/address/{address}`
   - API: `https://api.basescan.org/api`

3. **Polygon** (Chain ID: 137)
   - Explorer: `https://polygonscan.com/address/{address}`
   - API: `https://api.polygonscan.com/api`

4. **Arbitrum** (Chain ID: 42161)
   - Explorer: `https://arbiscan.io/address/{address}`
   - API: `https://api.arbiscan.io/api`

5. **Optimism** (Chain ID: 10)
   - Explorer: `https://optimistic.etherscan.io/address/{address}`
   - API: `https://api-optimistic.etherscan.io/api`

6. **Avalanche** (Chain ID: 43114)
   - Explorer: `https://snowtrace.io/address/{address}`
   - API: `https://api.snowtrace.io/api`

7. **BSC** (Chain ID: 56)
   - Explorer: `https://bscscan.com/address/{address}`
   - API: `https://api.bscscan.com/api`

8. **Fantom** (Chain ID: 250)
   - Explorer: `https://ftmscan.com/address/{address}`
   - API: `https://api.ftmscan.com/api`

9. **Mantle** (Chain ID: 5000)
   - Explorer: `https://explorer.mantle.xyz/address/{address}`
   - API: None (uses RPC fallback)

10. **Monad** (Chain ID: 5001)
    - Explorer: `https://monadscan.com/address/{address}`
    - API: BlockVision API (not standard explorer API)

### Transaction Links

For each supported chain, we provide transaction links in this format:

1. **Ethereum**: `https://etherscan.io/tx/{txHash}`
2. **Base**: `https://basescan.org/tx/{txHash}`
3. **Polygon**: `https://polygonscan.com/tx/{txHash}`
4. **Arbitrum**: `https://arbiscan.io/tx/{txHash}`
5. **Optimism**: `https://optimistic.etherscan.io/tx/{txHash}`
6. **Avalanche**: `https://snowtrace.io/tx/{txHash}`
7. **BSC**: `https://bscscan.com/tx/{txHash}`
8. **Fantom**: `https://ftmscan.com/tx/{txHash}`
9. **Mantle**: `https://explorer.mantle.xyz/tx/{txHash}`
10. **Monad**: `https://monadscan.com/tx/{txHash}`

### What Data We Provide

For each address/contract, we provide:

1. **Contract Information**:
   - Is it a contract or EOA (Externally Owned Account)?
   - Contract creator/deployer address
   - Creation transaction hash
   - Creation timestamp

2. **Token Information** (if applicable):
   - Token name and symbol
   - Price (USD)
   - 24h price change
   - 24h volume
   - Liquidity
   - Market cap / FDV
   - 24h trades
   - DEX name and URL
   - Factory name (if from known factory)

3. **Profile Information** (if applicable):
   - Farcaster profile (@username)
   - Zora profile
   - Clanker tokens deployed
   - Recent casts

4. **Chain Activity**:
   - Balance (native token)
   - Transaction count
   - Links to explorer

---

## 🧹 CLEANUP RECOMMENDATIONS

### Potential Optimizations

1. **Reduce Parallel Searches**: Currently, we check multiple sources in parallel. Consider:
   - Combining Zora coin and Zora summary checks (they're related)
   - Combining Clanker searches (contract, query, pair) - already optimized
   - Combining Base and multi-chain DexScreener checks (same API, different filters)

2. **Timeout Management**: 
   - Current timeouts: 3-8 seconds per check
   - Consider reducing timeouts for faster responses
   - Consider implementing a global timeout (e.g., 10 seconds total)

3. **Cache Frequently Accessed Data**:
   - Cache Zora summaries (they don't change often)
   - Cache Clanker token lookups (tokens don't change)
   - Cache contract creation info (never changes)

4. **Simplify Search Order**:
   - Consider grouping token checks together (all token checks first, then profile checks)
   - Consider removing redundant checks (e.g., if DexScreener finds it, don't check RPC)

5. **Remove Unused Checks**:
   - Review if ERC-20 RPC detection is needed (DexScreener covers most tokens)
   - Review if Monad RPC fallback is needed (DexScreener now supports Monad)

6. **Chain Detection Optimization**:
   - If we know the chain from context (e.g., transaction link), don't check all chains
   - Use chain hints when available (e.g., from URL, from previous searches)

---

## 📊 SUMMARY TABLE

| Check Type | API Used | Timeout | Priority | Exit on Found |
|------------|----------|---------|----------|---------------|
| Zora Coin | Zora API | ~5s | 1 | ✅ Yes |
| Clanker Token | Clanker API | 3s | 2 | ✅ Yes |
| Base Token | DexScreener | ~3s | 3 | ✅ Yes |
| Multi-Chain Token | DexScreener | ~3s | 4 | ✅ Yes |
| Paragraph Coin | Paragraph API | ~3s | 5 | ✅ Yes |
| Farcaster User | Neynar API | ~3s | 6 | ✅ Yes |
| Monad Token | BlockVision + RPC | ~5s | 7 | ✅ Yes |
| ERC-20 Token | RPC (multi-chain) | 8s | 8 | ✅ Yes |
| Zora Profile | Zora API | ~5s | 9 | ✅ Yes |
| Address Lookup | Explorer APIs + RPC | ~5s | 10 | ✅ Yes |

---

**Last Updated**: Based on current codebase analysis
**Note**: This document reflects the actual implementation as of the analysis date. Some optimizations may have been made since then.


