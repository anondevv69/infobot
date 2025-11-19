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
  // Allow all origins for now to debug (can restrict later)
  app.use(cors({
    origin: true, // Allow all origins - will set specific origin in response
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept", "Origin", "X-Requested-With"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }));
  
  // Also add manual CORS headers as fallback
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, Accept, Origin, X-Requested-With");
    }
    
    // Handle preflight
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
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

