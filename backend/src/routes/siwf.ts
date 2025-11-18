import { Router } from "express";
import { env } from "../config";
import { logger } from "../utils/logger";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

const router = Router();

const neynarConfig = new Configuration({
  apiKey: env.NEYNAR_API_KEY,
});
const neynarClient = new NeynarAPIClient(neynarConfig);

// Store pending verifications (challenge -> user info)
// In production, use Redis or database
const pendingVerifications = new Map<string, {
  userId: string;
  platform: "discord" | "telegram";
  timestamp: number;
}>();

// Store verified connections (userId -> Farcaster info)
// In production, use database
const verifiedConnections = new Map<string, {
  fid: number;
  username: string;
  custodyAddress: string;
  verifiedAddresses: string[];
  platform: "discord" | "telegram";
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

// Get connection for a user
export function getConnection(userId: string, platform: "discord" | "telegram") {
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

    const connection = getConnection(userId as string, platform as "discord" | "telegram");
    
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    return res.json(connection);
  } catch (error: any) {
    logger.error("Failed to get connection:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to store connection (called from bot after verification)
router.post("/connection", async (req, res) => {
  try {
    const { userId, platform, fid, username, custodyAddress, verifiedAddresses } = req.body;

    if (!userId || !platform || !fid) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const key = `${platform}:${userId}`;
    verifiedConnections.set(key, {
      fid,
      username: username || "",
      custodyAddress: custodyAddress || "",
      verifiedAddresses: verifiedAddresses || [],
      platform,
    });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error("Failed to store connection:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// SIWF callback endpoint - receives redirect from Warpcast
router.get("/callback", async (req, res) => {
  try {
    // Get challenge, userId, and platform from query params (passed in redirect_uri)
    const { challenge, userId, platform, message, fid } = req.query;

    if (!challenge || !userId || !platform) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Missing Parameters</title></head>
          <body>
            <h1>❌ Missing Parameters</h1>
            <p>Missing required parameters. Please try connecting again from Discord/Telegram.</p>
          </body>
        </html>
      `);
    }

    const verificationChallenge = challenge as string;
    const verificationUserId = userId as string;
    const verificationPlatform = platform as "discord" | "telegram";

    // Verify the challenge exists and hasn't expired
    const pending = pendingVerifications.get(verificationChallenge);
    if (!pending || Date.now() - pending.timestamp > 10 * 60 * 1000) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Verification Expired</title></head>
          <body>
            <h1>❌ Verification Expired</h1>
            <p>The verification challenge has expired. Please try connecting again.</p>
          </body>
        </html>
      `);
    }

    // If FID is provided in callback (from Warpcast), use it
    if (fid) {
      try {
        const fidNum = parseInt(fid as string, 10);
        const user = await neynarClient.lookupUserByFid({ fid: fidNum });

        if (!user) {
          return res.status(404).send(`
            <!DOCTYPE html>
            <html>
              <head><title>User Not Found</title></head>
              <body>
                <h1>❌ User Not Found</h1>
                <p>Farcaster user not found.</p>
              </body>
            </html>
          `);
        }

        // Store the verified connection
        const key = `${verificationPlatform}:${verificationUserId}`;
        verifiedConnections.set(key, {
          fid: user.fid,
          username: user.username || "",
          custodyAddress: user.custody_address || "",
          verifiedAddresses: user.verified_addresses?.eth_addresses || [],
          platform: verificationPlatform,
        });

        // Clean up pending verification
        pendingVerifications.delete(verificationChallenge);

        // Show success page
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>✅ Connected to Farcaster</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  max-width: 600px;
                  margin: 50px auto;
                  padding: 20px;
                  text-align: center;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .card {
                  background: white;
                  color: #333;
                  padding: 40px;
                  border-radius: 20px;
                  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                h1 { color: #4CAF50; margin-top: 0; }
                .username { font-size: 24px; font-weight: bold; color: #667eea; margin: 20px 0; }
                .info { background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 15px 0; text-align: left; }
                .info strong { color: #667eea; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>✅ Successfully Connected!</h1>
                <p>Your Farcaster account is now linked to your ${verificationPlatform === "discord" ? "Discord" : "Telegram"} account.</p>
                
                <div class="username">@${user.username}</div>
                
                <div class="info">
                  <strong>Farcaster ID:</strong> ${user.fid}<br>
                  <strong>Username:</strong> @${user.username}<br>
                  <strong>Custody Wallet:</strong> ${user.custody_address?.slice(0, 10)}...${user.custody_address?.slice(-8)}
                </div>
                
                <p style="margin-top: 30px;">
                  <strong>You can now close this window and return to ${verificationPlatform === "discord" ? "Discord" : "Telegram"}.</strong><br>
                  Use trading commands like /buy, /sell, and /swap!
                </p>
              </div>
            </body>
          </html>
        `);
      } catch (error: any) {
        logger.error("Failed to lookup user by FID:", error);
        // Fall through to show instructions
      }
    }

    // No FID provided - show page asking user to complete connection
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Complete Farcaster Connection</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .card {
              background: white;
              color: #333;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { color: #667eea; margin-top: 0; }
            .step { background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 15px 0; text-align: left; }
            .step strong { color: #667eea; display: block; margin-bottom: 10px; }
            code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🔗 Complete Your Connection</h1>
            <p>You've signed in to Warpcast! Now complete the connection:</p>
            
            <div class="step">
              <strong>Step 1:</strong> Go back to ${verificationPlatform === "discord" ? "Discord" : "Telegram"}
            </div>
            
            <div class="step">
              <strong>Step 2:</strong> Run this command:<br>
              <code>/connect @yourfarcasterusername</code><br>
              <small>(Replace with your actual Farcaster username)</small>
            </div>
            
            <div class="step">
              <strong>Step 3:</strong> Your account will be linked and you can start trading!
            </div>
            
            <p style="margin-top: 30px; color: #666;">
              <small>💡 Don't know your username? Check your Warpcast profile!</small>
            </p>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    logger.error("SIWF callback error:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Server Error</title></head>
        <body>
          <h1>❌ Server Error</h1>
          <p>An error occurred processing your request.</p>
        </body>
      </html>
    `);
  }
});

export const siwfRouter = router;
export { getConnection };
