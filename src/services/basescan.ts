/**
 * Basescan API service for Base network
 * Used to get contract creation information
 */

import { env } from "../config";

const BASESCAN_API_BASE = "https://api.basescan.org/api";

// Cache creator addresses (they never change once a contract is deployed)
const creatorCache = new Map<string, ContractCreation>();

export interface ContractCreation {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
  createdAt?: number | null; // Timestamp in seconds
}

/**
 * Get contract creation information from Basescan API
 * Returns the creator address and transaction hash
 * Uses the transaction list to find the contract creation transaction
 */
export async function getContractCreation(
  contractAddress: string,
): Promise<ContractCreation | null> {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    
    // Check cache first (creator addresses never change)
    const cached = creatorCache.get(normalizedAddress);
    if (cached) {
      return cached;
    }

    // Build API key parameter (optional, but improves rate limits)
    const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";

    // Method 1: Try to get the contract creation transaction
    // Get the first transaction for this contract (which should be the creation transaction)
    const txListUrl = `${BASESCAN_API_BASE}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
    const txResponse = await fetch(txListUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (txResponse.ok) {
      const txData = (await txResponse.json()) as {
        status?: string;
        message?: string;
        result?: Array<{
          hash: string;
          from: string;
          to: string;
          contractAddress?: string;
          timeStamp?: string;
        }> | string;
      };

      // Check for API errors
      if (txData.status === "0" || (typeof txData.result === "string" && txData.result.includes("deprecated"))) {
        console.warn(`[Basescan] API error for ${contractAddress}: ${txData.message || txData.result}`);
        // Continue to fallback method
      } else if (txData.status === "1" && Array.isArray(txData.result) && txData.result.length > 0) {
        const firstTx = txData.result[0];
        // If the "to" field is empty, it's a contract creation transaction
        // Also check if contractAddress matches (for contracts created via factory)
        const isContractCreation = 
          !firstTx.to || 
          firstTx.to === "" || 
          firstTx.contractAddress?.toLowerCase() === normalizedAddress ||
          firstTx.to.toLowerCase() === normalizedAddress;
        
        if (isContractCreation) {
          const createdAt = firstTx.timeStamp ? parseInt(firstTx.timeStamp, 10) : null;
          const result = {
            contractAddress: contractAddress,
            contractCreator: firstTx.from,
            txHash: firstTx.hash,
            createdAt,
          };
          // Cache the result
          creatorCache.set(normalizedAddress, result);
          return result;
        }
      }
    }

    // Method 2: Try the contract creation endpoint (may be deprecated but worth trying)
    const url = `${BASESCAN_API_BASE}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}${apiKeyParam}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        result?: Array<{
          contractAddress: string;
          contractCreator: string;
          txHash: string;
        }> | string;
      };

      // Check for API errors
      if (data.status === "0" || (typeof data.result === "string" && data.result.includes("deprecated"))) {
        console.warn(`[Basescan] Contract creation endpoint error for ${contractAddress}: ${data.message || data.result}`);
        return null;
      }
      
      if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
        const apiResult = data.result[0];
        // Try to get timestamp from transaction
        const txUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getTransactionByHash&txhash=${apiResult.txHash}&tag=latest${apiKeyParam}`;
        let createdAt: number | null = null;
        try {
          const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
          if (txResponse.ok) {
            const txData = (await txResponse.json()) as { result?: { blockNumber?: string } };
            if (txData.result?.blockNumber) {
              const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${txData.result.blockNumber}&boolean=true${apiKeyParam}`;
              const blockResponse = await fetch(blockUrl, { headers: { Accept: "application/json" } });
              if (blockResponse.ok) {
                const blockData = (await blockResponse.json()) as { result?: { timestamp?: string } };
                if (blockData.result?.timestamp) {
                  createdAt = parseInt(blockData.result.timestamp, 16);
                }
              }
            }
          }
        } catch (error) {
          // Ignore timestamp fetch errors
        }
        const result = {
          contractAddress: apiResult.contractAddress,
          contractCreator: apiResult.contractCreator,
          txHash: apiResult.txHash,
          createdAt,
        };
        // Cache the result
        creatorCache.set(normalizedAddress, result);
        return result;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation from Basescan:", error);
    return null;
  }
}

