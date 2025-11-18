# SIWF URL Debug Guide

## Debug Endpoints

I've added several debug endpoints to help diagnose SIWF URL issues:

### 1. Test URL Formats
**GET** `https://infobot-production-f74e.up.railway.app/api/siwf/test-url`

Tests 4 different SIWF URL formats to see which one works:
- Format 1: `farcaster.xyz/~/signin`
- Format 2: `warpcast.com/~/signin`
- Format 3: `farcaster.xyz/~/siwf`
- Format 4: `warpcast.com/~/siwf`

**What to do:**
1. Visit the endpoint in your browser
2. Click each URL format
3. See which one works (or what error you get)
4. Report back which format works

### 2. Test Callback Endpoint
**GET** `https://infobot-production-f74e.up.railway.app/api/siwf/test-callback`

Checks if the callback endpoint is accessible.

### 3. Check Pending Verifications
**GET** `https://infobot-production-f74e.up.railway.app/api/siwf/pending`

Shows all pending verification challenges (for debugging).

### 4. Check Verified Connections
**GET** `https://infobot-production-f74e.up.railway.app/api/siwf/connections`

Shows all successfully verified connections.

## Common Errors & Solutions

### Error: "Could not reach Farcaster"
**Cause:** The SIWF URL format is wrong or Farcaster/Warpcast changed their endpoint.

**Solution:**
1. Visit `/api/siwf/test-url` to test different formats
2. Use the format that works
3. Or deploy Mini App (avoids this issue entirely)

### Error: "Verification Expired"
**Cause:** The challenge expired (took too long to sign in).

**Solution:**
1. Try connecting again immediately
2. Check if callback URL is accessible
3. Check Railway logs for timing issues

### Error: "Missing Parameters"
**Cause:** The callback didn't receive required parameters.

**Solution:**
1. Check callback URL is correct
2. Check if redirect_uri is properly encoded
3. Check Railway logs for what parameters were received

### Error: "Signature verification failed"
**Cause:** Warpcast sent a signature but it doesn't match the custody address.

**Solution:**
1. This is a security check - if it fails, the connection is rejected
2. User should try connecting again
3. Check if Warpcast is sending correct signature

### Error: Callback shows "No signature provided"
**Cause:** Warpcast didn't send a signed message in the callback.

**Solution:**
1. This is expected - Warpcast doesn't always send signatures
2. The callback will show fallback instructions
3. User needs to manually verify (or use Mini App which handles this better)

## Debugging Steps

### Step 1: Test URL Formats
```bash
# Visit in browser:
https://infobot-production-f74e.up.railway.app/api/siwf/test-url
```

Click each URL format and see which one works.

### Step 2: Check Callback
```bash
# Visit in browser:
https://infobot-production-f74e.up.railway.app/api/siwf/test-callback?challenge=test&userId=test&platform=discord
```

Should return success message.

### Step 3: Test Full Flow
1. Run `/connect` in Discord
2. Click the SIWF URL
3. Sign in to Farcaster
4. Check what happens:
   - Does it redirect to callback?
   - What error do you see?
   - Check Railway logs

### Step 4: Check Logs
Railway logs will show:
- What parameters were received in callback
- Any errors during verification
- Signature verification results

## What to Report

When reporting the issue, please include:

1. **What error message do you see?**
   - "Could not reach Farcaster"?
   - "Verification Expired"?
   - "Missing Parameters"?
   - Something else?

2. **What happens when you click the SIWF URL?**
   - Opens Warpcast?
   - Shows error page?
   - Redirects somewhere?
   - Nothing happens?

3. **What happens after signing in?**
   - Redirects to callback?
   - Shows error?
   - Stays on Warpcast?

4. **Check Railway logs:**
   - What do the logs show when callback is hit?
   - Any error messages?

5. **Test the debug endpoints:**
   - Which URL format works (from `/api/siwf/test-url`)?
   - Is callback accessible (from `/api/siwf/test-callback`)?

## Quick Fix: Use Mini App

If SIWF URLs keep failing, the best solution is to deploy the Mini App:
1. Deploy `miniapp/` folder to Railway/Vercel
2. Set `MINIAPP_URL` environment variable
3. Done - no more SIWF URL issues!

The Mini App uses Farcaster's native SDK which is more reliable than direct SIWF URLs.

