# Farcaster Authentication Methods

## Overview

We use **two different methods** to authenticate users with Farcaster, depending on the flow:

## Method 1: Farcaster Mini App SDK (Mini App Flow)

### What We Use:
- **Package**: `@farcaster/miniapp-sdk`
- **Function**: `sdk.actions.signIn()`
- **Where**: Mini App (`miniapp/src/main.ts`)

### How It Works:
```typescript
import { initMiniAppSDK } from '@farcaster/miniapp-sdk';

// Initialize SDK
sdk = await initMiniAppSDK();

// Sign in - this shows QR code on mobile or sign-in UI
user = await sdk.actions.signIn();
```

### What It Does:
1. **Shows QR code** (on mobile) or **sign-in UI** (on desktop)
2. **User scans QR code** or **signs in** with their Farcaster account
3. **Returns user data**:
   - `fid` (Farcaster ID)
   - `username`
   - `custodyAddress` (wallet address)
   - `verifiedAddresses`
   - Potentially `signerPrivateKey` / `signerPublicKey` (for trading)

### Advantages:
- ✅ Native Farcaster experience
- ✅ QR code support (mobile)
- ✅ Works inside Warpcast
- ✅ No redirect needed

### Disadvantages:
- ❌ Only works in Farcaster Mini App context
- ❌ Requires Mini App to be deployed
- ❌ CORS issues when calling backend

## Method 2: SIWF (Sign In With Farcaster) - Server-Side Flow

### What We Use:
- **Protocol**: SIWF (Sign In With Farcaster)
- **URL**: `https://warpcast.com/~/signin` or `https://farcaster.xyz/~/signin`
- **Where**: Server-side (`src/services/siwf.ts`)

### How It Works:
```typescript
// Generate challenge
const challenge = generateSIWFChallenge(userId, "discord");

// Generate SIWF URL
const siwfUrl = `https://warpcast.com/~/signin?` +
  `challenge=${challenge}&` +
  `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
  `ref=${referralCode}`;

// User clicks link → Opens Warpcast
// User signs in → Warpcast redirects to callback
// Backend verifies signature → Stores connection
```

### What It Does:
1. **Bot generates SIWF URL** with challenge and callback
2. **User clicks link** → Opens Warpcast/Farcaster
3. **User signs in** to their Farcaster account
4. **Warpcast redirects** to backend callback with:
   - `challenge` (verification token)
   - `message` (signed message)
   - `signature` (cryptographic signature)
   - `fid` (Farcaster ID)
   - `custodyAddress` (wallet address)
5. **Backend verifies signature** using `ethers.verifyMessage()`
6. **Backend looks up user** using Neynar API
7. **Backend stores connection**: `discord:userId` → `farcaster:fid`

### Advantages:
- ✅ **No CORS issues** (server-to-server)
- ✅ **More reliable** (no browser restrictions)
- ✅ **Secure** (cryptographic signature verification)
- ✅ **Works everywhere** (any browser)

### Disadvantages:
- ❌ User has to leave Discord/Telegram
- ❌ Manual redirect flow
- ❌ No QR code (unless Farcaster provides it)

## Verification: Neynar API

### What We Use:
- **Package**: `@neynar/nodejs-sdk`
- **Function**: `neynarClient.lookupUserByCustodyAddress()`
- **Where**: Backend (`backend/src/routes/siwf.ts`)

### How It Works:
```typescript
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

const neynarClient = new NeynarAPIClient({
  apiKey: env.NEYNAR_API_KEY
});

// Look up user by custody address
const response = await neynarClient.lookupUserByCustodyAddress({
  custodyAddress: providedAddress
});

// Get user info
const user = response.user;
// user.fid, user.username, user.verified_addresses, etc.
```

### What It Does:
1. **Verifies the user exists** on Farcaster
2. **Gets user profile** (username, FID, verified addresses)
3. **Confirms identity** (matches custody address)

## Current Flow Summary

### Default Flow (Server-Side SIWF):
1. User runs `/connect` in Discord/Telegram
2. Bot generates SIWF URL → `https://warpcast.com/~/signin?...`
3. User clicks → Opens Warpcast
4. User signs in → Warpcast redirects to backend
5. Backend verifies signature (using `ethers.verifyMessage()`)
6. Backend looks up user (using Neynar API)
7. Backend stores connection
8. User returns to Discord/Telegram

### Optional Flow (Mini App):
1. User runs `/connect` in Discord/Telegram
2. Bot sends Mini App URL
3. Mini App opens → Uses `sdk.actions.signIn()`
4. User signs in (QR code or UI)
5. Mini App gets user data
6. Mini App sends to backend (CORS needed)
7. Backend stores connection

## Security: Signature Verification

Both flows verify the user cryptographically:

```typescript
// Verify signature matches custody address
const recoveredAddress = verifyMessage(message, signature);
const providedAddress = custodyAddress.toLowerCase();

if (recoveredAddress.toLowerCase() !== providedAddress) {
  // Signature invalid - reject
}
```

This ensures:
- ✅ User owns the Farcaster account
- ✅ No account hijacking
- ✅ Secure connection

## Summary

| Method | Package/SDK | Where Used | CORS Needed? |
|--------|-------------|------------|--------------|
| **Mini App SDK** | `@farcaster/miniapp-sdk` | Mini App | ✅ Yes |
| **SIWF** | Direct URL redirect | Server-side | ❌ No |
| **Verification** | `@neynar/nodejs-sdk` | Backend | ❌ No |

## Recommendation

**Use Server-Side SIWF (default)** because:
- ✅ No CORS issues
- ✅ More reliable
- ✅ Secure (signature verification)
- ✅ Works everywhere

**Mini App SDK** is optional for better UX, but has CORS limitations.

