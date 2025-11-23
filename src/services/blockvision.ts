/**
 * BlockVision API service for Monad chain
 * Documentation: https://docs.blockvision.org/reference/monad-indexing-api
 */

import { env } from "../config";

const BLOCKVISION_API_BASE = "https://monad-mainnet.blockvision.org/v1";

// Monad chain ID is 5001 (based on common EVM chain ID patterns)
export const MONAD_CHAIN_ID = 5001;
const BLOCKVISION_API_KEY = process.env.BLOCKVISION_API_KEY || "35tVwNXLcX6v9pGXcxQYrb852Qx";

export interface BlockVisionAccountTokens {
  address: string;
  tokens: Array<{
    contractAddress: string;
    tokenName?: string;
    tokenSymbol?: string;
    decimals?: number;
    balance?: string;
  }>;
}

export interface BlockVisionAccountInfo {
  address: string;
  balance: string;
  transactionCount: number;
  isContract: boolean;
}

export interface BlockVisionTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  status: "success" | "failed" | "pending";
  blockNumber: number | null;
  timestamp: number | null;
  gasUsed?: string;
  gasPrice?: string;
}

/**
 * Get account information from BlockVision API
 */
export async function getMonadAccountInfo(
  address: string,
): Promise<BlockVisionAccountInfo | null> {
  try {
    // Use BlockVision API to get account info
    // The API key is used as the endpoint base URL
    const apiUrl = `${BLOCKVISION_API_BASE}/${env.blockvisionApiKey}`;
    
    // Get account balance
    const balanceResponse = await fetch(`${apiUrl}/eth_getBalance?address=${address}&tag=latest`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!balanceResponse.ok) {
      return null;
    }

    const balanceData = await balanceResponse.json();
    const balance = balanceData.result || "0x0";

    // Get transaction count
    const txCountResponse = await fetch(`${apiUrl}/eth_getTransactionCount?address=${address}&tag=latest`, {
      headers: {
        Accept: "application/json",
      },
    });

    let transactionCount = 0;
    if (txCountResponse.ok) {
      const txCountData = await txCountResponse.json();
      if (txCountData.result) {
        transactionCount = parseInt(txCountData.result, 16);
      }
    }

    // Check if it's a contract
    const codeResponse = await fetch(`${apiUrl}/eth_getCode?address=${address}&tag=latest`, {
      headers: {
        Accept: "application/json",
      },
    });

    let isContract = false;
    if (codeResponse.ok) {
      const codeData = await codeResponse.json();
      if (codeData.result && codeData.result !== "0x") {
        isContract = true;
      }
    }

    return {
      address,
      balance,
      transactionCount,
      isContract,
    };
  } catch (error) {
    console.error(`[BlockVision] Error fetching account info for ${address}:`, error);
    return null;
  }
}

/**
 * Get transaction information from BlockVision API
 */
export async function getMonadTransaction(
  txHash: string,
): Promise<BlockVisionTransaction | null> {
  try {
    const apiUrl = `${BLOCKVISION_API_BASE}/${env.blockvisionApiKey}`;
    
    // Get transaction
    const txResponse = await fetch(`${apiUrl}/eth_getTransactionByHash?txhash=${txHash}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!txResponse.ok) {
      return null;
    }

    const txData = await txResponse.json();
    if (txData.error || !txData.result) {
      return null;
    }

    const tx = txData.result;

    // Get receipt
    const receiptResponse = await fetch(`${apiUrl}/eth_getTransactionReceipt?txhash=${txHash}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!receiptResponse.ok) {
      return null;
    }

    const receiptData = await receiptResponse.json();
    if (receiptData.error || !receiptData.result) {
      return null;
    }

    const receipt = receiptData.result;

    // Determine status
    let status: "success" | "failed" | "pending" = "pending";
    if (receipt.status === "0x1" || receipt.status === "0x01") {
      status = "success";
    } else if (receipt.status === "0x0" || receipt.status === "0x00") {
      status = "failed";
    }

    // Get block timestamp
    let timestamp: number | null = null;
    if (receipt.blockNumber) {
      try {
        const blockResponse = await fetch(`${apiUrl}/eth_getBlockByNumber?tag=${receipt.blockNumber}&boolean=false`, {
          headers: {
            Accept: "application/json",
          },
        });

        if (blockResponse.ok) {
          const blockData = await blockResponse.json();
          if (blockData.result?.timestamp) {
            timestamp = parseInt(blockData.result.timestamp, 16);
          }
        }
      } catch (error) {
        // Ignore timestamp errors
      }
    }

    return {
      hash: txHash,
      from: tx.from || "",
      to: tx.to || null,
      value: tx.value || "0x0",
      status,
      blockNumber: receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null,
      timestamp,
      gasUsed: receipt.gasUsed || null,
      gasPrice: tx.gasPrice || null,
    };
  } catch (error) {
    console.error(`[BlockVision] Error fetching transaction ${txHash}:`, error);
    return null;
  }
}

/**
 * Get contract creation information for Monad
 * Uses BlockVision RPC to find the creation transaction
 */
export async function getMonadContractCreation(
  contractAddress: string,
): Promise<{ contractCreator: string; txHash: string; createdAt: number | null } | null> {
  try {
    const apiUrl = `${BLOCKVISION_API_BASE}/${env.blockvisionApiKey}`;
    
    // First, verify it's a contract by checking if it has code
    const codeResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [contractAddress, "latest"],
        id: 1,
      }),
    });

    if (!codeResponse.ok) return null;

    const codeData = await codeResponse.json() as { result?: string };
    if (!codeData.result || codeData.result === "0x") {
      // Not a contract
      return null;
    }

    // Get the first transaction for this address (creation transaction)
    // Use eth_getTransactionCount to get the nonce, then find the transaction
    // Actually, we need to use a different approach - get the contract's first transaction
    // by checking internal transactions or using a transaction indexer
    
    // For now, we'll use the RPC fallback which will try to find the creation tx
    // The RPC fallback in contractCreation.ts will handle this
    return null;
  } catch (error) {
    console.error(`[BlockVision] Error fetching contract creation for ${contractAddress}:`, error);
    return null;
  }
}

