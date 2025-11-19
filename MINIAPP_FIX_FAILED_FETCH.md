# Fix: "Failed to fetch" Error in Mini App

## The Problem

You're seeing:
- "Failed to fetch" error
- "authentication failed" message
- Connection not working

## Common Causes

### 1. CORS Issue (Most Likely)

The Mini App at `https://infobot.fun` is trying to call the backend at `https://infobot-production-f74e.up.railway.app`, but CORS might be blocking it.

**Fix Applied:** I've updated the backend to allow CORS from:
- `https://infobot.fun`
- `https://farcaster.xyz`
- `https://warpcast.com`

### 2. Backend Not Accessible

The backend might not be reachable from the Mini App.

**Check:**
- Visit: `https://infobot-production-f74e.up.railway.app/healthz`
- Should return: `{"status":"ok","uptime":...}`

### 3. Request Format Issue

The Mini App might be sending data in the wrong format.

**Expected Format:**
```json
{
  "userId": "327936936461336576",
  "platform": "discord",
  "fid": 123,
  "username": "alice",
  "custodyAddress": "0x...",
  "verifiedAddresses": ["0x..."]
}
```

## Debugging Steps

### Step 1: Check Backend is Running

Visit in browser:
```
https://infobot-production-f74e.up.railway.app/healthz
```

Should return: `{"status":"ok"}`

### Step 2: Test Backend Endpoint Directly

Use browser console or Postman:
```javascript
fetch('https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'test123',
    platform: 'discord',
    fid: 123,
    username: 'test',
    custodyAddress: '0x123',
    verifiedAddresses: []
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**Expected:** Should return `{ success: true }`

### Step 3: Check Railway Logs

Look for:
- `[Mini App Connect] Received request:`
- Any error messages
- CORS errors

### Step 4: Check Mini App Console

In the Mini App (browser console):
- Look for the exact error message
- Check the network tab for the failed request
- See what URL it's trying to call
- Check the request/response details

## Common Issues & Fixes

### Issue: CORS Error
**Error:** `Access to fetch at '...' from origin '...' has been blocked by CORS policy`

**Fix:** Backend CORS is now configured. If still failing:
1. Check Railway logs for CORS errors
2. Verify `infobot.fun` is in the allowed origins
3. Make sure backend is using the updated CORS config

### Issue: Network Error
**Error:** `Failed to fetch` or `Network request failed`

**Possible Causes:**
1. Backend is down - Check Railway status
2. Wrong backend URL - Verify it's `https://infobot-production-f74e.up.railway.app`
3. SSL certificate issue - Check if backend URL is accessible

### Issue: Authentication Failed
**Error:** "authentication failed"

**Possible Causes:**
1. Farcaster SDK not returning data correctly
2. Data format mismatch
3. Missing required fields

**Check:**
- What does `sdk.actions.signIn()` return?
- Is it in the format: `{ fid, username, custodyAddress, verifiedAddresses }`?
- Or is it different?

## What to Check in Lovable

Ask Lovable or check:
1. **What does `sdk.actions.signIn()` return?**
   - Is it `{ fid, username, custodyAddress }`?
   - Or `{ user: { fid, username, ... } }`?
   - Or something else?

2. **What's the exact error in browser console?**
   - Copy the full error message
   - Check the network tab for the failed request

3. **Is the backend URL correct?**
   - Should be: `https://infobot-production-f74e.up.railway.app`
   - Not: `http://...` or wrong domain

## Quick Fix: Update Backend URL in Mini App

Make sure Lovable is using the correct backend URL:
```javascript
const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';
```

## Testing the Fix

After the CORS update is deployed:

1. **Clear browser cache** (or use incognito)
2. **Open Mini App in Warpcast** (not regular browser)
3. **Try connecting again**
4. **Check browser console** for any errors
5. **Check Railway logs** for the request

## If Still Failing

Share:
1. **Exact error message** from browser console
2. **Network tab details** (what URL, what response)
3. **Railway logs** (what the backend received)
4. **What `sdk.actions.signIn()` returns** (from Lovable)

This will help identify the exact issue!

