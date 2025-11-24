/**
 * Monitor @clanker Farcaster profile for Monad token deployments
 * Watches for replies/casts that mention "monad" and contain contract addresses
 */

import { findUserByUsername, fetchUserCasts } from "./neynar";
import { logger } from "../utils/logger";
import { isEthAddress, extractFirstAddress } from "../utils/address";
import { getContractCreation } from "./contractCreation";
import { findUserByWallet } from "./neynar";
import { fetchRecentMonadTokens, type ClankerToken } from "./clanker";

const MONAD_CLANKER_WEBHOOK_URL = "https://discord.com/api/webhooks/1442507386467123220/T550M8HX-RiCknLe9HgPs9mpjajTCjJPaKdP0d_ItQmZ5MZQug1T2Fdnb2Fsm5RSKAi_";
const CLANKER_USERNAME = "clanker";
const CHECK_INTERVAL_MS = 1 * 60 * 1000; // Check every 1 minute
const MONAD_CHAIN_ID = 5001;

interface MonadDeployment {
  contractAddress: string;
  deployerAddress: string | null;
  castHash: string;
  castUrl: string;
  timestamp: number;
  farcasterUser: {
    fid: number;
    username: string | null;
    displayName: string | null;
  } | null;
}

// Store seen cast hashes to avoid duplicates
const seenCasts = new Set<string>();
// Store seen contract addresses to avoid duplicate notifications
const seenContracts = new Set<string>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean up old seen cast hashes and contracts periodically
 */
function cleanupSeenCasts(): void {
  // For now, just clear if set gets too large (simple approach)
  if (seenCasts.size > 1000) {
    seenCasts.clear();
    logger.debug("[Monad Clanker Monitor] Cleared seen casts cache");
  }
  if (seenContracts.size > 1000) {
    seenContracts.clear();
    logger.debug("[Monad Clanker Monitor] Cleared seen contracts cache");
  }
}

/**
 * Extract contract address from cast text
 */
function extractContractFromCast(text: string): string | null {
  // Look for Ethereum addresses (0x followed by 40 hex chars)
  const address = extractFirstAddress(text);
  if (address && isEthAddress(address)) {
    return address.toLowerCase();
  }
  return null;
}

/**
 * Check if cast mentions Monad deployment
 */
function isMonadDeploymentCast(text: string): boolean {
  const lowerText = text.toLowerCase();
  const monadKeywords = ["monad", "deployed to monad", "monad token", "monad chain"];
  return monadKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Send startup notification to Discord webhook
 */
async function sendStartupNotification(): Promise<void> {
  try {
    const message = {
      content: `✅ **Monad Clanker Monitor Started**\n\n` +
        `**Status:** Now monitoring @clanker for Monad token deployments\n` +
        `**Check Interval:** Every 1 minute\n` +
        `**Started:** <t:${Math.floor(Date.now() / 1000)}:R>`,
    };

    const response = await fetch(MONAD_CLANKER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      logger.error(`[Monad Clanker Monitor] Failed to send startup notification: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error("[Monad Clanker Monitor] Error sending startup notification:", error);
  }
}

/**
 * Send status update to Discord webhook showing monitor is active
 */
async function sendStatusUpdate(checkCount: number, newCastsFound: number): Promise<void> {
  try {
    const message = {
      content: `👀 **Monad Clanker Monitor - Active**\n\n` +
        `**Status:** Monitoring @clanker for Monad deployments\n` +
        `**Checks Completed:** ${checkCount}\n` +
        `**New Casts Checked:** ${newCastsFound}\n` +
        `**Last Check:** <t:${Math.floor(Date.now() / 1000)}:R>`,
    };

    const response = await fetch(MONAD_CLANKER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      logger.error(`[Monad Clanker Monitor] Failed to send status update: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error("[Monad Clanker Monitor] Error sending status update:", error);
  }
}

/**
 * Send Monad deployment notification to Discord webhook
 * If deployer has FID < 5000, includes special ping
 */
async function sendMonadDeploymentNotification(
  deployment: MonadDeployment,
  isEarlyFid: boolean = false,
): Promise<void> {
  try {
    const deployerInfo = deployment.farcasterUser
      ? `**Deployer:** @${deployment.farcasterUser.username || deployment.farcasterUser.displayName || `FID ${deployment.farcasterUser.fid}`}\n` +
        `**Farcaster:** [View Profile](https://farcaster.xyz/${deployment.farcasterUser.username || `fid/${deployment.farcasterUser.fid}`})\n`
      : deployment.deployerAddress
      ? `**Deployer Address:** \`${deployment.deployerAddress}\`\n`
      : "";

    const explorerUrl = `https://monadscan.com/address/${deployment.contractAddress}`;
    const txUrl = deployment.deployerAddress
      ? `https://monadscan.com/address/${deployment.deployerAddress}`
      : explorerUrl;

    // Add special ping for early FID users (FID < 5000)
    const pingText = isEarlyFid ? "@everyone 🎯 **EARLY FID ALERT** " : "@everyone ";
    
    const message = {
      content: `${pingText}🟢 **NEW MONAD CLANKER TOKEN DEPLOYED**\n\n` +
        `**Contract:** \`${deployment.contractAddress}\`\n` +
        `**Explorer:** [View on MonadScan](${explorerUrl})\n\n` +
        deployerInfo +
        (deployment.castUrl ? `**Cast:** [View on Farcaster](${deployment.castUrl})\n` : "") +
        `**Timestamp:** <t:${Math.floor(deployment.timestamp / 1000)}:R>`,
      embeds: [
        {
          title: isEarlyFid ? "🎯 EARLY FID - Monad Clanker Token Deployment" : "Monad Clanker Token Deployment",
          description: isEarlyFid 
            ? `**Early FID Alert!** New token deployed on Monad chain by Farcaster user with FID < 5000`
            : `New token deployed on Monad chain`,
          color: isEarlyFid ? 0xffd700 : 0x00ff00, // Gold for early FID, Green for regular
          fields: [
            {
              name: "Contract Address",
              value: `\`${deployment.contractAddress}\``,
              inline: false,
            },
            {
              name: "Deployer",
              value: deployment.farcasterUser
                ? `@${deployment.farcasterUser.username || deployment.farcasterUser.displayName || `FID ${deployment.farcasterUser.fid}`}${isEarlyFid ? ` (FID: ${deployment.farcasterUser.fid} ⭐)` : ""}`
                : deployment.deployerAddress
                ? `\`${deployment.deployerAddress}\``
                : "Unknown",
              inline: true,
            },
            {
              name: "Chain",
              value: "Monad",
              inline: true,
            },
          ],
          timestamp: new Date(deployment.timestamp).toISOString(),
          url: deployment.castUrl || undefined,
        },
      ],
    };

    const response = await fetch(MONAD_CLANKER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      logger.error(`[Monad Clanker Monitor] Failed to send webhook: ${response.status} ${response.statusText}`);
    } else {
      logger.system(`[Monad Clanker Monitor] ✅ Sent notification for ${deployment.contractAddress}`);
    }
  } catch (error) {
    logger.error("[Monad Clanker Monitor] Error sending webhook notification:", error);
  }
}

/**
 * Process a cast to check for Monad deployments
 */
async function processCast(cast: any): Promise<MonadDeployment | null> {
  const castHash = cast.hash;
  const castText = cast.text || "";
  
  // Skip if already seen
  if (seenCasts.has(castHash)) {
    return null;
  }

  // Check if cast mentions Monad deployment
  if (!isMonadDeploymentCast(castText)) {
    return null;
  }

  // Extract contract address
  const contractAddress = extractContractFromCast(castText);
  if (!contractAddress) {
    logger.debug(`[Monad Clanker Monitor] Cast mentions Monad but no contract address found: ${castHash}`);
    return null;
  }

  // Verify it's actually a Monad contract (check chain)
  // For now, we'll trust the cast mentions Monad
  // In the future, we could verify by checking the contract on Monad chain

  // Get deployer address from contract creation
  let deployerAddress: string | null = null;
  let farcasterUser: { fid: number; username: string | null; displayName: string | null } | null = null;

  try {
    const contractCreation = await getContractCreation(contractAddress, "monad").catch(() => null);
    if (contractCreation?.contractCreator) {
      deployerAddress = contractCreation.contractCreator.toLowerCase();
      
      // Try to find Farcaster user by wallet
      try {
        const user = await findUserByWallet(deployerAddress);
        if (user) {
          farcasterUser = {
            fid: user.fid,
            username: user.username || null,
            displayName: user.display_name || null,
          };
        }
      } catch (error) {
        // Ignore - deployer might not have Farcaster account
      }
    }
  } catch (error) {
    logger.warn(`[Monad Clanker Monitor] Failed to get contract creation for ${contractAddress}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Build correct cast URL using username and hash
  // Cast URL format: https://warpcast.com/{username}/{hash}
  const castAuthorUsername = cast.author?.username || "clanker"; // Fallback to "clanker" if username not available
  const { buildCastUrl } = await import("../utils/farcasterLinks");
  const castUrl = buildCastUrl(castAuthorUsername, castHash);
  
  // Cast timestamp can be in different formats - handle both
  let timestamp: number;
  if (cast.timestamp) {
    timestamp = typeof cast.timestamp === "string" 
      ? new Date(cast.timestamp).getTime() 
      : cast.timestamp * 1000; // If it's in seconds
  } else if (cast.created_at) {
    timestamp = typeof cast.created_at === "string"
      ? new Date(cast.created_at).getTime()
      : cast.created_at * 1000;
  } else {
    timestamp = Date.now();
  }

  return {
    contractAddress,
    deployerAddress,
    castHash,
    castUrl,
    timestamp,
    farcasterUser,
  };
}

/**
 * Monitor @clanker profile for Monad deployments
 */
export class MonadClankerMonitor {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastCheckedTimestamp: number = Date.now();
  private checkCount: number = 0;

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("[Monad Clanker Monitor] Already running");
      return;
    }

    this.isRunning = true;
    logger.info("[Monad Clanker Monitor] Starting Monad Clanker deployment monitoring...");

    // Send startup notification
    sendStartupNotification().catch((error) => {
      logger.error("[Monad Clanker Monitor] Failed to send startup notification:", error);
    });

    // Run initial check
    this.checkForMonadDeployments().catch((error) => {
      logger.error("[Monad Clanker Monitor] Initial check failed:", error);
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkForMonadDeployments().catch((error) => {
        logger.error("[Monad Clanker Monitor] Periodic check failed:", error);
      });
    }, CHECK_INTERVAL_MS);

    // Cleanup seen casts periodically
    setInterval(() => {
      cleanupSeenCasts();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info("[Monad Clanker Monitor] Stopped monitoring");
  }

  /**
   * Check for new Monad deployments from both @clanker casts and Clanker.world API
   */
  private async checkForMonadDeployments(): Promise<void> {
    try {
      this.checkCount++;
      logger.debug("[Monad Clanker Monitor] Checking for new Monad deployments...");

      // Check Clanker.world API for Monad tokens
      await this.checkClankerWorldMonadTokens();

      // Get @clanker user
      const clankerUser = await findUserByUsername(CLANKER_USERNAME);
      if (!clankerUser) {
        logger.warn("[Monad Clanker Monitor] Could not find @clanker user");
        return;
      }

      // Get recent casts (last 50, including replies)
      const casts = await fetchUserCasts(clankerUser.fid, { limit: 50, includeReplies: true });
      
      // Filter to casts since last check
      const newCasts = casts.filter((cast: any) => {
        let castTime: number;
        if (cast.timestamp) {
          castTime = typeof cast.timestamp === "string" 
            ? new Date(cast.timestamp).getTime() 
            : cast.timestamp * 1000;
        } else if (cast.created_at) {
          castTime = typeof cast.created_at === "string"
            ? new Date(cast.created_at).getTime()
            : cast.created_at * 1000;
        } else {
          return false; // Skip casts without timestamp
        }
        return castTime > this.lastCheckedTimestamp;
      });

      logger.debug(`[Monad Clanker Monitor] Found ${newCasts.length} new casts since last check`);

      // Send status update every 5 checks (every 5 minutes)
      if (this.checkCount % 5 === 0) {
        await sendStatusUpdate(this.checkCount, newCasts.length);
      }

      // Process each new cast
      for (const cast of newCasts) {
        const deployment = await processCast(cast);
        if (deployment) {
          // Mark as seen
          seenCasts.add(cast.hash);
          
          // Send notification
          await sendMonadDeploymentNotification(deployment);
          
          logger.system(`[Monad Clanker Monitor] ✅ Detected Monad deployment: ${deployment.contractAddress}`);
        }
      }

      // Update last checked timestamp
      this.lastCheckedTimestamp = Date.now();

    } catch (error) {
      logger.error("[Monad Clanker Monitor] Error checking for deployments:", error);
    }
  }

  /**
   * Check Clanker.world API for new Monad token deployments
   */
  private async checkClankerWorldMonadTokens(): Promise<void> {
    try {
      // Fetch recent Monad tokens from Clanker API
      const monadTokens = await fetchRecentMonadTokens(50);
      
      logger.debug(`[Monad Clanker Monitor] Found ${monadTokens.length} Monad tokens from Clanker.world API`);

      for (const token of monadTokens) {
        if (!token.contract_address) {
          continue;
        }

        const contractAddress = token.contract_address.toLowerCase();
        
        // Skip if already seen
        if (seenContracts.has(contractAddress)) {
          continue;
        }

        // Check if token was deployed recently (within last 10 minutes)
        const deployedAt = token.deployed_at || token.created_at;
        if (!deployedAt) {
          continue;
        }

        const deployedTime = new Date(deployedAt).getTime();
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        
        if (deployedTime < tenMinutesAgo) {
          // Token is older than 10 minutes, skip it
          seenContracts.add(contractAddress); // Mark as seen to avoid checking again
          continue;
        }

        // Get deployer address from contract creation
        let deployerAddress: string | null = null;
        let farcasterUser: { fid: number; username: string | null; displayName: string | null } | null = null;
        let isEarlyFid = false;

        try {
          const contractCreation = await getContractCreation(contractAddress, "monad").catch(() => null);
          if (contractCreation?.contractCreator) {
            deployerAddress = contractCreation.contractCreator.toLowerCase();
            
            // Try to find Farcaster user by wallet
            try {
              const user = await findUserByWallet(deployerAddress);
              if (user) {
                farcasterUser = {
                  fid: user.fid,
                  username: user.username || null,
                  displayName: user.display_name || null,
                };
                
                // Check if FID < 5000
                if (user.fid < 5000) {
                  isEarlyFid = true;
                }
              }
            } catch (error) {
              // Ignore - deployer might not have Farcaster account
            }
          }
        } catch (error) {
          logger.warn(`[Monad Clanker Monitor] Failed to get contract creation for ${contractAddress}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Also check if token has deployer info from Clanker API
        if (!farcasterUser && token.msg_sender) {
          try {
            const user = await findUserByWallet(token.msg_sender);
            if (user) {
              farcasterUser = {
                fid: user.fid,
                username: user.username || null,
                displayName: user.display_name || null,
              };
              
              // Check if FID < 5000
              if (user.fid < 5000) {
                isEarlyFid = true;
              }
            }
          } catch (error) {
            // Ignore
          }
        }

        // Create deployment object
        const deployment: MonadDeployment = {
          contractAddress,
          deployerAddress,
          castHash: "", // No cast hash for Clanker.world deployments
          castUrl: token.contract_address ? `https://www.clanker.world/clanker/${token.contract_address}` : "",
          timestamp: deployedTime,
          farcasterUser,
        };

        // Mark as seen
        seenContracts.add(contractAddress);
        
        // Send notification (with early FID ping if applicable)
        await sendMonadDeploymentNotification(deployment, isEarlyFid);
        
        logger.system(`[Monad Clanker Monitor] ✅ Detected Monad deployment from Clanker.world: ${contractAddress}${isEarlyFid ? " (EARLY FID!)" : ""}`);
      }
    } catch (error) {
      logger.error("[Monad Clanker Monitor] Error checking Clanker.world API:", error);
    }
  }
}

