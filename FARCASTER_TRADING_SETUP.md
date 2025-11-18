# Farcaster Wallet Trading Setup Guide

## Overview

This guide explains how to connect Farcaster wallets to Telegram/Discord bots for trading functionality.

## Current Implementation Status

✅ **SIWF Flow**: Implemented
- Generates SIWF URLs with proper `warpcast.com` endpoints
- Handles callbacks from Warpcast
- Verifies signatures and stores connections

⚠️ **Signer Management**: Needs Implementation
- Currently stores custody address and FID
- **Missing**: Delegated signer for trading transactions
- **Required**: Signer private key to perform trades on behalf of users

## The Problem

**SIWF alone is not enough for trading.**

SIWF (Sign In with Farcaster) connects the user's Farcaster account to your bot, but it doesn't provide a signer for trading transactions.

### What SIWF Provides:
- ✅ FID (Farcaster ID)
- ✅ Custody Address (user's wallet)
- ✅ Username
- ✅ Verified addresses

### What SIWF Does NOT Provide:
- ❌ Signer private key for transactions
- ❌ Delegated signing capability

## Solution: Delegated Signers

For trading, you need to create a **delegated signer** for each user. This allows your bot to sign transactions on behalf of the user.

### Option 1: Farcaster Delegated Signers (Recommended)

Farcaster supports delegated signers that can sign messages/casts on behalf of users. However, for **on-chain transactions** (trading), you need a different approach.

### Option 2: User-Provided Signer (Most Common)

The user must provide a signer that your bot can use for trading:

1. **User connects via SIWF** → Gets FID, custody address
2. **User creates/approves a delegated signer** → Provides signer private key
3. **Bot stores the signer** → Uses it for trading transactions

### Option 3: Snapchain App Keys

For Snapchain transactions, users can create "app keys" that allow your application to sign on their behalf.

## Implementation Steps

### Step 1: Update Connection Storage

Store signer information when user connects:

```typescript
interface UserConnection {
  fid: number;
  custodyAddress: string;
  username: string;
  // Trading signer
  signerPrivateKey?: string; // For signing transactions
  signerPublicKey?: string;
  signerFid?: number;
}
```

### Step 2: Add Signer Collection Flow

After SIWF connection, prompt user to provide a signer:

```
/connect → SIWF flow → User approves → 
/connect-signer → User provides signer key → 
Store signer → Ready for trading
```

### Step 3: Use Signer for Trading

When executing trades:

```typescript
import { Wallet } from "ethers";

// Get user's signer
const user = await getConnection(userId, platform);
if (!user.signerPrivateKey) {
  throw new Error("User has not provided a trading signer");
}

// Create wallet from signer
const signer = new Wallet(user.signerPrivateKey, provider);

// Execute trade
const tx = await signer.sendTransaction({
  to: swapContractAddress,
  data: swapCalldata,
  value: amount,
});
```

## Security Considerations

⚠️ **CRITICAL**: Storing private keys is a security risk!

### Best Practices:

1. **Encrypt signer keys** at rest
2. **Use environment-specific encryption** (different keys for dev/prod)
3. **Consider using a hardware security module (HSM)** for production
4. **Implement key rotation** policies
5. **Use delegated signers with limited permissions** when possible

### Alternative: User Signs Each Transaction

Instead of storing signers, you can:
1. Generate transaction data
2. Send to user for approval
3. User signs with their wallet
4. Bot submits the signed transaction

This is more secure but requires user interaction for each trade.

## Current Code Status

### ✅ What's Working:
- SIWF URL generation (`warpcast.com/~/signin`)
- Backend callback handling
- Connection storage
- Signature verification

### ⚠️ What Needs Work:
- Signer collection flow
- Signer storage (encrypted)
- Trading transaction signing
- Signer management UI/commands

## Next Steps

1. **Add signer collection command**: `/connect-signer <private_key>`
2. **Encrypt and store signers**: Use encryption for private keys
3. **Update trading commands**: Use stored signers for transactions
4. **Add signer management**: `/disconnect-signer`, `/view-signer-status`

## References

- [Farcaster SIWF Docs](https://docs.farcaster.xyz/developers/siwf/)
- [Farcaster Auth Kit](https://docs.farcaster.xyz/developers/siwf/authkit)
- [Snapchain Guides](https://snapchain.farcaster.xyz/guides/writing-messages)
- [Farcaster Reference](https://docs.farcaster.xyz/reference/)

