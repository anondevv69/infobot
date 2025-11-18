# Token vs Wallet Detection Order - Telegram & Discord

## Overview

Both platforms use the **exact same order** to determine if an Ethereum address is a token or wallet. This document shows the complete flow with code.

---

## TELEGRAM - Detection Order

**File:** `src/platforms/telegram/handlers/message.ts` (lines 62-390)

### Step-by-Step Process:

```typescript
// 1. Initialize flag to block Zora fallback
let tokenFound = false;
const normalizedAddress = address.toLowerCase();

// ============================================
// STEP 1: ZORA COINS (FIRST CHECK)
// ============================================
const reference = extractZoraContractReference(text);
if (isEthAddress(address) || reference) {
  let coin = await fetchZoraCoin(reference?.address || address, reference?.chainId);
  let summary = await findBestZoraSummary([normalizedAddress]);
  
  // Try to find coin from summary if not found directly
  if (!coin && summary) {
    if (summary.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
      coin = await fetchZoraCoin(summary.profile.creatorCoinAddress);
    }
    if (!coin && summary.createdCoins) {
      const matchingCoin = summary.createdCoins.find(c => c.address?.toLowerCase() === normalizedAddress);
      if (matchingCoin) coin = matchingCoin;
    }
    if (!coin && summary.latestCoin?.coin?.address?.toLowerCase() === normalizedAddress) {
      coin = summary.latestCoin.coin;
    }
  }
  
  if (coin) {
    tokenFound = true;  // ✅ TOKEN FOUND
    // Show Zora coin card
    return;  // EXIT - Don't check anything else
  }
}

// ============================================
// STEP 2: CLANKER TOKENS
// ============================================
const { fetchTokensByAddress } = await import("../../../services/clanker");
const tokens = await fetchTokensByAddress(address).catch(() => []);
const directClankerMatches = tokens.filter(
  (t) => t.contract_address?.toLowerCase() === normalizedAddress
);

if (directClankerMatches.length > 0) {
  tokenFound = true;  // ✅ TOKEN FOUND
  const clankerSent = await sendClankerTokenPages(bot, chatId, address);
  if (clankerSent) {
    return;  // EXIT - Don't check Base tokens
  }
}

// ============================================
// STEP 3: BASE TOKENS
// ============================================
const [baseTokenData, factory] = await Promise.all([
  fetchBaseTokenData(address),  // DexScreener API
  detectTokenFactory(address),
]);

if (baseTokenData) {
  tokenFound = true;  // ✅ TOKEN FOUND
  // Show Base token embed
  return;  // EXIT
}

// ============================================
// STEP 4: MULTI-CHAIN TOKENS (Mantle, BSC, etc.)
// ============================================
let multiChainTokenData;
try {
  multiChainTokenData = await fetchMultiChainTokenData(address);  // DexScreener API
} catch (err) {
  console.error(`[Telegram] Multi-chain fetch failed for ${address}:`, err);
  return;  // CRITICAL: Exit if fetch fails (don't show Zora profile)
}

if (multiChainTokenData) {
  tokenFound = true;  // ✅ TOKEN FOUND
  const chainIdLower = multiChainTokenData.chainId.toLowerCase();
  if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
    // Show multi-chain token embed
    return;  // EXIT
  }
}

// ============================================
// STEP 5: FARCASTER USER WITH WALLET
// ============================================
let user = null;
let zoraSummaryFromAddress = null;
try {
  user = await findUserByWallet(address);  // Neynar API
} catch (error) {
  // User not found, continue
}

zoraSummaryFromAddress = await findBestZoraSummary([address.toLowerCase()]);

if (user) {
  // Show wallet profile with Farcaster info
  return;  // EXIT
}

// ============================================
// STEP 6: BLOCK ZORA FALLBACK IF TOKEN FOUND
// ============================================
if (tokenFound) {
  return;  // CRITICAL: Don't show Zora profile if any token was found
}

// ============================================
// STEP 7: ZORA PROFILE FALLBACK (LAST RESORT)
// ============================================
if (zoraSummaryFromAddress) {
  const hasZoraCoinData =
    Boolean(zoraSummaryFromAddress.latestCoin?.coin) ||
    (zoraSummaryFromAddress.createdCoins ?? []).length > 0;

  if (!hasZoraCoinData) {
    // Show Zora wallet profile (no coin data, no tokens found)
    return;
  }
}
```

### Key Differences in Telegram:
- ✅ Uses `tokenFound` flag to block Zora fallback
- ✅ Direct Clanker match check before calling `sendClankerTokenPages`
- ✅ Multi-chain check returns early on error (prevents Zora fallback)
- ✅ Explicit guard: `if (tokenFound) return;` before Zora profile

---

## DISCORD - Detection Order

**File:** `src/handlers/clankerAddress.ts` (lines 44-619)

### Step-by-Step Process:

```typescript
const normalizedAddress = address.toLowerCase();

// ============================================
// STEP 1: ZORA COINS (FIRST CHECK)
// ============================================
const zoraReference = extractZoraContractReference(message.content);
if (isEthAddress(address) || zoraReference) {
  let coin = await fetchZoraCoin(address, zoraReference?.chainId);
  let summary = await findBestZoraSummary([normalizedAddress]);
  
  // Try to find coin from summary if not found directly
  if (!coin && summary) {
    if (summary.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
      coin = await fetchZoraCoin(summary.profile.creatorCoinAddress);
    }
    if (!coin && summary.createdCoins) {
      const matchingCoin = summary.createdCoins.find(c => c.address?.toLowerCase() === normalizedAddress);
      if (matchingCoin) coin = matchingCoin;
    }
    if (!coin && summary.latestCoin?.coin?.address?.toLowerCase() === normalizedAddress) {
      coin = summary.latestCoin.coin;
    }
  }
  
  if (coin) {
    // Show Zora coin card
    return true;  // EXIT - Don't check anything else
  }
}

// ============================================
// STEP 2: CLANKER TOKENS
// ============================================
const tokens = await fetchTokensByAddress(address);
const directClankerMatches = tokens.filter(
  (token) => token.contract_address?.toLowerCase() === normalizedAddress,
);

// Fetch user and Zora summary EARLY (for later use)
let user = await findUserByWallet(address).catch((error) => {
  console.warn("Failed Neynar wallet lookup, continuing:", error);
  return null;
});

const zoraSummaryFromAddress = await findBestZoraSummary([address]);

// Try to resolve user from Zora Farcaster handle
if (!user && zoraSummaryFromAddress?.profile?.farcasterHandle) {
  try {
    const handle = zoraSummaryFromAddress.profile.farcasterHandle.replace(/^@/, "");
    user = await findUserByUsername(handle);
  } catch (error) {
    console.warn("Failed to resolve user from Zora Farcaster handle:", error);
  }
}

if (directClankerMatches.length > 0) {
  // Show Clanker token pages
  return true;  // EXIT
}

// ============================================
// STEP 3: BASE TOKENS (ONLY IF NO CLANKER MATCHES)
// ============================================
if (directClankerMatches.length === 0) {
  if (isEthAddress(address)) {
    const [baseTokenData, factory] = await Promise.all([
      fetchBaseTokenData(address),  // DexScreener API
      detectTokenFactory(address),
    ]);

    if (baseTokenData) {
      // Show Base token embed
      return true;  // EXIT
    }

    // ============================================
    // STEP 4: MULTI-CHAIN TOKENS (Mantle, BSC, etc.)
    // ============================================
    const multiChainTokenData = await fetchMultiChainTokenData(address);  // DexScreener API
    if (multiChainTokenData) {
      if (multiChainTokenData.chainId.toLowerCase() !== "base" && multiChainTokenData.chainId !== "8453") {
        // Show multi-chain token embed
        return true;  // EXIT
      }
    }
  }
}

// ============================================
// STEP 5: FARCASTER USER WITH WALLET
// ============================================
if (user) {
  const identifiers = collectZoraIdentifiers(user, address);
  const [fidTokens, latestCast, zoraSummary] = await Promise.all([
    safeFetchTokensByFid(user.fid),
    safeFetchMostRecentCast(user.fid),
    findBestZoraSummary(identifiers),
  ]);

  const associatedSummary =
    zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

  // Show wallet profile with Farcaster info
  return true;  // EXIT
}

// ============================================
// STEP 6: ZORA PROFILE FALLBACK (LAST RESORT)
// ============================================
if (zoraSummaryFromAddress) {
  const hasZoraCoinData =
    Boolean(zoraSummaryFromAddress.latestCoin?.coin) ||
    (zoraSummaryFromAddress.createdCoins ?? []).length > 0;

  if (zoraReference && !hasZoraCoinData && directClankerMatches.length === 0) {
    return false;  // Let zoraAddress handler take over
  }

  // Show Zora wallet profile
  return true;  // EXIT
}

// ============================================
// STEP 7: FINAL FALLBACK
// ============================================
if (isEthAddress(address) || isSolAddress(address)) {
  if (zoraReference) {
    return false;
  }
  // Show "cannot connect" message
  return true;
}
```

### Key Differences in Discord:
- ✅ Fetches `user` and `zoraSummaryFromAddress` EARLY (before Clanker check completes)
- ✅ Base/multi-chain checks are inside `if (directClankerMatches.length === 0)` block
- ✅ No explicit `tokenFound` flag (relies on early returns)
- ✅ Zora fallback only shows if `directClankerMatches.length === 0`

---

## Summary: Detection Order (Both Platforms)

| Step | Check | If Found | Action |
|------|-------|----------|--------|
| **1** | Zora Coin | ✅ Token | Show coin card, **EXIT** |
| **2** | Clanker Token | ✅ Token | Show Clanker pages, **EXIT** |
| **3** | Base Token | ✅ Token | Show Base token embed, **EXIT** |
| **4** | Multi-chain Token | ✅ Token | Show multi-chain embed, **EXIT** |
| **5** | Farcaster User | ✅ Wallet | Show wallet profile, **EXIT** |
| **6** | Zora Profile | ⚠️ Fallback | Show Zora profile (only if no tokens found) |

---

## Critical Logic Differences

### Telegram:
```typescript
// Uses explicit flag
let tokenFound = false;

// Sets flag in each token check
if (coin) { tokenFound = true; return; }
if (directClankerMatches.length > 0) { tokenFound = true; return; }
if (baseTokenData) { tokenFound = true; return; }
if (multiChainTokenData) { tokenFound = true; return; }

// Blocks Zora fallback
if (tokenFound) {
  return;  // Don't show Zora profile
}
```

### Discord:
```typescript
// Uses implicit blocking via condition
if (directClankerMatches.length === 0) {
  // Only check Base/multi-chain if NO Clanker matches
  if (baseTokenData) { return true; }
  if (multiChainTokenData) { return true; }
}

// Zora fallback only if no Clanker matches
if (zoraSummaryFromAddress && directClankerMatches.length === 0) {
  // Show Zora profile
}
```

---

## API Calls Used

| Check | API | Function |
|-------|-----|----------|
| Zora Coin | Zora API | `fetchZoraCoin()`, `findBestZoraSummary()` |
| Clanker Token | Clanker API | `fetchTokensByAddress()` |
| Base Token | DexScreener | `fetchBaseTokenData()` |
| Multi-chain Token | DexScreener | `fetchMultiChainTokenData()` |
| Farcaster User | Neynar API | `findUserByWallet()` |
| Zora Profile | Zora API | `findBestZoraSummary()` |

---

## Example: Mantle Token Address

**Address:** `0x9E82eb4E6Cf4DDAd35C32941B2f90112cDB9b99c`

### Expected Flow:

1. ✅ **Zora Coin Check** → Not found
2. ✅ **Clanker Check** → Not found
3. ✅ **Base Token Check** → Not found (not on Base)
4. ✅ **Multi-chain Check** → **FOUND on Mantle (5000)**
5. ✅ **Show Mantle token** → **EXIT**
6. ❌ **Zora Profile** → **BLOCKED** (token was found)

### If Multi-chain Check Fails:

**Telegram:**
- Returns early on error → No Zora profile shown ✅

**Discord:**
- Continues to wallet/profile checks → May show Zora profile ⚠️

---

## Code Locations

- **Telegram:** `src/platforms/telegram/handlers/message.ts` (lines 62-390)
- **Discord:** `src/handlers/clankerAddress.ts` (lines 44-619)


