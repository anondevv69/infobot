# SIWF Integration Debug Information

## Problem
The bot is generating SIWF URLs with `farcaster.xyz` instead of `warpcast.com`, causing "Could not reach Farcaster. Check your connection." error.

**Example broken URL:**
```
https://farcaster.xyz/~/signin?challenge=d4483c623b80381ecb5c1ba94b653e730cc27aca9260d9bc3e92eefea07f3169&redirect_uri=https%3A%2F%2Finfobot-production-f74e.up.railway.app%2Fapi%2Fsiwf%2Fcallback%3Fchallenge%3Dd4483c623b80381ecb5c1ba94b653e730cc27aca9260d9bc3e92eefea07f3169%26userId%3D327936936461336576%26platform%3Ddiscord&ref=2ORGMS
```

## Expected URL Format
Should be:
```
https://warpcast.com/~/signin?challenge=...&redirect_uri=...&ref=2ORGMS
```

## Key Files

### 1. SIWF URL Generation (`src/services/siwf.ts`)
**Line 70-96:** `generateSIWFUrl()` function
```typescript
export function generateSIWFUrl(
  challenge: string,
  userId: string,
  platform: "discord" | "telegram",
  backendUrl: string,
  referralCode?: string,
): string {
  const callbackUrl = `${backendUrl}/api/siwf/callback?challenge=${challenge}&userId=${userId}&platform=${platform}`;
  
  // Generate Warpcast signin URL with challenge and callback
  const baseUrl = "https://warpcast.com/~/signin";  // <-- This should be correct
  const params = new URLSearchParams({
    challenge,
    redirect_uri: callbackUrl,
  });

  // Add referral code for new signups
  if (referralCode) {
    params.append("ref", referralCode);
  }

  return `${baseUrl}?${params.toString()}`;
}
```

### 2. Discord Connect Command (`src/commands/connect.ts`)
**Line 59-67:** Calls `generateSIWFUrl()`
```typescript
const challenge = generateSIWFChallenge(userId, "discord");
const siwfUrl = generateSIWFUrl(
  challenge.challenge,
  userId,
  "discord",
  env.backendUrl,
  env.farcasterReferralCode,
);
```

### 3. Telegram Connect Handler (`src/platforms/telegram/handlers/trading.ts`)
**Line 68-76:** Calls `generateSIWFUrl()`
```typescript
const challenge = generateSIWFChallenge(userId, "telegram");
const siwfUrl = generateSIWFUrl(
  challenge.challenge,
  userId,
  "telegram",
  env.backendUrl,
  env.farcasterReferralCode,
);
```

### 4. Backend Callback Handler (`backend/src/routes/siwf.ts`)
**Line 112-334:** Handles the callback from Warpcast
- Verifies challenge exists and hasn't expired
- Verifies signature if provided by Warpcast
- Looks up user by custody address via Neynar API
- Stores verified connection
- Shows success page

### 5. Configuration (`src/config.ts`)
**Line 27:** Backend URL
```typescript
backendUrl: process.env.BACKEND_URL || "https://infobot-production-f74e.up.railway.app",
```

## Possible Issues

1. **Deployment Issue**: The deployed code might be old and still using `farcaster.xyz`
2. **URL Redirect**: Warpcast might be redirecting `warpcast.com` to `farcaster.xyz`
3. **Cached Code**: The bot might be running cached/old code
4. **Environment Variable**: Something might be overriding the base URL

## Current Implementation Status

✅ **Security**: Direct username connection removed (prevents account hijacking)
✅ **Signature Verification**: Backend verifies signatures when provided by Warpcast
✅ **Challenge System**: Time-limited challenges prevent replay attacks
✅ **Backend Integration**: Backend handles callbacks and stores connections
❌ **URL Generation**: Appears to be generating wrong domain

## Testing Checklist

1. Verify deployed code matches local code (check Railway logs)
2. Test URL generation locally: `node -e "console.log(require('./src/services/siwf').generateSIWFUrl('test', '123', 'discord', 'https://test.com', '2ORGMS'))"`
3. Check if Warpcast redirects `farcaster.xyz` → `warpcast.com`
4. Verify environment variables in Railway
5. Check if there's any URL rewriting/redirecting happening

## Farcaster SIWF Documentation
- **SIWF Docs**: https://docs.farcaster.xyz/developers/siwf/
- **Protocol**: FIP-11 Sign In with Farcaster
- **Warpcast Signin**: Should use `warpcast.com/~/signin`

## Next Steps

1. Check Railway deployment logs to see what code is actually running
2. Verify the `generateSIWFUrl` function is being called correctly
3. Test if manually changing the URL to `warpcast.com` works
4. Check if there's any middleware or proxy rewriting URLs

