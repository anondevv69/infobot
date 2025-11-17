# Pagination Guide: When Multi-Page vs Single-Page

This document explains when the bot shows **multiple pages** (with pagination buttons) vs **single-page cards**.

## 📄 **MULTI-PAGE RESPONSES** (With Pagination Buttons)

### 1. **Farcaster Profile Lookup** (`/search` with Farcaster username)
   - **Page 1**: Profile info, wallets, custody address, verified ETH/SOL addresses, most recent cast
   - **Page 2**: First Clanker + Latest Clanker details, Zora profile info (if available)
   - **Condition**: Only shows Page 2 if user has Clanker deployments OR Zora profile
   - **Location**: `src/utils/farcasterPresentation.ts`

### 2. **Zora Coin Lookup** (Pasting Zora contract or `/zora` command)
   - **Page 1**: Coin details (chain, symbol, name, contract, creator coin, socials, creator info)
   - **Page 2**: Creator Coin field + Farcaster profile (if creator has Farcaster account)
   - **Condition**: Only shows Page 2 if creator has a Farcaster account
   - **Location**: `src/handlers/zoraAddress.ts`

### 3. **Clanker Token Lookup** (Pasting Clanker contract address)
   - **Page 1**: Token info (name, symbol, contract, deployment details, socials, earliest cast)
   - **Page 2**: Dev Profile (Farcaster info, wallets, first/latest clanker)
   - **Page 3**: Zora info (if deployer has Zora profile)
   - **Condition**: 
     - Page 2 always shown if deployer has Farcaster
     - Page 3 only if deployer has Zora profile
   - **Location**: `src/handlers/clankerAddress.ts`

### 4. **`/casts` Command** (Search casts by keyword)
   - **Page 1**: Earliest cast matching keyword
   - **Page 2**: Most recent cast #1
   - **Page 3**: Most recent cast #2
   - **Condition**: Up to 3 pages (earliest + 2 most recent)
   - **Location**: `src/commands/casts.ts`

### 5. **Cast Keyword Message Handler** (Auto-detect cast keywords in messages)
   - **Page 1**: Earliest cast matching keyword
   - **Page 2**: Most recent cast #1
   - **Page 3**: Most recent cast #2
   - **Condition**: Same as `/casts` command
   - **Location**: `src/handlers/castKeyword.ts`

### 6. **`/clanker` Command** (List all Clanker tokens for a user)
   - **Multiple Pages**: 8 tokens per page
   - **Condition**: Only if user has more than 8 Clanker deployments
   - **Location**: `src/commands/clanker.ts`

### 7. **Auto-Split Large Embeds** (Fallback pagination)
   - **Condition**: If any embed has more than 15 fields, it's automatically split
   - **Location**: `src/utils/pagination.ts` - `splitEmbedIntoPages()`
   - **Used in**: `/search` command for Clanker tokens, any embed that exceeds field limit

---

## 🎯 **SINGLE-PAGE RESPONSES** (No Pagination)

### 1. **Wallet Profile Lookup** (Pasting wallet address)
   - **Single Card**: Shows Farcaster profile OR Zora profile (whichever matches)
   - **Condition**: Always single page, no pagination
   - **Location**: `src/utils/walletEmbed.ts`

### 2. **Zora Profile Lookup** (Pasting Zora profile link)
   - **Single Card**: Profile info, wallets, creator coin, latest coin, socials
   - **Condition**: Always single page
   - **Location**: `src/handlers/zoraProfile.ts`

### 3. **Pump.fun Token Lookup** (Pasting Pump.fun token address)
   - **Single Card**: Token metrics, contract, creator, trading links
   - **Condition**: Always single page
   - **Location**: `src/utils/pumpFunEmbeds.ts`

### 4. **Base Token Lookup** (Pasting Base token address - NEW)
   - **Single Card**: Token metrics, factory info, trading links
   - **Condition**: Always single page
   - **Location**: `src/utils/baseTokenEmbeds.ts`

### 5. **X Account Lookup** (Pasting X/Twitter link)
   - **Single Card**: Farcaster profile (if linked) OR Zora profile (if linked)
   - **Condition**: Always single page
   - **Location**: `src/handlers/xAccount.ts`

### 6. **Base Post Lookup** (Pasting Base.app post link)
   - **Single Card**: Zora coin info extracted from post
   - **Condition**: Always single page
   - **Location**: `src/handlers/basePost.ts`

### 7. **Cast Link Lookup** (Pasting Warpcast/Farcaster cast link)
   - **Single Card**: Cast details, author info
   - **Condition**: Always single page
   - **Location**: `src/handlers/castLink.ts`

### 8. **`/help` Command**
   - **Single Card**: Help information
   - **Condition**: Always single page
   - **Location**: `src/commands/help.ts`

---

## 📊 **Summary Table**

| Response Type | Pages | Pagination? | Condition for Multi-Page |
|--------------|-------|------------|-------------------------|
| Farcaster Profile | 1-2 | ✅ Yes | Page 2 if Clankers/Zora exist |
| Zora Coin | 1-2 | ✅ Yes | Page 2 if creator has Farcaster |
| Clanker Token | 1-3 | ✅ Yes | Pages 2-3 if deployer has Farcaster/Zora |
| `/casts` Command | 1-3 | ✅ Yes | Up to 3 casts (earliest + 2 recent) |
| Cast Keyword | 1-3 | ✅ Yes | Up to 3 casts (earliest + 2 recent) |
| `/clanker` Command | 1+ | ✅ Yes | 8 tokens per page |
| Wallet Profile | 1 | ❌ No | Always single |
| Zora Profile | 1 | ❌ No | Always single |
| Pump.fun Token | 1 | ❌ No | Always single |
| Base Token | 1 | ❌ No | Always single |
| X Account | 1 | ❌ No | Always single |
| Base Post | 1 | ❌ No | Always single |
| Cast Link | 1 | ❌ No | Always single |
| `/help` | 1 | ❌ No | Always single |

---

## 🔧 **Technical Details**

### Pagination Thresholds:
- **Field Limit**: 15 fields per page (Discord max is 25, but we use 15 for readability)
- **Clanker Tokens**: 8 tokens per page (to avoid field value length limits)
- **Casts**: Up to 3 pages (earliest + 2 most recent)

### When Auto-Split Happens:
- Any embed with **> 15 fields** is automatically split
- Used as fallback in `/search` command for Clanker token lookups
- Ensures embeds never exceed Discord's limits

### Pagination Button Behavior:
- **"◀ Previous"** button: Disabled on first page
- **"Next ▶"** button: Disabled on last page
- Buttons only appear if `totalPages > 1`

---

## 💡 **Key Rules**

1. **Multi-page when**: Information is logically separated (e.g., token info vs creator profile)
2. **Single-page when**: All information fits naturally in one card
3. **Auto-split when**: Embed exceeds 15 fields (safety measure)
4. **Pagination buttons**: Only shown when `totalPages > 1`



