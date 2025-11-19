# Discord vs Telegram Handler Comparison

## Key Difference Found:

### Discord Flow (`src/handlers/clankerAddress.ts`):

```typescript
// 1. Zora coins FIRST (lines 57-106)
if (isEthAddress(address) || zoraReference) {
  let coin = await fetchZoraCoin(...);
  if (coin) {
    // Show coin, return true
  }
}

// 2. Fetch Clanker tokens (line 108)
const tokens = await fetchTokensByAddress(address);
const directClankerMatches = tokens.filter(
  (token) => token.contract_address?.toLowerCase() === normalizedAddress,
);

// 3. Fetch user and Zora summary EARLY (lines 113-118)
let user = await findUserByWallet(address).catch(...);
const zoraSummaryFromAddress = await findBestZoraSummary([address]);

// 4. Handle Clanker tokens (line 129)
if (directClankerMatches.length > 0) {
  // Build Clanker response, return true
}

// 5. Base tokens - ONLY if NO Clanker matches (line 283)
if (directClankerMatches.length === 0) {
  if (isEthAddress(address)) {
    // Check Base tokens
    const baseTokenData = await fetchBaseTokenData(address);
    if (baseTokenData) {
      // Show Base token, return true
    }

    // 6. Multi-chain tokens - INSIDE the same block (line 503)
    const multiChainTokenData = await fetchMultiChainTokenData(address);
    if (multiChainTokenData) {
      if (multiChainTokenData.chainId.toLowerCase() !== "base" && multiChainTokenData.chainId !== "8453") {
        // Show multi-chain token, return true
      }
    }
  }
}

// 7. Farcaster user (line 538)
if (user) {
  // Show wallet profile, return true
}

// 8. Zora profile fallback (line 564)
if (zoraSummaryFromAddress) {
  const hasZoraCoinData = ...;
  if (!hasZoraCoinData) {
    // Show Zora profile, return true
  }
}
```

### Telegram Flow (`src/platforms/telegram/handlers/message.ts`):

```typescript
// 1. Zora coins FIRST (lines 77-125) ✅ MATCHES
if (isEthAddress(address) || reference) {
  let coin = await fetchZoraCoin(...);
  if (coin) {
    // Show coin, return
  }
}

// 2. Clanker tokens (lines 127-137)
try {
  const clankerSent = await sendClankerTokenPages(bot, chatId, address);
  if (clankerSent) {
    return; // Found Clanker token
  }
} catch (error) {
  // Continue to other checks
}

// 3. Base tokens (lines 139-234)
const [baseTokenData, factory] = await Promise.all([
  fetchBaseTokenData(address),
  detectTokenFactory(address),
]);
if (baseTokenData) {
  // Show Base token, return
}

// 4. Multi-chain tokens (lines 236-285)
try {
  const multiChainTokenData = await fetchMultiChainTokenData(address);
  console.log(`[Telegram] Multi-chain token check for ${address}:`, ...);
  if (multiChainTokenData) {
    const chainIdLower = multiChainTokenData.chainId.toLowerCase();
    if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
      // Show multi-chain token, return
    }
  }
} catch (error) {
  console.error(`[Telegram] Error checking multi-chain tokens for ${address}:`, error);
  // Continue to other checks if multi-chain check fails
}

// 5. Fetch user and Zora summary (lines 287-298)
let user = null;
let zoraSummaryFromAddress = null;
try {
  user = await findUserByWallet(address);
} catch (error) {
  // User not found, continue
}
zoraSummaryFromAddress = await findBestZoraSummary([address.toLowerCase()]);

// 6. Farcaster user (lines 300-325)
if (user) {
  // Show wallet profile, return
}

// 7. Zora profile fallback (lines 327-370)
if (zoraSummaryFromAddress) {
  const hasZoraCoinData = ...;
  if (!hasZoraCoinData) {
    // Show Zora profile, return
  }
}
```

## Critical Differences:

1. **Discord checks Clanker matches BEFORE Base/Multi-chain**: Uses `directClankerMatches.length === 0` condition
2. **Telegram checks Clanker via function call**: `sendClankerTokenPages` might return false even if there are tokens
3. **Discord fetches user/Zora summary EARLY** (before Clanker check completes)
4. **Telegram fetches user/Zora summary LATE** (after all token checks)

## The Problem:

The multi-chain token check in Telegram is wrapped in a try-catch. If `fetchMultiChainTokenData` throws an error or returns null, it continues to the Zora profile check. The Zora profile check then shows a profile even though it should be a token.

## Solution:

We need to ensure the multi-chain token check happens BEFORE any Zora profile lookup, and we need to verify that `fetchMultiChainTokenData` is actually being called and returning the correct data for Mantle tokens.



