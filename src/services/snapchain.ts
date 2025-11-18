import axios from "axios";
import { env } from "../config";

/**
 * Snapchain Service
 * 
 * Uses Neynar's Server Wallets API (which uses Snapchain infrastructure)
 * for wallet creation and transaction execution.
 * 
 * Flow:
 * 1. User authenticates via SIWF (gets FID)
 * 2. Create/get Snapchain wallet for that FID
 * 3. Execute trades using the Snapchain wallet
 */

export interface SnapchainWallet {
  walletId: string;
  address: string;
  fid: number;
  network: string; // "base", "base-sepolia", etc.
  createdAt: number;
}

export interface SnapchainTransaction {
  to: string;
  data?: string;
  value?: string; // in wei
  gasLimit?: string;
  gasPrice?: string;
}

export interface SnapchainTransactionResult {
  transactionHash: string;
  status: "pending" | "success" | "failed";
  from: string;
  to: string;
  value: string;
}

/**
 * Create a Snapchain wallet for a Farcaster user (FID)
 * This uses Neynar's Server Wallets API which manages wallets on Snapchain
 */
export async function createSnapchainWallet(
  fid: number,
  network: "base" | "base-sepolia" = "base"
): Promise<SnapchainWallet> {
  try {
    // Note: Neynar's Server Wallets API might require different endpoints
    // This is a placeholder structure - we'll need to check actual API docs
    const response = await axios.post(
      `https://api.neynar.com/v2/farcaster/wallet/create`,
      {
        fid,
        network,
      },
      {
        headers: {
          "x-api-key": env.neynarApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.wallet) {
      return {
        walletId: response.data.wallet.id || response.data.wallet.wallet_id,
        address: response.data.wallet.address,
        fid,
        network,
        createdAt: Date.now(),
      };
    }

    throw new Error("Invalid response from Snapchain wallet creation");
  } catch (error: any) {
    if (error.response) {
      console.error("[Snapchain] API Error:", error.response.data);
      throw new Error(
        error.response.data?.message || "Failed to create Snapchain wallet"
      );
    }
    throw error;
  }
}

/**
 * Get an existing Snapchain wallet for a FID
 */
export async function getSnapchainWallet(
  fid: number,
  network: "base" | "base-sepolia" = "base"
): Promise<SnapchainWallet | null> {
  try {
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/wallet/${fid}`,
      {
        headers: {
          "x-api-key": env.neynarApiKey,
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
      return null; // Wallet doesn't exist yet
    }
    throw error;
  }
}

/**
 * Get or create a Snapchain wallet for a FID
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
 * Execute a transaction using Snapchain wallet
 * This uses Neynar's Server Wallets API to execute transactions
 */
export async function executeSnapchainTransaction(
  walletId: string,
  transaction: SnapchainTransaction,
  network: "base" | "base-sepolia" = "base"
): Promise<SnapchainTransactionResult> {
  try {
    // Execute transaction via Neynar Server Wallets API
    const response = await axios.post(
      `https://api.neynar.com/v2/farcaster/wallet/${walletId}/execute`,
      {
        transaction: {
          to: transaction.to,
          data: transaction.data || "0x",
          value: transaction.value || "0",
          gasLimit: transaction.gasLimit,
          gasPrice: transaction.gasPrice,
        },
        network,
        async: false, // Wait for transaction to be mined
      },
      {
        headers: {
          "x-api-key": env.neynarApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.transaction) {
      return {
        transactionHash: response.data.transaction.hash || response.data.transaction_hash,
        status: response.data.transaction.status || "pending",
        from: response.data.transaction.from,
        to: response.data.transaction.to,
        value: response.data.transaction.value || "0",
      };
    }

    throw new Error("Invalid response from Snapchain transaction execution");
  } catch (error: any) {
    if (error.response) {
      console.error("[Snapchain] Transaction Error:", error.response.data);
      throw new Error(
        error.response.data?.message || "Failed to execute Snapchain transaction"
      );
    }
    throw error;
  }
}

/**
 * Get wallet balance (native token)
 */
export async function getSnapchainWalletBalance(
  walletId: string,
  network: "base" | "base-sepolia" = "base"
): Promise<string> {
  try {
    const response = await axios.get(
      `https://api.neynar.com/v2/farcaster/wallet/${walletId}/balance`,
      {
        headers: {
          "x-api-key": env.neynarApiKey,
        },
        params: {
          network,
        },
      }
    );

    return response.data?.balance || "0";
  } catch (error: any) {
    console.error("[Snapchain] Balance Error:", error);
    return "0";
  }
}

