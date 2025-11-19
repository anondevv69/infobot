import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config";
import { ensureSchema } from "./db";
import { logger } from "./utils/logger";
import { subscriptionRouter } from "./routes/subscriptions";
import { webhookRouter } from "./routes/webhooks";
import { siwfRouter } from "./routes/siwf";
import { walletRouter } from "./routes/wallet";
import { debugRouter } from "./routes/debug";
import { tradingRouter } from "./routes/trading";
import { discordRouter } from "./routes/discord";

async function bootstrap(): Promise<void> {
  try {
    await ensureSchema();
  } catch (error) {
    logger.warn("Database schema check failed (this is OK if DATABASE_URL is not set):", error);
    // Continue anyway - database is optional for some features
  }

  const app = express();
  
  // CORS configuration - EXACTLY as Lovable requested
  // Allow requests from Mini App, Farcaster domains, and Lovable
  const allowedOrigins = [
    'https://infobot.fun',           // Your mini-app
    'https://warpcast.com',           // Farcaster frames
    'https://client.farcaster.xyz',    // Farcaster client
    'https://snapchain.farcaster.xyz', // Snapchain preview
    'https://farcaster.xyz',          // Farcaster main
    'https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com', // Lovable project
    'https://infobot-production-f74e.up.railway.app', // Backend URL (optional, for testing)
    'http://localhost:3000',          // Local development
    'http://localhost:5173',         // Local development
  ];
  
  // Also allow any Lovable project subdomain
  const lovablePattern = /^https:\/\/[a-f0-9-]+\.lovableproject\.com$/;
  
  // Main CORS middleware - exactly as Lovable specified
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else if (lovablePattern.test(origin)) {
        // Allow any Lovable project subdomain
        logger.info(`[CORS] Allowing Lovable domain: ${origin}`);
        callback(null, true);
      } else {
        // Also allow any Farcaster domain for safety
        if (origin.includes('farcaster.xyz') || origin.includes('warpcast.com')) {
          logger.info(`[CORS] Allowing Farcaster domain: ${origin}`);
          callback(null, true);
        } else {
          logger.warn(`[CORS] Blocked origin: ${origin}`);
          // For debugging, allow anyway - can restrict in production
          callback(null, true);
        }
      }
    },
    credentials: true, // REQUIRED as per Lovable (must be true when using specific origins)
    methods: ['GET', 'POST', 'OPTIONS'], // Exactly as Lovable specified
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Type'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  }));
  
  // Log all incoming requests for debugging
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (req.path.startsWith("/api/")) {
      logger.info(`[CORS] ${req.method} ${req.path} - Origin: ${origin || "none"}`);
    }
    next();
  });
  
  // Handle OPTIONS preflight for all routes
  // Note: This is a catch-all, but route-specific handlers will take precedence
  app.options("*", cors());
  
  // Manual CORS headers as fallback for all /api/siwf/* endpoints
  // This ensures CORS headers are ALWAYS set, even if the main CORS middleware misses something
  app.use((req, res, next) => {
    // For SIWF endpoints, always set CORS headers
    if (req.path.startsWith("/api/siwf/")) {
      const origin = req.headers.origin;
      
      // Check if origin is allowed (must be exact match when credentials: true)
      if (origin) {
        // Check if origin is in allowed list or matches pattern
        const isAllowed = allowedOrigins.indexOf(origin) !== -1 ||
                         lovablePattern.test(origin) ||
                         origin.includes('farcaster.xyz') ||
                         origin.includes('warpcast.com');
        
        if (isAllowed) {
          // Use exact origin (REQUIRED when credentials: true)
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Access-Control-Allow-Credentials", "true");
          logger.info(`[CORS] Setting exact origin header: ${origin}`);
        } else {
          // For debugging, still allow but log warning
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Access-Control-Allow-Credentials", "true");
          logger.warn(`[CORS] Unknown origin, allowing anyway: ${origin}`);
        }
      } else {
        // No origin header (e.g., Postman, curl) - don't set CORS headers
        // This is fine for non-browser requests
        logger.info(`[CORS] No origin header for ${req.method} ${req.path}`);
      }
      
      // Set other CORS headers
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
  
  app.use(express.json({ limit: "1mb" }));
  
  // Serve static files (wallet connection page)
  // Use path relative to backend directory (works in both dev and production)
  app.use(express.static(path.join(__dirname, "../wallet-connect")));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api/subscriptions", subscriptionRouter);
  app.use("/webhooks", webhookRouter);
  app.use("/api/siwf", siwfRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/discord", discordRouter);
  app.use("/api/trading", tradingRouter);
  app.use("/debug", debugRouter);
  // Alias for easier access (as mentioned in ChatGPT response)
  app.use("/api/siwf/debug", debugRouter);
  
  // Log registered routes on startup
  logger.info("=".repeat(60));
  logger.info("[BACKEND STARTUP] Registered Routes:");
  logger.info("[BACKEND STARTUP] - POST /api/siwf/miniapp-connect");
  logger.info("[BACKEND STARTUP] - OPTIONS /api/siwf/miniapp-connect");
  logger.info("[BACKEND STARTUP] - GET /debug/cors-test");
  logger.info("[BACKEND STARTUP] - OPTIONS /debug/miniapp-connect-test");
  logger.info("[BACKEND STARTUP] - POST /debug/miniapp-connect-test");
  logger.info("=".repeat(60));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start backend", error);
  process.exit(1);
});

