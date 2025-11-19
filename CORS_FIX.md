# CORS Fix for Mini App

## Issue

"Failed to fetch" error when Mini App tries to connect to backend.

## Root Cause

CORS (Cross-Origin Resource Sharing) is blocking requests from `https://infobot.fun` to `https://infobot-production-f74e.up.railway.app`.

## Fix Applied

### 1. Updated CORS Configuration

Backend now allows requests from:
- ✅ `https://infobot.fun` (your Mini App)
- ✅ `https://farcaster.xyz`
- ✅ `https://warpcast.com`
- ✅ Local development URLs

### 2. Added OPTIONS Handler

Added explicit OPTIONS handler for CORS preflight requests:
```typescript
router.options("/miniapp-connect", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "https://infobot.fun");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});
```

### 3. Added Explicit CORS Headers

The POST endpoint now sets CORS headers explicitly:
```typescript
res.header("Access-Control-Allow-Origin", req.headers.origin || "https://infobot.fun");
res.header("Access-Control-Allow-Credentials", "true");
```

## Testing

### Step 1: Verify Backend is Accessible

Visit: `https://infobot-production-f74e.up.railway.app/healthz`

Should return: `{"status":"ok","uptime":...}`

### Step 2: Test CORS Preflight

In browser console (on infobot.fun):
```javascript
fetch('https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://infobot.fun'
  }
})
.then(r => console.log('CORS:', r.headers.get('Access-Control-Allow-Origin')))
.catch(console.error);
```

Should return CORS headers.

### Step 3: Test Actual Request

```javascript
fetch('https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': 'https://infobot.fun'
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

Should return: `{ success: true, ... }`

## If Still Failing

### Check Railway Logs

Look for:
- `[CORS] Blocked origin: ...` - If you see this, the origin isn't allowed
- `[Mini App Connect] Received request:` - If you see this, request reached backend
- Any error messages

### Check Browser Console

1. Open Mini App in browser
2. Open DevTools (F12)
3. Go to Network tab
4. Try connecting
5. Look for the failed request
6. Check:
   - Request URL
   - Request headers
   - Response headers
   - Error message

### Common Issues

**Issue: "No 'Access-Control-Allow-Origin' header"**
- Backend CORS not working
- Check Railway logs
- Verify CORS middleware is running

**Issue: "Network request failed"**
- Backend might be down
- Check Railway status
- Verify backend URL is correct

**Issue: "CORS policy blocked"**
- Origin not in allowed list
- Check the origin in the error message
- Add it to CORS config if needed

## Deployment

The CORS fix is deployed. Wait for Railway to restart the backend, then test again.

## Verification

After deployment, check Railway logs for:
```
[CORS] Blocked origin: ...
[Mini App Connect] Received request: ...
[Mini App Connect] ✅ Connection stored...
```

If you see the connection stored message, it's working! ✅

