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
  // Explicitly allow https://infobot.fun as required by Lovable
  app.use(cors({
    origin: "https://infobot.fun", // Explicitly set to infobot.fun
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    exposedHeaders: ["Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  }));
  
  // Also add manual CORS headers as fallback for /api/siwf/miniapp-connect
  app.use((req, res, next) => {
    // For miniapp-connect endpoint, explicitly set CORS headers
    if (req.path === "/api/siwf/miniapp-connect" || req.path.endsWith("/miniapp-connect")) {
      res.header("Access-Control-Allow-Origin", "https://infobot.fun");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
      
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

