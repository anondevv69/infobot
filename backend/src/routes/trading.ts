import { Router } from "express";
import { logger } from "../utils/logger";
import { getConnection } from "./siwf";
import {
  getOrCreateSnapchainWallet,
  getStoredWallet,
  storeWallet,
  executeSnapchainTransaction,
} from "../services/snapchain";

const router = Router();

// Endpoint to create/get Snapchain wallet for a user
router.post("/wallet", async (req, res) => {
  try {
    const { userId, platform } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user's Farcaster connection (from SIWF)
    const connection = getConnection(userId, platform);
    if (!connection) {
      return res.status(404).json({
        error: "User not connected to Farcaster. Use /connect first.",
      });
    }

    // Check if wallet already exists in cache
    let wallet = getStoredWallet(userId, platform);
    if (wallet) {
      return res.json({
        success: true,
        wallet: {
          address: wallet.address,
          walletId: wallet.walletId,
          network: wallet.network,
        },
      });
    }

    // Create or get Snapchain wallet for this FID
    wallet = await getOrCreateSnapchainWallet(connection.fid, "base");

    // Store wallet in cache
    storeWallet(userId, platform, wallet);

    logger.info(
      `Snapchain wallet created/retrieved for user ${userId} (FID: ${connection.fid})`
    );

    return res.json({
      success: true,
      wallet: {
        address: wallet.address,
        walletId: wallet.walletId,
        network: wallet.network,
      },
    });
  } catch (error: any) {
    logger.error("Failed to create/get Snapchain wallet:", error);
    return res.status(500).json({
      error: "Failed to create/get wallet",
      message: error.message,
    });
  }
});

// Endpoint to execute a trade transaction using Snapchain
router.post("/execute", async (req, res) => {
  try {
    const { userId, platform, transaction, chainId } = req.body;

    if (!userId || !platform || !transaction || !chainId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user's Farcaster connection
    const connection = getConnection(userId, platform);
    if (!connection) {
      return res.status(404).json({
        error: "User not connected to Farcaster. Use /connect first.",
      });
    }

    // Get or create Snapchain wallet
    let wallet = getStoredWallet(userId, platform);
    if (!wallet) {
      wallet = await getOrCreateSnapchainWallet(connection.fid, "base");
      storeWallet(userId, platform, wallet);
    }

    // Map chainId to network (Snapchain primarily supports Base)
    // For now, we'll use Base for all transactions
    const network = chainId === 8453 ? "base" : "base-sepolia";

    // Execute transaction via Snapchain
    const result = await executeSnapchainTransaction(
      wallet.walletId,
      {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || "0",
        gasLimit: transaction.gasLimit,
        gasPrice: transaction.gasPrice,
      },
      network
    );

    logger.info(
      `Snapchain transaction executed: ${result.transactionHash} for user ${userId} (FID: ${connection.fid})`
    );

    return res.json({
      success: true,
      txHash: result.transactionHash,
      tx: {
        hash: result.transactionHash,
        from: result.from,
        to: result.to,
        value: result.value,
        status: result.status,
      },
    });
  } catch (error: any) {
    logger.error("Trading execute error:", error);
    return res.status(500).json({
      error: "Transaction execution failed",
      message: error.message,
    });
  }
});

export const tradingRouter = router;

