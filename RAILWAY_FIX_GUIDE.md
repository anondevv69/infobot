# Railway SIWF Fix Guide

## 🎯 Problem
Bot is generating SIWF URLs with `farcaster.xyz` instead of `warpcast.com`, causing "Could not reach Farcaster. Check your connection." error.

## ✅ Solution Checklist

### Step 1: Check Railway Deployments
1. Go to Railway → Your Project → **Deployments**
2. Find your latest commit hash: `030436f3` (SECURITY: Remove insecure direct username connection...)
3. **If the latest commit is NOT deployed:**
   - Click **"Deploy Latest"** or **"Redeploy"**
   - Wait for deployment to complete

### Step 2: Check Railway Logs
1. Go to Railway → Your Project → **Service** → **Logs**
2. Search for: `siwf`, `warpcast`, `farcaster.xyz`
3. **If logs show `farcaster.xyz`:**
   - Railway is running cached/old code
   - Proceed to Step 3

### Step 3: Check Environment Variables
1. Go to Railway → Your Project → **Variables**
2. **DELETE any of these if they exist:**
   - `FARCASTER_URL`
   - `FARCASTER_BASE_URL`
   - `SIWF_BASE_URL`
   - `NEXT_PUBLIC_FARCASTER_URL`
3. **Keep only these:**
   - `BACKEND_URL` → `https://infobot-production-f74e.up.railway.app`
   - `FARCASTER_REFERRAL_CODE` → `2ORGMS`
   - `NODE_ENV` → `production` (if set)

### Step 4: Restart the Bot Service
1. Go to Railway → Your Project → **Service** → **Settings**
2. Click **"Restart"** button
3. Wait for service to restart (check logs)

### Step 5: Clear Build Cache (if needed)
1. Go to Railway → Your Project → **Service** → **Settings**
2. Click **"Clear Cache & Redeploy"** (if available)
3. Or manually trigger a new deployment

## 🧪 Testing

### Test 1: Check Railway Logs (NEW - Easiest!)
After redeploying, check Railway logs. You should see:

**✅ CORRECT (what you want to see):**
```
[STARTUP] SIWF Configuration Check:
[STARTUP] Generated URL: https://farcaster.xyz/~/signin?...
[STARTUP] Contains farcaster.xyz: ✅ YES
[STARTUP] Contains warpcast.com: ✅ NO
[STARTUP] Status: ✅ CORRECT
```

**❌ INCORRECT (old code still running):**
```
[STARTUP] Contains farcaster.xyz: ❌ NO
[STARTUP] Contains warpcast.com: ❌ YES (WRONG!)
[STARTUP] Status: ❌ INCORRECT - Railway is running old code!
🚨 WARNING: SIWF URL generation is INCORRECT!
```

### Test 2: Use the Debug Command
1. In Discord, run: `/debug`
2. Check the output:
   - ✅ Should show `farcaster.xyz` in the URL
   - ❌ If it shows `warpcast.com`, deployment failed

### Test 3: Check Backend Debug Endpoint
Visit in browser (either URL works):
```
https://infobot-production-f74e.up.railway.app/debug/siwf
https://infobot-production-f74e.up.railway.app/api/siwf/debug
```

Expected response:
```json
{
  "status": "ok",
  "debug": {
    "generatedUrl": "https://farcaster.xyz/~/signin?...",
    "hasWrongUrl": false,
    "hasCorrectUrl": true
  },
  "health": {
    "urlGeneration": "✅ CORRECT"
  }
}
```

### Test 3: Test /connect Command
1. In Discord, run: `/connect`
2. Click the "Connect with Farcaster" button
3. **Should open:** `https://farcaster.xyz/~/signin?...`
4. **Should NOT open:** `https://warpcast.com/~/signin?...`

## 🔍 Debug Endpoints

### Backend Debug Endpoint
```
GET https://infobot-production-f74e.up.railway.app/debug/siwf
```

Shows:
- Generated URL
- Environment variables
- Deployment info (commit hash, service ID)
- Health status

### Backend Health Check
```
GET https://infobot-production-f74e.up.railway.app/debug/health
```

### Backend Healthz (existing)
```
GET https://infobot-production-f74e.up.railway.app/healthz
```

## 📊 What the Debug Command Shows

The `/debug` command in Discord will show:
- ✅ Generated URL (should contain `warpcast.com`)
- ✅ URL analysis (checks for old/new URLs)
- ✅ Configuration (backend URL, referral code)
- ✅ Backend status (commit hash, service ID)
- ✅ Recommendations (if issues detected)

## 🚨 Common Issues

### Issue 1: "Latest commit not deployed"
**Fix:** Manually trigger deployment in Railway

### Issue 2: "Old code still running"
**Fix:** Restart the service in Railway

### Issue 3: "Environment variable conflict"
**Fix:** Remove any `FARCASTER_URL` variables

### Issue 4: "Cached build"
**Fix:** Clear cache and redeploy

## ✅ Verification

After completing all steps:

1. ✅ Run `/debug` in Discord - should show ✅ CORRECT
2. ✅ Visit `/debug/siwf` endpoint - should show `farcaster.xyz`
3. ✅ Run `/connect` - button should open `farcaster.xyz`
4. ✅ Check Railway logs - should show `farcaster.xyz` (not `warpcast.com`)

## 📝 Notes

- The code is **correct** - it uses `farcaster.xyz` (line 86 in `src/services/siwf.ts`)
- The issue is **deployment-related** - Railway is running old code
- According to Farcaster's rebranding, `farcaster.xyz` is the canonical domain
- The debug endpoints help identify exactly what's running

## 🔗 Related Files

- `src/services/siwf.ts` - SIWF URL generation (line 70-96)
- `src/commands/connect.ts` - Discord connect command
- `src/commands/debug.ts` - Debug command
- `backend/src/routes/debug.ts` - Backend debug endpoint
- `backend/src/routes/siwf.ts` - SIWF callback handler

