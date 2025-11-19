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
  // Allow Farcaster domains (warpcast.com, client.farcaster.xyz) and user's domain
  const allowedOrigins = [
    "https://infobot.fun", // User's Mini App domain
    "https://warpcast.com", // Farcaster/Warpcast origin
    "https://client.farcaster.xyz", // Farcaster client origin
    "https://farcaster.xyz", // Farcaster main domain
    "http://localhost:3000", // Local development
    "http://localhost:5173", // Local development
  ];
  
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list or is a Farcaster domain
      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.includes("farcaster.xyz") ||
        origin.includes("warpcast.com") ||
        origin.includes("snapchain.farcaster.xyz")
      ) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked origin: ${origin}`);
        // For now, allow all to debug - can restrict later
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept", "Origin", "X-Requested-With"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  }));
  
  // Also add manual CORS headers as fallback for /api/siwf/* endpoints
  app.use((req, res, next) => {
    // For SIWF endpoints, set CORS headers based on origin
    if (req.path.startsWith("/api/siwf/")) {
      const origin = req.headers.origin;
      
      // Allow if origin is in allowed list or is a Farcaster domain
      if (
        origin &&
        (allowedOrigins.includes(origin) ||
         origin.includes("farcaster.xyz") ||
         origin.includes("warpcast.com") ||
         origin.includes("snapchain.farcaster.xyz"))
      ) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With");
        res.header("Access-Control-Allow-Credentials", "true");
      } else if (origin) {
        // Fallback: allow the origin anyway (for debugging)
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type");
        res.header("Access-Control-Allow-Credentials", "true");
      }
      
      // Handle preflight
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

