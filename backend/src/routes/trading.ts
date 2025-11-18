import { Router } from "express";
import { logger } from "../utils/logger";
import { getEncryptedSigner } from "./siwf";
import crypto from "crypto";

const router = Router();

// Encryption utilities (duplicated from bot for backend use)
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

function deriveKey(salt: Buffer): Buffer {
  const ENCRYPTION_KEY = process.env.SIGNER_ENCRYPTION_KEY || "dev-key-change-in-production-32chars!!";
  return crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, "sha512");
}

function decryptSigner(encryptedKey: string): string {
  try {
    const data = Buffer.from(encryptedKey, "base64");
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, TAG_POSITION);
    const tag = data.subarray(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = data.subarray(ENCRYPTED_POSITION);
    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error: any) {
    logger.error("Failed to decrypt signer:", error);
    throw new Error("Failed to decrypt signer private key");
  }
}

// Endpoint to execute a trade transaction
router.post("/execute", async (req, res) => {
  try {
    const { userId, platform, transaction, chainId } = req.body;

    if (!userId || !platform || !transaction || !chainId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get encrypted signer
    const encryptedSigner = getEncryptedSigner(userId, platform);
    if (!encryptedSigner) {
      return res.status(404).json({ error: "No signer found for user" });
    }

    // Decrypt signer
    let privateKey: string;
    try {
      privateKey = decryptSigner(encryptedSigner);
    } catch (error: any) {
      logger.error("Failed to decrypt signer:", error);
      return res.status(500).json({ error: "Failed to decrypt signer" });
    }

    // Execute transaction using ethers
    try {
      const { Wallet, JsonRpcProvider } = require("ethers");

      // Get RPC URL for chain
      const rpcUrls: Record<number, string> = {
        1: process.env.QUICKNODE_API_KEY
          ? `https://eth-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
          : "https://eth.llamarpc.com",
        8453: process.env.QUICKNODE_API_KEY
          ? `https://base-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
          : "https://mainnet.base.org",
        42161: process.env.QUICKNODE_API_KEY
          ? `https://arbitrum-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
          : "https://arb1.arbitrum.io/rpc",
        10: process.env.QUICKNODE_API_KEY
          ? `https://optimism-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
          : "https://mainnet.optimism.io",
        137: process.env.QUICKNODE_API_KEY
          ? `https://polygon-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
          : "https://polygon-rpc.com",
      };

      const rpcUrl = rpcUrls[chainId] || rpcUrls[1];
      const provider = new JsonRpcProvider(rpcUrl);
      const wallet = new Wallet(privateKey, provider);

      // Send transaction
      const tx = await wallet.sendTransaction({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || "0",
        gasLimit: transaction.gasLimit,
        gasPrice: transaction.gasPrice,
      });

      logger.info(`Transaction sent: ${tx.hash} for user ${userId} on chain ${chainId}`);

      return res.json({
        success: true,
        txHash: tx.hash,
        tx: {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value.toString(),
        },
      });
    } catch (error: any) {
      logger.error("Failed to execute transaction:", error);
      return res.status(500).json({
        error: "Transaction execution failed",
        message: error.message,
      });
    }
  } catch (error: any) {
    logger.error("Trading execute error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const tradingRouter = router;

