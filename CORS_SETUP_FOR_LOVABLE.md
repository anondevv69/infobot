# Backend CORS Setup and miniapp-connect Route

## Global CORS Configuration (`backend/src/index.ts`)

```typescript
// Allowed origins
const allowedOrigins = [
  'https://infobot.fun',
  'https://warpcast.com',
  'https://client.farcaster.xyz',
  'https://snapchain.farcaster.xyz',
  'https://farcaster.xyz',
  'https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com', // Lovable project
  'https://infobot-production-f74e.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

// Lovable pattern matcher
const lovablePattern = /^https:\/\/[a-f0-9-]+\.lovableproject\.com$/;

// Main CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (lovablePattern.test(origin)) {
      logger.info(`[CORS] Allowing Lovable domain: ${origin}`);
      callback(null, true);
    } else {
      if (origin.includes('farcaster.xyz') || origin.includes('warpcast.com')) {
        logger.info(`[CORS] Allowing Farcaster domain: ${origin}`);
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked origin: ${origin}`);
        // For debugging, allow anyway
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Type'],
  preflightContinue: false,
  optionsSuccessStatus: 200,
}));

// Catch-all OPTIONS handler
app.options("*", cors());

// Manual CORS headers middleware for /api/siwf/* endpoints
app.use((req, res, next) => {
  if (req.path.startsWith("/api/siwf/")) {
    const origin = req.headers.origin;
    
    if (origin) {
      const isAllowed = allowedOrigins.indexOf(origin) !== -1 ||
                       lovablePattern.test(origin) ||
                       origin.includes('farcaster.xyz') ||
                       origin.includes('warpcast.com');
      
      if (isAllowed) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
        logger.info(`[CORS] Setting exact origin header: ${origin}`);
      } else {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
        logger.warn(`[CORS] Unknown origin, allowing anyway: ${origin}`);
      }
    }
    
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With, x-api-key");
    
    logger.info(`[CORS] Setting headers for ${req.method} ${req.path} - Origin: ${origin || "none"}`);
    
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      logger.info(`[CORS] OPTIONS preflight for ${req.path} - returning 200`);
      return res.sendStatus(200);
    }
  }
  next();
});
```

## miniapp-connect Route (`backend/src/routes/siwf.ts`)

### Helper Function

```typescript
function setCORSHeaders(req: express.Request, res: express.Response): void {
  const origin = req.headers.origin;
  
  const allowedOrigins = [
    'https://infobot.fun',
    'https://warpcast.com',
    'https://client.farcaster.xyz',
    'https://snapchain.farcaster.xyz',
    'https://farcaster.xyz',
    'https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com',
  ];
  
  if (origin) {
    const isAllowed = allowedOrigins.includes(origin) || 
                     origin.includes('farcaster.xyz') || 
                     origin.includes('warpcast.com') ||
                     /^https:\/\/[a-f0-9-]+\.lovableproject\.com$/.test(origin);
    
    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      logger.info("[CORS] ✅ Allowed origin (exact match):", origin);
    } else {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      logger.warn("[CORS] ⚠️ Unknown origin, allowing anyway:", origin);
    }
  }
}
```

### OPTIONS Handler

```typescript
router.options("/miniapp-connect", (req, res) => {
  const origin = req.headers.origin;
  logger.info("[CORS] OPTIONS preflight request from:", origin || "none");
  
  setCORSHeaders(req, res);
  res.header("Access-Control-Max-Age", "86400"); // 24 hours
  
  logger.info("[CORS] OPTIONS response headers set for:", origin);
  res.sendStatus(200);
});
```

### POST Handler

```typescript
router.post("/miniapp-connect", async (req, res) => {
  // Set CORS headers FIRST - before any processing
  setCORSHeaders(req, res);
  
  try {
    logger.info("[Mini App Connect] POST request received");
    logger.info("[Mini App Connect] Origin:", req.headers.origin || "none");
    
    const { userId, platform, fid, username, custodyAddress, verifiedAddresses, signerPrivateKey, signerPublicKey } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }
    if (!platform) {
      return res.status(400).json({ error: "Missing required field: platform" });
    }
    if (!fid) {
      return res.status(400).json({ error: "Missing required field: fid" });
    }

    const key = `${platform}:${userId}`;
    
    verifiedConnections.set(key, {
      fid: typeof fid === 'string' ? parseInt(fid, 10) : fid,
      username: username || "",
      custodyAddress: custodyAddress || "",
      verifiedAddresses: Array.isArray(verifiedAddresses) ? verifiedAddresses : [],
      platform,
      signerPrivateKey,
      signerPublicKey,
    });

    logger.info(`[Mini App Connect] ✅ Connection stored for user ${userId} (FID: ${fid}, Platform: ${platform})`);

    return res.json({
      success: true,
      message: "Successfully connected to bot",
      connection: {
        fid: typeof fid === 'string' ? parseInt(fid, 10) : fid,
        username: username || "",
        custodyAddress: custodyAddress || "",
      },
    });
  } catch (error: any) {
    logger.error("[Mini App Connect] ❌ Error:", error);
    // CORS headers already set above
    return res.status(500).json({ 
      error: "Internal server error",
      message: error.message || "Unknown error",
    });
  }
});
```

## Route Registration Order

```typescript
app.use(express.json({ limit: "1mb" }));
app.use("/api/siwf", siwfRouter);
```

## Expected CORS Headers on Response

For origin `https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com`:

- `Access-Control-Allow-Origin: https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com` (exact match, not `*`)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Potential Issues

1. **Middleware Order**: The manual CORS middleware runs before routes, which should handle OPTIONS requests. However, the global `app.options("*", cors())` might interfere.

2. **Multiple CORS Layers**: There are 3 layers of CORS handling:
   - Global `cors()` middleware
   - Manual middleware for `/api/siwf/*`
   - Route-level `setCORSHeaders()` function
   
   This might cause conflicts.

3. **OPTIONS Handling**: The manual middleware returns early for OPTIONS requests, which might prevent the route-level OPTIONS handler from running.

## Debug Endpoints Available

- `GET /debug/cors-test` - Basic CORS test
- `OPTIONS /debug/miniapp-connect-test` - Test OPTIONS handler
- `POST /debug/miniapp-connect-test` - Test POST handler with CORS

