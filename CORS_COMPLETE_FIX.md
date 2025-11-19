# Complete CORS Fix for Farcaster Mini App

## Problem

"Failed to fetch" error when Mini App tries to connect to backend. This is a CORS misconfiguration issue.

## Root Cause

The Mini App runs inside Farcaster/Warpcast and sends requests with these origins:
- `https://warpcast.com` (most common)
- `https://client.farcaster.xyz` (OnchainKit/AuthKit)
- `https://snapchain.farcaster.xyz` (Snapchain preview)
- `https://farcaster.xyz` (Farcaster main)

If ANY of these are missing from the CORS allowlist → Browser blocks the request → "Failed to fetch"

## Complete Fix Applied

### 1. Main CORS Middleware (`backend/src/index.ts`)

```typescript
const allowedOrigins = [
  "https://warpcast.com", // REQUIRED
  "https://snapchain.farcaster.xyz", // REQUIRED
  "https://client.farcaster.xyz", // REQUIRED
  "https://farcaster.xyz",
  "https://infobot.fun", // Your domain
  "https://infobot-production-f74e.up.railway.app", // Backend URL
  "http://localhost:3000", // Local dev
  "http://localhost:5173", // Local dev
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const isAllowed = 
      allowedOrigins.indexOf(origin) !== -1 ||
      origin.includes("farcaster.xyz") ||
      origin.includes("warpcast.com") ||
      origin.includes("snapchain.farcaster.xyz");
    
    callback(null, isAllowed || true); // Allow for debugging
  },
  credentials: true, // REQUIRED for SIWF
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept", "Origin", "X-Requested-With"],
}));

// Handle OPTIONS preflight for ALL routes
app.options("*", cors());
```

### 2. Manual CORS Headers (Fallback)

Added manual CORS headers for all `/api/siwf/*` endpoints:

```typescript
app.use((req, res, next) => {
  if (req.path.startsWith("/api/siwf/")) {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
  }
  next();
});
```

### 3. Endpoint-Level CORS Headers

Each SIWF endpoint (`/miniapp-connect`, `/callback`, etc.) sets CORS headers explicitly:

```typescript
router.post("/miniapp-connect", async (req, res) => {
  // Set CORS headers FIRST (before any response)
  const origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", origin || "https://infobot.fun");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With");
  
  // ... rest of handler
});
```

## Required Headers

Every response MUST include:

1. ✅ `Access-Control-Allow-Origin: <request-origin>` (or `*` for debugging)
2. ✅ `Access-Control-Allow-Credentials: true` (REQUIRED for SIWF)
3. ✅ `Access-Control-Allow-Methods: GET, POST, OPTIONS`
4. ✅ `Access-Control-Allow-Headers: Content-Type, Authorization`

## Testing

### Step 1: Check OPTIONS Preflight

```bash
curl -X OPTIONS \
  -H "Origin: https://warpcast.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect \
  -v
```

Should return:
```
Access-Control-Allow-Origin: https://warpcast.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: POST, OPTIONS, GET
Access-Control-Allow-Headers: Content-Type, Authorization, Accept, Origin, X-Requested-With
```

### Step 2: Test Actual Request

```bash
curl -X POST \
  -H "Origin: https://warpcast.com" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","platform":"discord","fid":123}' \
  https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect \
  -v
```

Should return:
```
Access-Control-Allow-Origin: https://warpcast.com
Access-Control-Allow-Credentials: true
```

### Step 3: Browser Test

1. Open Mini App in Farcaster/Warpcast
2. Open DevTools (F12)
3. Go to Network tab
4. Click "Connect Farcaster Account"
5. Look for:
   - ✅ OPTIONS request to `/api/siwf/miniapp-connect` (status 200)
   - ✅ POST request to `/api/siwf/miniapp-connect` (status 200)
   - ✅ Response headers include CORS headers

## Verification Checklist

- [x] `https://warpcast.com` in allowed origins
- [x] `https://snapchain.farcaster.xyz` in allowed origins
- [x] `https://client.farcaster.xyz` in allowed origins
- [x] `credentials: true` in CORS config
- [x] `app.options("*", cors())` added
- [x] Manual CORS headers for `/api/siwf/*` endpoints
- [x] Endpoint-level CORS headers set before response
- [x] OPTIONS handler for `/miniapp-connect`

## If Still Failing

1. **Check Railway Logs**
   - Look for `[CORS]` messages
   - Look for `[Mini App Connect]` messages
   - Check if requests are reaching the backend

2. **Check Browser Console**
   - Look for exact CORS error message
   - Check the `Origin` header in Network tab
   - Verify the request URL is correct

3. **Verify Deployment**
   - Check Railway deployment status
   - Verify latest commit is deployed
   - Restart Railway service if needed

4. **Test with curl**
   - Use the curl commands above
   - Verify CORS headers are present
   - Check if backend is accessible

## Production Notes

Currently allowing all origins for debugging. In production, you should:

1. Restrict to only known origins
2. Remove the fallback `callback(null, true)` in CORS config
3. Add rate limiting
4. Add request logging for security

## Deployment

The fix is deployed. Wait 2-3 minutes for Railway to restart, then test again.

