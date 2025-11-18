import { Router } from "express";
import { env } from "../config";
import { logger } from "../utils/logger";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import { verifyMessage } from "ethers";

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
  // For trading - signer information
  signerPrivateKey?: string; // Delegated signer private key for transactions
  signerPublicKey?: string;
  signerFid?: number;
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
    // Get challenge, userId, platform, and signed message from query params
    // Warpcast should send: challenge, message (signed), fid, custodyAddress
    const { challenge, userId, platform, message, signature, fid, custodyAddress } = req.query;

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

    // SECURITY: Verify signature if provided
    // If Warpcast sends a signed message, verify it cryptographically
    if (signature && message && custodyAddress) {
      try {
        // Verify the signature matches the custody address
        const recoveredAddress = verifyMessage(message as string, signature as string);
        const providedAddress = (custodyAddress as string).toLowerCase();
        
        if (recoveredAddress.toLowerCase() !== providedAddress) {
          logger.warn(`Signature verification failed: ${recoveredAddress} !== ${providedAddress}`);
          return res.status(400).send(`
            <!DOCTYPE html>
            <html>
              <head><title>Verification Failed</title></head>
              <body>
                <h1>❌ Verification Failed</h1>
                <p>Signature verification failed. Please try connecting again.</p>
              </body>
            </html>
          `);
        }

        // Signature is valid - look up user by custody address
        const response = await neynarClient.lookupUserByCustodyAddress({
          custodyAddress: providedAddress,
        });

        if (!response || !response.user || (fid && response.user.fid !== parseInt(fid as string, 10))) {
          return res.status(404).send(`
            <!DOCTYPE html>
            <html>
              <head><title>User Not Found</title></head>
              <body>
                <h1>❌ User Not Found</h1>
                <p>Farcaster user not found for this custody address.</p>
              </body>
            </html>
          `);
        }

        const user = response.user;

        // Store the verified connection
        const key = `${verificationPlatform}:${verificationUserId}`;
        verifiedConnections.set(key, {
          fid: user.fid,
          username: user.username || "",
          custodyAddress: user.custody_address || providedAddress,
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
                <p>Your Farcaster account is now securely linked to your ${verificationPlatform === "discord" ? "Discord" : "Telegram"} account.</p>
                
                <div class="username">@${user.username || "N/A"}</div>
                
                <div class="info">
                  <strong>Farcaster ID:</strong> ${user.fid}<br>
                  <strong>Username:</strong> @${user.username || "N/A"}<br>
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
        logger.error("Failed to verify signature or lookup user:", error);
        // Fall through to show instructions
      }
    }

    // If no signature provided (Warpcast doesn't send it automatically),
    // show instructions for user to complete connection
    // This is a fallback for when Warpcast doesn't send signed messages
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

// Store signers (userId -> encrypted signer info)
// In production, use database
const signers = new Map<string, {
  encryptedSigner: string;
  signerAddress: string;
  signerPublicKey: string;
  platform: "discord" | "telegram";
  createdAt: number;
}>();

// Endpoint to store signer
router.post("/signer", async (req, res) => {
  try {
    const { userId, platform, encryptedSigner, signerAddress, signerPublicKey } = req.body;

    if (!userId || !platform || !encryptedSigner || !signerAddress) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const key = `${platform}:${userId}`;
    signers.set(key, {
      encryptedSigner,
      signerAddress,
      signerPublicKey: signerPublicKey || "",
      platform,
      createdAt: Date.now(),
    });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error("Failed to store signer:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to get signer (returns address only, not private key)
router.get("/signer", async (req, res) => {
  try {
    const { userId, platform } = req.query;

    if (!userId || !platform) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const key = `${platform}:${userId}`;
    const signer = signers.get(key);

    if (!signer) {
      return res.status(404).json({ error: "Signer not found" });
    }

    // Return address and public key only (not the encrypted private key)
    return res.json({
      signerAddress: signer.signerAddress,
      signerPublicKey: signer.signerPublicKey,
      createdAt: signer.createdAt,
    });
  } catch (error: any) {
    logger.error("Failed to get signer:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to get encrypted signer (for transaction signing - backend only)
export function getEncryptedSigner(userId: string, platform: "discord" | "telegram"): string | null {
  const key = `${platform}:${userId}`;
  const signer = signers.get(key);
  return signer ? signer.encryptedSigner : null;
}

// Endpoint to delete signer
router.delete("/signer", async (req, res) => {
  try {
    const { userId, platform } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const key = `${platform}:${userId}`;
    signers.delete(key);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error("Failed to delete signer:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const siwfRouter = router;
