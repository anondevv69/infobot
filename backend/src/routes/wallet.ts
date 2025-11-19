import { Router } from "express";
import { env } from "../config";
import { logger } from "../utils/logger";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import { verifyMessage } from "ethers";

const router = Router();

// Only create Neynar client if API key is provided
let neynarClient: NeynarAPIClient | null = null;
if (env.NEYNAR_API_KEY) {
  const neynarConfig = new Configuration({
    apiKey: env.NEYNAR_API_KEY,
  });
  neynarClient = new NeynarAPIClient(neynarConfig);
} else {
  logger.warn("NEYNAR_API_KEY not set - Farcaster verification will be unavailable");
}

// Store pending verifications (challenge -> user info)
const pendingVerifications = new Map<string, {
  userId: string;
  platform: "discord" | "telegram";
  timestamp: number;
}>();

// Store verified connections (userId -> wallet info)
const verifiedConnections = new Map<string, {
  walletAddress: string;
  platform: "discord" | "telegram";
  fid?: number; // Farcaster ID (if wallet matches Farcaster custody address)
  username?: string; // Farcaster username
  verifiedAt: number;
}>();

// Endpoint to store pending verification (called from bot)
router.post("/pending", async (req, res) => {
  try {
    const { challenge, userId, platform } = req.body;

    if (!challenge || !userId || !platform) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    pendingVerifications.set(challenge, {
      userId,
      platform,
      timestamp: Date.now(),
    });

    // Clean up after 10 minutes
    setTimeout(() => {
      pendingVerifications.delete(challenge);
    }, 10 * 60 * 1000);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error("Failed to store pending verification:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to connect wallet (called from wallet connection page)
router.post("/connect", async (req, res) => {
  try {
    const { userId, platform, walletAddress, message, signature, challenge } = req.body;

    // Validate required fields
    if (!userId || !platform || !walletAddress || !message || !signature || !challenge) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify challenge exists and hasn't expired
    const pending = pendingVerifications.get(challenge);
    if (!pending || Date.now() - pending.timestamp > 10 * 60 * 1000) {
      return res.status(400).json({ error: "Challenge expired or not found. Please try connecting again." });
    }

    // Verify challenge matches user
    if (pending.userId !== userId || pending.platform !== platform) {
      return res.status(400).json({ error: "Challenge user mismatch. Please try connecting again." });
    }

    // SECURITY: Verify signature
    try {
      const recoveredAddress = verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        logger.warn(`[Wallet Connect] Signature verification failed: ${recoveredAddress} !== ${walletAddress}`);
        return res.status(400).json({ error: "Signature verification failed. Please try again." });
      }
      logger.info("[Wallet Connect] ✅ Signature verified successfully");
    } catch (verifyError: any) {
      logger.error("[Wallet Connect] Signature verification error:", verifyError);
      return res.status(400).json({ error: "Invalid signature format. Please try again." });
    }

    // OPTIONAL: Verify wallet matches Farcaster custody address (if Neynar is configured)
    let fid: number | undefined = undefined;
    let username: string | undefined = undefined;
    
    if (neynarClient) {
      try {
        const response = await neynarClient.lookupUserByCustodyAddress({
          custodyAddress: walletAddress.toLowerCase(),
        });

        if (response && response.user) {
          fid = response.user.fid;
          username = response.user.username;
          logger.info(`[Wallet Connect] ✅ Wallet matches Farcaster account: @${username} (FID: ${fid})`);
        } else {
          logger.info(`[Wallet Connect] Wallet ${walletAddress} is not a Farcaster custody address`);
        }
      } catch (neynarError: any) {
        logger.warn("[Wallet Connect] Could not verify Farcaster account (this is OK if wallet is not Farcaster):", neynarError.message);
        // Continue anyway - wallet doesn't have to be Farcaster
      }
    }

    // Store the verified connection
    const key = `${platform}:${userId}`;
    verifiedConnections.set(key, {
      walletAddress: walletAddress.toLowerCase(),
      platform,
      fid,
      username,
      verifiedAt: Date.now(),
    });

    // Clean up pending verification
    pendingVerifications.delete(challenge);

    logger.info(`[Wallet Connect] ✅ Connection stored for user ${userId} (Wallet: ${walletAddress}, Platform: ${platform})`);

    return res.json({
      success: true,
      message: "Successfully connected wallet",
      connection: {
        walletAddress: walletAddress.toLowerCase(),
        fid,
        username,
      },
    });
  } catch (error: any) {
    logger.error("[Wallet Connect] ❌ Error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error.message || "Unknown error",
    });
  }
});

// Get connection for a user
export function getWalletConnection(userId: string, platform: "discord" | "telegram") {
  const key = `${platform}:${userId}`;
  return verifiedConnections.get(key) || null;
}

// Endpoint to get connection (called from bot)
router.get("/connection", async (req, res) => {
  try {
    const { userId, platform } = req.query;

    if (!userId || !platform) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const connection = getWalletConnection(userId as string, platform as "discord" | "telegram");
    
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    return res.json(connection);
  } catch (error: any) {
    logger.error("Failed to get connection:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to disconnect wallet
router.delete("/connection", async (req, res) => {
  try {
    const { userId, platform } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const key = `${platform}:${userId}`;
    verifiedConnections.delete(key);

    logger.info(`[Wallet Connect] ✅ Disconnected wallet for user ${userId} (Platform: ${platform})`);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error("Failed to disconnect:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const walletRouter = router;

