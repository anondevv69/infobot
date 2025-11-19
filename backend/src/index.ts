import express from "express";
import cors from "cors";
import { env } from "./config";
import { ensureSchema } from "./db";
import { logger } from "./utils/logger";
import { subscriptionRouter } from "./routes/subscriptions";
import { webhookRouter } from "./routes/webhooks";
import { siwfRouter } from "./routes/siwf";
import { debugRouter } from "./routes/debug";
import { tradingRouter } from "./routes/trading";

async function bootstrap(): Promise<void> {
  await ensureSchema();

  const app = express();
  
  // CORS configuration - MUST be before other middleware
  // Allow all Farcaster domains and user's domain
  const allowedOrigins = [
    "https://warpcast.com", // Farcaster/Warpcast origin (REQUIRED)
    "https://snapchain.farcaster.xyz", // Snapchain preview (REQUIRED)
    "https://client.farcaster.xyz", // OnchainKit / AuthKit (REQUIRED)
    "https://farcaster.xyz", // Farcaster main domain
    "https://infobot.fun", // User's Mini App domain
    "https://infobot-production-f74e.up.railway.app", // Backend URL (optional, for testing)
    "http://localhost:3000", // Local development
    "http://localhost:5173", // Local development
  ];
  
  // Main CORS middleware - handles all CORS requests
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list or is a Farcaster domain
      const isAllowed = 
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.includes("farcaster.xyz") ||
        origin.includes("warpcast.com") ||
        origin.includes("snapchain.farcaster.xyz");
      
      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Unknown origin: ${origin} - allowing for debugging`);
        // Allow for now to debug - can restrict later in production
        callback(null, true);
      }
    },
    credentials: true, // REQUIRED for SIWF
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept", "Origin", "X-Requested-With"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  }));
  
  // Handle OPTIONS preflight for all routes
  app.options("*", cors());
  
  // Manual CORS headers as fallback for all /api/siwf/* endpoints
  app.use((req, res, next) => {
    // For SIWF endpoints, always set CORS headers
    if (req.path.startsWith("/api/siwf/")) {
      const origin = req.headers.origin;
      
      // Set CORS headers based on origin
      if (origin) {
        // Check if it's an allowed origin
        const isAllowed = 
          allowedOrigins.includes(origin) ||
          origin.includes("farcaster.xyz") ||
          origin.includes("warpcast.com") ||
          origin.includes("snapchain.farcaster.xyz");
        
        if (isAllowed) {
          res.header("Access-Control-Allow-Origin", origin);
        } else {
          // Fallback: allow the origin anyway (for debugging)
          res.header("Access-Control-Allow-Origin", origin);
        }
        
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With");
      }
      
      // Handle preflight requests
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
    }
    next();
  });
  
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api/subscriptions", subscriptionRouter);
  app.use("/webhooks", webhookRouter);
  app.use("/api/siwf", siwfRouter);
  app.use("/api/trading", tradingRouter);
  app.use("/debug", debugRouter);
  // Alias for easier access (as mentioned in ChatGPT response)
  app.use("/api/siwf/debug", debugRouter);

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

