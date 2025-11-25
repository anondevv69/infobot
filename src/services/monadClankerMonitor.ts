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
const CLANKER_MONAD_FACTORY = "0xf9a0c289eab6b571c6247094a853810987e5b26d".toLowerCase();

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
        `**Status:** Monitoring Clanker.world API + @clanker Farcaster profile for Monad token deployments\n` +
        `**Check Interval:** Every 1 minute\n` +
        `**Sources:**\n` +
        `• Clanker.world API (primary - most reliable)\n` +
        `• @clanker Farcaster casts (secondary)\n` +
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
        `**Status:** Monitoring Clanker.world API + @clanker Farcaster for Monad deployments\n` +
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
            ? `**Early FID Alert!** New token deployed on Monad chain by Farcaster user with FID < 300000`
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
  private lastClankerWorldCheckTimestamp: number = Date.now() - (24 * 60 * 60 * 1000); // Start 24 hours ago to catch recent tokens
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

    // Clear seen contracts on startup to catch any tokens that were missed
    seenContracts.clear();
    logger.debug("[Monad Clanker Monitor] Cleared seen contracts cache on startup");

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
   * Check for new Monad deployments from both @clanker casts, Clanker.world API, and direct Monad chain monitoring
   */
  private async checkForMonadDeployments(): Promise<void> {
    try {
      this.checkCount++;
      logger.debug("[Monad Clanker Monitor] Checking for new Monad deployments...");

      // Check Clanker.world API for Monad tokens
      await this.checkClankerWorldMonadTokens();
      
      // Check Monad chain directly for new contract deployments from Clanker factory
      await this.checkMonadChainDeployments();

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
      // Use startDate to only get tokens created after the last check
      // This ensures we don't miss tokens and don't process duplicates
      const startDateTimestamp = this.lastClankerWorldCheckTimestamp;
      logger.system(`[Monad Clanker Monitor] Checking Clanker.world API for Monad tokens (startDate: ${new Date(startDateTimestamp).toISOString()})`);
      
      const monadTokens = await fetchRecentMonadTokens(100, startDateTimestamp);
      
      logger.system(`[Monad Clanker Monitor] Found ${monadTokens.length} Monad tokens from Clanker.world API`);
      
      // Log all Monad tokens found for debugging
      if (monadTokens.length > 0) {
        logger.system(`[Monad Clanker Monitor] Monad tokens found: ${monadTokens.map(t => `${t.contract_address} (${t.deployed_at || t.created_at}, FID: ${t.related?.user?.fid ?? "none"})`).join(", ")}`);
      } else {
        logger.system(`[Monad Clanker Monitor] No new Monad tokens found in Clanker.world API`);
      }

      for (const token of monadTokens) {
        if (!token.contract_address) {
          continue;
        }

        const contractAddress = token.contract_address.toLowerCase();
        
        // Skip if already seen
        if (seenContracts.has(contractAddress)) {
          logger.debug(`[Monad Clanker Monitor] Skipping ${contractAddress} - already seen`);
          continue;
        }

        // Check if token was deployed recently (within last 24 hours)
        // This ensures we catch tokens even if they're a few hours old
        const deployedAt = token.deployed_at || token.created_at;
        if (!deployedAt) {
          logger.debug(`[Monad Clanker Monitor] Skipping ${contractAddress} - no deployment timestamp`);
          continue;
        }

        const deployedTime = new Date(deployedAt).getTime();
        
        // Only process tokens deployed since last check (or within last 24 hours if this is first check)
        const minTimestamp = this.lastClankerWorldCheckTimestamp;
        
        if (deployedTime < minTimestamp) {
          // Token is older than our last check, skip it
          logger.debug(`[Monad Clanker Monitor] Skipping ${contractAddress} - deployed ${new Date(deployedTime).toISOString()} is before last check ${new Date(minTimestamp).toISOString()}`);
          continue;
        }
        
        logger.system(`[Monad Clanker Monitor] Processing token ${contractAddress} (deployed: ${new Date(deployedTime).toISOString()}, FID from API: ${token.related?.user?.fid ?? "none"})`);

        // PRIMARY METHOD: Use Clanker API's msg_sender (deployer address) and look up FID via Neynar
        // This is the most reliable method as msg_sender is always provided by Clanker API
        let deployerAddress: string | null = null;
        let farcasterUser: { fid: number; username: string | null; displayName: string | null } | null = null;
        let isEarlyFid = false;
        
        // Get deployer address from Clanker API (msg_sender is the deployer)
        if (token.msg_sender) {
          deployerAddress = token.msg_sender.toLowerCase();
          
          // Look up FID using Neynar by deployer wallet address
          try {
            const user = await findUserByWallet(deployerAddress);
            if (user) {
              farcasterUser = {
                fid: user.fid,
                username: user.username || null,
                displayName: user.display_name || null,
              };
              
              // Check if FID < 300000 (user-requested threshold)
              if (user.fid < 300000) {
                isEarlyFid = true;
                logger.system(`[Monad Clanker Monitor] 🎯 EARLY FID ${user.fid} from deployer ${deployerAddress} for ${contractAddress} - WILL PING!`);
              } else {
                logger.system(`[Monad Clanker Monitor] Found FID ${user.fid} from deployer ${deployerAddress} for ${contractAddress} (not early, threshold: 300000)`);
              }
            } else {
              logger.system(`[Monad Clanker Monitor] ⚠️ No Farcaster user found for deployer ${deployerAddress} (token ${contractAddress})`);
            }
          } catch (error) {
            logger.warn(`[Monad Clanker Monitor] Failed to lookup FID for deployer ${deployerAddress}:`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          logger.system(`[Monad Clanker Monitor] ⚠️ Token ${contractAddress} has no msg_sender from Clanker API`);
        }
        
        // FALLBACK: If Neynar lookup failed, try Clanker API's related.user.fid
        if (!farcasterUser && token.related?.user?.fid !== undefined && token.related.user.fid !== null) {
          const clankerUserFid = token.related.user.fid;
          const clankerUser = token.related.user;
          
          farcasterUser = {
            fid: clankerUserFid,
            username: clankerUser.username || null,
            displayName: clankerUser.displayName || null,
          };
          
          // Check if FID < 300000 (user-requested threshold)
          if (clankerUserFid < 300000) {
            isEarlyFid = true;
            logger.system(`[Monad Clanker Monitor] 🎯 EARLY FID ${clankerUserFid} from Clanker API related.user for ${contractAddress} - WILL PING!`);
          } else {
            logger.system(`[Monad Clanker Monitor] Found FID ${clankerUserFid} from Clanker API related.user for ${contractAddress} (not early, threshold: 300000)`);
          }
        }
        
        // Verify this is from the Clanker factory (for logging/debugging, but don't skip if not)
        // We still want to notify about Monad tokens even if factory verification fails
        let contractCreation: { contractCreator: string; txHash: string; createdAt?: number | null } | null = null;
        try {
          contractCreation = await getContractCreation(contractAddress, "monad").catch(() => null);
          if (contractCreation?.contractCreator) {
            const factoryAddress = contractCreation.contractCreator.toLowerCase();
            const isFromClankerFactory = factoryAddress === CLANKER_MONAD_FACTORY;
            
            if (!isFromClankerFactory) {
              logger.system(`[Monad Clanker Monitor] ⚠️ Token ${contractAddress} is NOT from Clanker factory (creator: ${factoryAddress}, expected: ${CLANKER_MONAD_FACTORY})`);
              // Don't skip - still process the token even if factory verification fails
            } else {
              logger.system(`[Monad Clanker Monitor] ✅ Token ${contractAddress} verified as Clanker factory deployment`);
            }
          }
        } catch (error) {
          logger.warn(`[Monad Clanker Monitor] Failed to verify factory for ${contractAddress}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        
        // Log if we found a FID but it's not early (for debugging)
        if (farcasterUser && !isEarlyFid) {
          logger.debug(`[Monad Clanker Monitor] Found FID ${farcasterUser.fid} for ${contractAddress} (not early, threshold: 300000)`);
        }
        
        // Log if we couldn't find FID at all (for debugging)
        if (!farcasterUser) {
          logger.debug(`[Monad Clanker Monitor] Could not find Farcaster user for ${contractAddress}. Clanker API related.user: ${token.related?.user?.fid ?? "none"}, msg_sender: ${token.msg_sender ?? "none"}`);
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

        // Mark as seen BEFORE sending notification (to avoid duplicates if notification fails)
        seenContracts.add(contractAddress);
        
        // Send notification (with early FID ping if applicable)
        // ALWAYS ping if FID < 300000, regardless of whether we found the user
        const shouldPing = isEarlyFid || (farcasterUser !== null && farcasterUser.fid < 300000);
        await sendMonadDeploymentNotification(deployment, shouldPing);
        
        logger.system(`[Monad Clanker Monitor] ✅ Detected Monad deployment from Clanker.world: ${contractAddress}${shouldPing ? " (EARLY FID - PINGED!)" : ""}${farcasterUser ? ` by @${farcasterUser.username || `FID ${farcasterUser.fid}`}` : " (FID unknown)"}`);
      }
      
      // Update last check timestamp
      this.lastClankerWorldCheckTimestamp = Date.now();
    } catch (error) {
      logger.error("[Monad Clanker Monitor] Error checking Clanker.world API:", error);
    }
  }

  /**
   * Monitor Monad chain directly for new contract deployments from Clanker factory
   * This catches deployments immediately, even before Clanker.world indexes them
   * 
   * Strategy: Since BlockVision API doesn't have a direct "get transactions from address" endpoint,
   * we'll enhance the Clanker API monitoring to also verify each token is from the Clanker factory
   * and check the deployer's FID. This ensures we catch all Monad Clanker deployments.
   */
  private async checkMonadChainDeployments(): Promise<void> {
    try {
      logger.debug("[Monad Clanker Monitor] Checking Monad chain for new deployments from Clanker factory");
      
      // The actual monitoring happens in checkClankerWorldMonadTokens where we:
      // 1. Get Monad tokens from Clanker API
      // 2. Verify they're from the Clanker factory (via contract creation lookup)
      // 3. Check deployer's FID and ping if < 300000
      
      // This method serves as a placeholder for future direct chain monitoring
      // if BlockVision adds support for transaction queries by address
      
    } catch (error) {
      logger.error("[Monad Clanker Monitor] Error checking Monad chain deployments:", error);
    }
  }
}

