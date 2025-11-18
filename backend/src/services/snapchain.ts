import axios from "axios";
import { logger } from "../utils/logger";

/**
 * Snapchain Service (Backend)
 * 
 * Manages Snapchain wallets for Farcaster users.
 * Uses Neynar's Server Wallets API (which uses Snapchain infrastructure).
 */

export interface SnapchainWallet {
  walletId: string;
  address: string;
  fid: number;
  network: string;
  createdAt: number;
}

// Store wallets in memory (in production, use database)
// Key: `${platform}:${userId}` -> wallet info
const wallets = new Map<string, SnapchainWallet>();

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_BASE_URL = "https://api.neynar.com";

/**
 * Create a Snapchain wallet for a FID
 * 
 * Note: This is a placeholder implementation. The actual Neynar API
 * endpoints for Server Wallets may differ. We'll need to check the
 * official documentation or contact Neynar support.
 */
export async function createSnapchainWallet(
  fid: number,
  network: "base" | "base-sepolia" = "base"
): Promise<SnapchainWallet> {
  try {
    // TODO: Replace with actual Neynar Server Wallets API endpoint
    // The endpoint structure might be different
    const response = await axios.post(
      `${NEYNAR_BASE_URL}/v2/farcaster/wallet/create`,
      {
        fid,
        network,
      },
      {
        headers: {
          "x-api-key": NEYNAR_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.wallet) {
      const wallet: SnapchainWallet = {
        walletId: response.data.wallet.id || response.data.wallet.wallet_id,
        address: response.data.wallet.address,
        fid,
        network,
        createdAt: Date.now(),
      };
      return wallet;
    }

    throw new Error("Invalid response from wallet creation");
  } catch (error: any) {
    logger.error("[Snapchain] Failed to create wallet:", error);
    if (error.response) {
      throw new Error(
        error.response.data?.message || "Failed to create Snapchain wallet"
      );
    }
    throw error;
  }
}

/**
 * Get Snapchain wallet for a FID
 */
export async function getSnapchainWallet(
  fid: number,
  network: "base" | "base-sepolia" = "base"
): Promise<SnapchainWallet | null> {
  try {
    const response = await axios.get(
      `${NEYNAR_BASE_URL}/v2/farcaster/wallet/${fid}`,
      {
        headers: {
          "x-api-key": NEYNAR_API_KEY,
        },
        params: {
          network,
        },
      }
    );

    if (response.data && response.data.wallet) {
      return {
        walletId: response.data.wallet.id || response.data.wallet.wallet_id,
        address: response.data.wallet.address,
        fid,
        network,
        createdAt: response.data.wallet.created_at || Date.now(),
      };
    }

    return null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    logger.error("[Snapchain] Failed to get wallet:", error);
    throw error;
  }
}

/**
 * Get or create wallet for a FID
 */
export async function getOrCreateSnapchainWallet(
  fid: number,
  network: "base" | "base-sepolia" = "base"
): Promise<SnapchainWallet> {
  const existing = await getSnapchainWallet(fid, network);
  if (existing) {
    return existing;
  }
  return createSnapchainWallet(fid, network);
}

/**
 * Store wallet in local cache (for quick access)
 */
export function storeWallet(
  userId: string,
  platform: "discord" | "telegram",
  wallet: SnapchainWallet
): void {
  const key = `${platform}:${userId}`;
  wallets.set(key, wallet);
}

/**
 * Get wallet from local cache
 */
export function getStoredWallet(
  userId: string,
  platform: "discord" | "telegram"
): SnapchainWallet | null {
  const key = `${platform}:${userId}`;
  return wallets.get(key) || null;
}

/**
 * Execute transaction using Snapchain wallet
 */
export async function executeSnapchainTransaction(
  walletId: string,
  transaction: {
    to: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  },
  network: "base" | "base-sepolia" = "base"
): Promise<{
  transactionHash: string;
  status: string;
  from: string;
  to: string;
  value: string;
}> {
  try {
    const response = await axios.post(
      `${NEYNAR_BASE_URL}/v2/farcaster/wallet/${walletId}/execute`,
      {
        transaction: {
          to: transaction.to,
          data: transaction.data || "0x",
          value: transaction.value || "0",
          gasLimit: transaction.gasLimit,
          gasPrice: transaction.gasPrice,
        },
        network,
        async: false,
      },
      {
        headers: {
          "x-api-key": NEYNAR_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.transaction) {
      return {
        transactionHash:
          response.data.transaction.hash || response.data.transaction_hash,
        status: response.data.transaction.status || "pending",
        from: response.data.transaction.from,
        to: response.data.transaction.to,
        value: response.data.transaction.value || "0",
      };
    }

    throw new Error("Invalid response from transaction execution");
  } catch (error: any) {
    logger.error("[Snapchain] Transaction execution failed:", error);
    if (error.response) {
      throw new Error(
        error.response.data?.message || "Failed to execute transaction"
      );
    }
    throw error;
  }
}

