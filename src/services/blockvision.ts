/**
 * BlockVision API service for Monad chain
 * Documentation: https://docs.blockvision.org/reference/monad-indexing-api
 */

import { env } from "../config";

const BLOCKVISION_API_BASE = "https://monad-mainnet.blockvision.org/v1";
const MONADSCAN_API_BASE = "https://monadscan.com/api";

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
    // Try BlockVision API first
    const apiUrl = `${BLOCKVISION_API_BASE}/${env.blockvisionApiKey}`;
    
    // Get account balance
    const balanceResponse = await fetch(`${apiUrl}/eth_getBalance?address=${address}&tag=latest`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!balanceResponse.ok) {
      console.warn(`[BlockVision] Balance check failed for ${address}: ${balanceResponse.status} ${balanceResponse.statusText}`);
      // Fallback to MonadScan API (Etherscan-compatible)
      return await getMonadAccountInfoViaMonadScan(address);
    }

    const balanceData = await balanceResponse.json();
    if (balanceData.error) {
      console.warn(`[BlockVision] Balance API error for ${address}:`, balanceData.error);
      return await getMonadAccountInfoViaMonadScan(address);
    }
    
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
      if (txCountData.result && !txCountData.error) {
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
      if (codeData.result && codeData.result !== "0x" && !codeData.error) {
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
    // Fallback to MonadScan API
    return await getMonadAccountInfoViaMonadScan(address);
  }
}

/**
 * Fallback: Get account info via MonadScan API (Etherscan-compatible)
 */
async function getMonadAccountInfoViaMonadScan(
  address: string,
): Promise<BlockVisionAccountInfo | null> {
  try {
    // MonadScan uses Etherscan-compatible API
    const monadScanApiUrl = "https://monadscan.com/api";
    
    // Get token info (this will tell us if it's a contract and get token details)
    const tokenInfoUrl = `${monadScanApiUrl}?module=token&action=tokeninfo&contractaddress=${address}`;
    const tokenInfoResponse = await fetch(tokenInfoUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (tokenInfoResponse.ok) {
      const tokenData = await tokenInfoResponse.json() as {
        status?: string;
        message?: string;
        result?: {
          contractAddress?: string;
          tokenName?: string;
          tokenSymbol?: string;
          decimals?: string;
          totalSupply?: string;
        } | string;
      };

      // If we get token info, it's definitely a contract
      if (tokenData.status === "1" && typeof tokenData.result === "object" && tokenData.result) {
        return {
          address,
          balance: "0x0", // We don't have balance from token info endpoint
          transactionCount: 0, // We don't have tx count from token info endpoint
          isContract: true,
        };
      }
    }

    // Fallback: Check if it's a contract by getting code via RPC
    // Use public Monad RPC endpoint
    const rpcUrl = "https://monad-mainnet.blockvision.org/v1";
    const codeResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [address, "latest"],
        id: 1,
      }),
    });

    if (codeResponse.ok) {
      const codeData = await codeResponse.json() as { result?: string; error?: any };
      if (codeData.result && codeData.result !== "0x" && !codeData.error) {
        return {
          address,
          balance: "0x0",
          transactionCount: 0,
          isContract: true,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`[BlockVision] MonadScan fallback failed for ${address}:`, error);
    return null;
  }
}

/**
 * Get token info from MonadScan API (Etherscan-compatible)
 * This gets token name, symbol, decimals, totalSupply directly from MonadScan
 * Reference: https://docs.etherscan.io/api-reference/endpoint/tokeninfo#get-token-info-by-contractaddress
 */
export async function getMonadTokenInfo(
  contractAddress: string,
): Promise<{ name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null } | null> {
  try {
    const tokenInfoUrl = `${MONADSCAN_API_BASE}?module=token&action=tokeninfo&contractaddress=${contractAddress}`;
    const response = await fetch(tokenInfoUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      status?: string;
      message?: string;
      result?: {
        contractAddress?: string;
        tokenName?: string;
        tokenSymbol?: string;
        decimals?: string;
        totalSupply?: string;
      } | string;
    };

    if (data.status === "1" && typeof data.result === "object" && data.result) {
      return {
        name: data.result.tokenName || null,
        symbol: data.result.tokenSymbol || null,
        decimals: data.result.decimals ? parseInt(data.result.decimals, 10) : null,
        totalSupply: data.result.totalSupply || null,
      };
    }

    return null;
  } catch (error) {
    console.error(`[BlockVision] Error fetching token info for ${contractAddress}:`, error);
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
 * Uses MonadScan API (Etherscan-compatible) to find the creation transaction
 */
export async function getMonadContractCreation(
  contractAddress: string,
): Promise<{ contractCreator: string; txHash: string; createdAt: number | null } | null> {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    
    // First, verify it's a contract by checking if it has code
    const apiUrl = `${BLOCKVISION_API_BASE}/${env.blockvisionApiKey}`;
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

    // Use MonadScan API (Etherscan-compatible) to get the first transaction
    // MonadScan uses the same API format as Etherscan/Basescan
    const monadScanApiUrl = "https://monadscan.com/api";
    const txListUrl = `${monadScanApiUrl}?module=account&action=txlist&address=${normalizedAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc`;
    
    const txResponse = await fetch(txListUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!txResponse.ok) {
      console.warn(`[BlockVision] MonadScan API request failed for ${contractAddress}: ${txResponse.status} ${txResponse.statusText}`);
      return null;
    }

    const txData = await txResponse.json() as {
      status?: string;
      message?: string;
      result?: Array<{
        hash: string;
        from: string;
        to: string | null;
        timeStamp: string;
        contractAddress?: string;
      }> | string;
    };

    // Check for API errors
    if (txData.status === "0" || (typeof txData.result === "string" && txData.result.includes("deprecated"))) {
      console.warn(`[BlockVision] MonadScan API error for ${contractAddress}: ${txData.message || txData.result}`);
      return null;
    }

    if (txData.status === "1" && Array.isArray(txData.result) && txData.result.length > 0) {
      const firstTx = txData.result[0];
      
      // Check if this is the creation transaction
      // For direct contract creation: to is null/empty
      // For factory-deployed contracts: contractAddress field matches our contract
      const isContractCreation = 
        !firstTx.to || 
        firstTx.to === "" || 
        firstTx.contractAddress?.toLowerCase() === normalizedAddress ||
        firstTx.to.toLowerCase() === normalizedAddress;

      if (isContractCreation) {
        const createdAt = firstTx.timeStamp ? parseInt(firstTx.timeStamp, 10) : null;
        
        // For factory-deployed contracts, the deployer is the transaction sender (from)
        // The factory address is in the "to" field
        return {
          contractCreator: firstTx.from.toLowerCase(),
          txHash: firstTx.hash,
          createdAt,
        };
      } else {
        console.warn(`[BlockVision] First transaction for ${contractAddress} on Monad doesn't appear to be creation tx. to=${firstTx.to}, contractAddress=${firstTx.contractAddress}`);
      }
    } else {
      console.warn(`[BlockVision] No transactions found for ${contractAddress} on Monad. Status: ${txData.status}, Result type: ${typeof txData.result}`);
    }

    return null;
  } catch (error) {
    console.error(`[BlockVision] Error fetching contract creation for ${contractAddress}:`, error);
    return null;
  }
}

