# SIWF Fix & Trading Implementation Guide

## Current Status

### ✅ What's Working:
- SIWF URL generation (using `warpcast.com/~/signin`)
- Backend callback endpoint
- Connection storage (FID, custody address, username)
- Signature verification

### ❌ What's Missing for Trading:
- **Signer collection**: SIWF doesn't provide a signer for trading
- **Signer storage**: Need to store delegated signers securely
- **Trading execution**: Need to use signers to execute trades

## The Core Issue

**SIWF connects accounts but doesn't provide trading signers.**

SIWF (Sign In with Farcaster) is for **authentication** - it proves the user owns a Farcaster account. But for **trading**, you need a **signer** that can sign blockchain transactions.

## Solution Options

### Option 1: User Provides Delegated Signer (Recommended for Bots)

After SIWF connection, user provides a delegated signer:

```
1. User runs /connect → SIWF flow → Account connected
2. User runs /connect-signer <private_key> → Signer stored
3. Bot can now trade using the signer
```

**Pros:**
- Works with any wallet
- User controls the signer
- Can revoke anytime

**Cons:**
- User must provide private key (security concern)
- Requires additional step

### Option 2: Use Custody Address Directly (Requires User Approval Per Trade)

Don't store signers. Instead:
1. Generate transaction
2. Send to user for approval
3. User signs with their wallet
4. Bot submits signed transaction

**Pros:**
- More secure (no stored keys)
- User approves each trade

**Cons:**
- Requires user interaction for each trade
- Not fully automated

### Option 3: Farcaster Delegated Signers (If Available)

If Farcaster provides delegated signers in SIWF callback, use those.

**Current Status:** SIWF callback doesn't provide signers by default.

## Implementation Plan

### Phase 1: Fix SIWF URL Issue (Current Priority)

✅ **DONE**: Code uses `warpcast.com/~/signin`
⚠️ **TODO**: Ensure Railway is running latest code (clear cache, redeploy)

### Phase 2: Add Signer Collection

1. Add `/connect-signer` command
2. Encrypt and store signer private keys
3. Validate signer can sign transactions

### Phase 3: Update Trading Commands

1. Check if user has signer
2. Use signer to execute trades
3. Handle errors gracefully

## Code Changes Needed

### 1. Add Signer Collection Command

```typescript
// src/commands/connectSigner.ts
export async function handleConnectSignerCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // 1. Check if user is connected via SIWF
  // 2. Get signer private key from user
  // 3. Validate signer (test signature)
  // 4. Encrypt and store signer
  // 5. Confirm success
}
```

### 2. Update Trading Commands

```typescript
// src/commands/trade.ts
export async function handleBuyCommand(...) {
  // 1. Get user connection
  // 2. Check if signer exists
  // 3. If no signer, prompt user to run /connect-signer
  // 4. Use signer to execute trade
}
```

### 3. Encrypt Signer Storage

```typescript
import crypto from "crypto";

function encryptSigner(privateKey: string, encryptionKey: string): string {
  // Encrypt private key before storing
}

function decryptSigner(encryptedKey: string, encryptionKey: string): string {
  // Decrypt when needed for trading
}
```

## Security Best Practices

1. **Never log private keys**
2. **Encrypt at rest** (use environment variable for encryption key)
3. **Use different keys for dev/prod**
4. **Implement key rotation**
5. **Consider using HSM for production**

## Testing Checklist

- [ ] SIWF connection works (user can connect)
- [ ] Signer collection works (user can provide signer)
- [ ] Signer validation works (can sign test transaction)
- [ ] Trading works (can execute buy/sell/swap)
- [ ] Error handling works (no signer, invalid signer, etc.)

## Next Steps

1. **Fix Railway deployment** (clear cache, redeploy)
2. **Test SIWF flow** (ensure `warpcast.com` URLs work)
3. **Add signer collection** (implement `/connect-signer`)
4. **Update trading** (use signers for transactions)
5. **Add security** (encrypt signers)

## References

- [Farcaster SIWF Docs](https://docs.farcaster.xyz/developers/siwf/)
- [Farcaster Auth Kit](https://docs.farcaster.xyz/developers/siwf/authkit)
- [Snapchain Guides](https://snapchain.farcaster.xyz/guides/writing-messages)

