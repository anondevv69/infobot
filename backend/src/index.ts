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
  
  // CORS configuration - allow requests from Mini App and Farcaster domains
  app.use(cors({
    origin: [
      "https://infobot.fun",
      "https://farcaster.xyz",
      "https://warpcast.com",
      "http://localhost:5173", // For local development
      "http://localhost:3000", // For local development
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  }));
  
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

