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
  // TEMPORARILY ALLOW ALL ORIGINS FOR DEBUGGING
  app.use(cors({
    origin: true, // Allow ALL origins temporarily to debug
    credentials: true, // REQUIRED for SIWF
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept", "Origin", "X-Requested-With"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  }));
  
  // Log all incoming requests for debugging
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    logger.info(`[CORS Debug] ${req.method} ${req.path} - Origin: ${origin || "none"}`);
    next();
  });
  
  // Handle OPTIONS preflight for all routes
  app.options("*", cors());
  
  // Manual CORS headers as fallback for all /api/siwf/* endpoints
  app.use((req, res, next) => {
    // For SIWF endpoints, always set CORS headers
    if (req.path.startsWith("/api/siwf/")) {
      const origin = req.headers.origin;
      
      // ALWAYS set CORS headers - allow any origin for debugging
      if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
      } else {
        // If no origin, allow all (for debugging)
        res.header("Access-Control-Allow-Origin", "*");
      }
      
      res.header("Access-Control-Allow-Credentials", "true");
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

