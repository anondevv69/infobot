/**
 * MonadScan API service for Monad chain
 * Uses MonadScan API (Etherscan-compatible) for all Monad chain operations
 */

const MONADSCAN_API_BASE = "https://monadscan.com/api";

// Monad chain ID is 5001 (based on common EVM chain ID patterns)
export const MONAD_CHAIN_ID = 5001;

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
 * Get account information from MonadScan API
 */
export async function getMonadAccountInfo(
  address: string,
): Promise<BlockVisionAccountInfo | null> {
  // Use MonadScan API (Etherscan-compatible) exclusively
  return await getMonadAccountInfoViaMonadScan(address);
}

/**
 * Get account info via MonadScan API (Etherscan-compatible)
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

    // Fallback: Check if it's a contract by getting code via MonadScan RPC proxy
    const codeUrl = `${MONADSCAN_API_BASE}?module=proxy&action=eth_getCode&address=${address}&tag=latest`;
    const codeResponse = await fetch(codeUrl, {
      headers: {
        Accept: "application/json",
      },
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
    console.error(`[MonadScan] Failed to get account info for ${address}:`, error);
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
    console.error(`[MonadScan] Error fetching token info for ${contractAddress}:`, error);
    return null;
  }
}

/**
 * Get transaction information from MonadScan API
 */
export async function getMonadTransaction(
  txHash: string,
): Promise<BlockVisionTransaction | null> {
  try {
    // Use MonadScan API (Etherscan-compatible) to get transaction
    const txInfoUrl = `${MONADSCAN_API_BASE}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}`;
    const txResponse = await fetch(txInfoUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!txResponse.ok) {
      return null;
    }

    const txData = await txResponse.json() as { result?: BlockVisionTransaction; error?: any };
    if (txData.error || !txData.result) {
      return null;
    }

    const tx = txData.result;

    // Get receipt
    const receiptUrl = `${MONADSCAN_API_BASE}?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}`;
    const receiptResponse = await fetch(receiptUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!receiptResponse.ok) {
      return null;
    }

    const receiptData = await receiptResponse.json() as { result?: { status?: string; blockNumber?: string; gasUsed?: string }; error?: any };
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

    // Get block timestamp from block info
    let timestamp: number | null = null;
    if (receipt.blockNumber) {
      try {
        const blockUrl = `${MONADSCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${receipt.blockNumber}&boolean=false`;
        const blockResponse = await fetch(blockUrl, {
          headers: {
            Accept: "application/json",
          },
        });

        if (blockResponse.ok) {
          const blockData = await blockResponse.json() as { result?: { timestamp?: string } };
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
      gasUsed: receipt.gasUsed || undefined,
      gasPrice: tx.gasPrice || undefined,
    };
  } catch (error) {
    console.error(`[MonadScan] Error fetching transaction ${txHash}:`, error);
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
    
    // First, verify it's a contract by checking if it has code via MonadScan RPC proxy
    const codeUrl = `${MONADSCAN_API_BASE}?module=proxy&action=eth_getCode&address=${contractAddress}&tag=latest`;
    const codeResponse = await fetch(codeUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (codeResponse.ok) {
      const codeData = await codeResponse.json() as { result?: string; error?: any };
      if (codeData.error || !codeData.result || codeData.result === "0x") {
        // Not a contract
        return null;
      }
    }

    // Use MonadScan API (Etherscan-compatible) to get the first transaction
    const txListUrl = `${MONADSCAN_API_BASE}?module=account&action=txlist&address=${normalizedAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc`;
    
    const txResponse = await fetch(txListUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!txResponse.ok) {
      console.warn(`[MonadScan] API request failed for ${contractAddress}: ${txResponse.status} ${txResponse.statusText}`);
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
      console.warn(`[MonadScan] API error for ${contractAddress}: ${txData.message || txData.result}`);
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
        console.warn(`[MonadScan] First transaction for ${contractAddress} on Monad doesn't appear to be creation tx. to=${firstTx.to}, contractAddress=${firstTx.contractAddress}`);
      }
    } else {
      console.warn(`[MonadScan] No transactions found for ${contractAddress} on Monad. Status: ${txData.status}, Result type: ${typeof txData.result}`);
    }

    return null;
  } catch (error) {
    console.error(`[MonadScan] Error fetching contract creation for ${contractAddress}:`, error);
    return null;
  }
}

