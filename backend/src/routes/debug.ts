import { Router } from "express";
import { logger } from "../utils/logger";

const router = Router();

// Log SIWF URL on startup
(function logSIWFConfig() {
  try {
    const testChallenge = "startup-test";
    const testUserId = "startup-test";
    const testPlatform = "discord";
    const testBackendUrl = process.env.BACKEND_URL || "https://infobot-production-f74e.up.railway.app";
    const testReferralCode = process.env.FARCASTER_REFERRAL_CODE || "2ORGMS";

    const callbackUrl = `${testBackendUrl}/api/siwf/callback?challenge=${testChallenge}&userId=${testUserId}&platform=${testPlatform}`;
    const baseUrl = "https://farcaster.xyz/~/signin";
    const params = new URLSearchParams({
      challenge: testChallenge,
      redirect_uri: callbackUrl,
    });
    if (testReferralCode) {
      params.append("ref", testReferralCode);
    }
    const generatedUrl = `${baseUrl}?${params.toString()}`;

    const hasCorrectUrl = generatedUrl.includes("farcaster.xyz");
    const hasWrongUrl = generatedUrl.includes("warpcast.com");

    logger.info("=".repeat(60));
    logger.info("[BACKEND STARTUP] SIWF Configuration Check:");
    logger.info(`[BACKEND STARTUP] Base URL: ${baseUrl}`);
    logger.info(`[BACKEND STARTUP] Generated URL: ${generatedUrl.substring(0, 100)}...`);
    logger.info(`[BACKEND STARTUP] Contains farcaster.xyz: ${hasCorrectUrl ? "✅ YES" : "❌ NO"}`);
    logger.info(`[BACKEND STARTUP] Contains warpcast.com: ${hasWrongUrl ? "❌ YES (WRONG!)" : "✅ NO"}`);
    logger.info(`[BACKEND STARTUP] Status: ${hasCorrectUrl && !hasWrongUrl ? "✅ CORRECT" : "❌ INCORRECT"}`);
    
    if (!hasCorrectUrl || hasWrongUrl) {
      logger.error("[BACKEND STARTUP] 🚨 WARNING: SIWF URL generation is INCORRECT!");
      logger.error("[BACKEND STARTUP] 🚨 Railway is likely running old cached code!");
    }
    logger.info("=".repeat(60));
  } catch (error) {
    logger.error("[BACKEND STARTUP] Failed to test SIWF URL generation:", error);
  }
})();

// Debug endpoint to check SIWF URL generation
router.get("/siwf", async (req, res) => {
  try {
    const { challenge, userId, platform, backendUrl, referralCode } = req.query;

    // Simulate the URL generation logic from src/services/siwf.ts
    const testChallenge = challenge as string || "test-challenge-123";
    const testUserId = userId as string || "test-user-123";
    const testPlatform = (platform as "discord" | "telegram") || "discord";
    const testBackendUrl = backendUrl as string || process.env.BACKEND_URL || "https://infobot-production-f74e.up.railway.app";
    const testReferralCode = referralCode as string || process.env.FARCASTER_REFERRAL_CODE || "2ORGMS";

    // Replicate the exact logic from generateSIWFUrl
    const callbackUrl = `${testBackendUrl}/api/siwf/callback?challenge=${testChallenge}&userId=${testUserId}&platform=${testPlatform}`;
    const baseUrl = "https://farcaster.xyz/~/signin";
    const params = new URLSearchParams({
      challenge: testChallenge,
      redirect_uri: callbackUrl,
    });

    if (testReferralCode) {
      params.append("ref", testReferralCode);
    }

    const generatedUrl = `${baseUrl}?${params.toString()}`;

    // Check for any old farcaster.xyz references
    const hasCorrectUrl = generatedUrl.includes("farcaster.xyz");
    const hasWrongUrl = generatedUrl.includes("warpcast.com");

    return res.json({
      status: "ok",
      debug: {
        generatedUrl,
        baseUrl,
        hasWrongUrl,
        hasCorrectUrl,
        environment: {
          BACKEND_URL: process.env.BACKEND_URL,
          FARCASTER_REFERRAL_CODE: process.env.FARCASTER_REFERRAL_CODE,
          NODE_ENV: process.env.NODE_ENV,
        },
        testParams: {
          challenge: testChallenge,
          userId: testUserId,
          platform: testPlatform,
          backendUrl: testBackendUrl,
          referralCode: testReferralCode,
        },
        callbackUrl,
        timestamp: new Date().toISOString(),
        deployment: {
          commitHash: process.env.RAILWAY_GIT_COMMIT_SHA || "unknown",
          serviceId: process.env.RAILWAY_SERVICE_ID || "unknown",
        },
      },
      health: {
        urlGeneration: hasCorrectUrl && !hasWrongUrl ? "✅ CORRECT" : "❌ INCORRECT",
        recommendation: hasWrongUrl
          ? "❌ URL contains warpcast.com - should use farcaster.xyz - check Railway deployment"
          : hasCorrectUrl
            ? "✅ URL correctly uses farcaster.xyz"
            : "⚠️ URL format unexpected",
      },
    });
  } catch (error: any) {
    logger.error("Debug SIWF error:", error);
    return res.status(500).json({
      status: "error",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Test CORS endpoint
router.get("/cors-test", (req, res) => {
  const origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.json({
    success: true,
    message: "CORS is working!",
    origin: origin || "none",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "backend",
    environment: process.env.NODE_ENV || "unknown",
    deployment: {
      commitHash: process.env.RAILWAY_GIT_COMMIT_SHA || "unknown",
      serviceId: process.env.RAILWAY_SERVICE_ID || "unknown",
    },
  });
});

export const debugRouter = router;

