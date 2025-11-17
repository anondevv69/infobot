/**
 * Multi-chain contract creation service
 * Supports Base, BSC, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, Fantom
 */

interface ContractCreation {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
  chainId: string;
  createdAt?: number | null; // Timestamp in seconds
}

// Cache creator addresses (they never change once a contract is deployed)
const creatorCache = new Map<string, ContractCreation>();

/**
 * Get the API base URL for a given chain
 */
function getExplorerApiBase(chainId: string): string | null {
  const apiMap: Record<string, string> = {
    "1": "https://api.etherscan.io/api",
    "eth": "https://api.etherscan.io/api",
    "ethereum": "https://api.etherscan.io/api",
    "56": "https://api.bscscan.com/api",
    "bsc": "https://api.bscscan.com/api",
    "137": "https://api.polygonscan.com/api",
    "polygon": "https://api.polygonscan.com/api",
    "42161": "https://api.arbiscan.io/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "10": "https://api-optimistic.etherscan.io/api",
    "optimism": "https://api-optimistic.etherscan.io/api",
    "8453": "https://api.basescan.org/api",
    "base": "https://api.basescan.org/api",
    "43114": "https://api.snowtrace.io/api",
    "avalanche": "https://api.snowtrace.io/api",
    "250": "https://api.ftmscan.com/api",
    "fantom": "https://api.ftmscan.com/api",
  };
  return apiMap[chainId.toLowerCase()] ?? null;
}

/**
 * Get contract creation information for any EVM chain
 */
export async function getContractCreation(
  contractAddress: string,
  chainId: string,
  apiKey?: string | null,
): Promise<ContractCreation | null> {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    const cacheKey = `${chainId}:${normalizedAddress}`;
    
    // Check cache first (creator addresses never change)
    const cached = creatorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // For Base network, use the new V2 API endpoint
    if (chainId.toLowerCase() === "base" || chainId === "8453") {
      const apiKeyParam = apiKey ? `?apikey=${apiKey}` : "";
      const url = `https://api.basescan.org/api/v2/contracts/${contractAddress}/creation${apiKeyParam}`;
      
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          status?: string;
          message?: string;
          result?: {
            contractAddress: string;
            creatorAddress: string;
            transactionHash: string;
            blockNumber: string;
          };
        };

        if (data.status === "1" && data.result) {
          // Get timestamp from block number
          let createdAt: number | null = null;
          try {
            const blockUrl = `https://api.basescan.org/api?module=proxy&action=eth_getBlockByNumber&tag=${data.result.blockNumber}&boolean=true${apiKey ? `&apikey=${apiKey}` : ""}`;
            const blockResponse = await fetch(blockUrl, { headers: { Accept: "application/json" } });
            if (blockResponse.ok) {
              const blockData = (await blockResponse.json()) as { result?: { timestamp?: string } };
              if (blockData.result?.timestamp) {
                createdAt = parseInt(blockData.result.timestamp, 16);
              }
            }
          } catch (error) {
            // Ignore timestamp fetch errors
          }

          const result: ContractCreation = {
            contractAddress: data.result.contractAddress,
            contractCreator: data.result.creatorAddress,
            txHash: data.result.transactionHash,
            chainId: chainId,
            createdAt,
          };
          // Cache the result
          creatorCache.set(cacheKey, result);
          return result;
        }
      }
      // If V2 fails, continue to fallback methods below
    }

    const apiBase = getExplorerApiBase(chainId);
    if (!apiBase) {
      console.warn(`No explorer API available for chain: ${chainId}`);
      return null;
    }

    // Build API key parameter (optional, but improves rate limits)
    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";

    // Method 1: Try to get the contract creation transaction
    // Get the first transaction for this contract (which should be the creation transaction)
    // NOTE: This doesn't work for factory-deployed contracts on Base, but works for other chains
    const txListUrl = `${apiBase}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
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
        console.warn(`[ContractCreation] API error for ${contractAddress} on ${chainId}: ${txData.message || txData.result}`);
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
          const result: ContractCreation = {
            contractAddress: contractAddress,
            contractCreator: firstTx.from,
            txHash: firstTx.hash,
            chainId: chainId,
            createdAt,
          };
          // Cache the result
          creatorCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Method 2: Try the contract creation endpoint (may be deprecated but worth trying for non-Base chains)
    const url = `${apiBase}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}${apiKeyParam}`;
    
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
        console.warn(`[ContractCreation] Contract creation endpoint error for ${contractAddress} on ${chainId}: ${data.message || data.result}`);
        return null;
      }
      
      if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
        const apiResult = data.result[0];
        // Try to get timestamp from transaction
        let createdAt: number | null = null;
        try {
          const txUrl = `${apiBase}?module=proxy&action=eth_getTransactionByHash&txhash=${apiResult.txHash}&tag=latest${apiKeyParam}`;
          const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
          if (txResponse.ok) {
            const txData = (await txResponse.json()) as { result?: { blockNumber?: string } };
            if (txData.result?.blockNumber) {
              const blockUrl = `${apiBase}?module=proxy&action=eth_getBlockByNumber&tag=${txData.result.blockNumber}&boolean=true${apiKeyParam}`;
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
        const result: ContractCreation = {
          contractAddress: apiResult.contractAddress,
          contractCreator: apiResult.contractCreator,
          txHash: apiResult.txHash,
          chainId: chainId,
          createdAt,
        };
        // Cache the result
        creatorCache.set(cacheKey, result);
        return result;
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch contract creation for chain ${chainId}:`, error);
    return null;
  }
}

/**
 * Get contract creation transaction to detect factory
 * Returns the transaction that created the contract
 */
export async function getContractCreationTx(
  contractAddress: string,
  chainId: string,
  apiKey?: string | null,
): Promise<{ from: string; to: string | null; hash: string } | null> {
  try {
    const apiBase = getExplorerApiBase(chainId);
    if (!apiBase) {
      return null;
    }

    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";
    const url = `${apiBase}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
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
          hash: string;
          from: string;
          to: string;
        }> | string;
      };

      // Check for API errors
      if (data.status === "0" || (typeof data.result === "string" && data.result.includes("deprecated"))) {
        console.warn(`[ContractCreation] Transaction list error for ${contractAddress} on ${chainId}: ${data.message || data.result}`);
        return null;
      }
      
      if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
        const firstTx = data.result[0];
        // If "to" is empty, it's a direct contract creation
        // Otherwise, "to" is the factory address
        return {
          from: firstTx.from,
          to: firstTx.to || null,
          hash: firstTx.hash,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch contract creation tx for chain ${chainId}:`, error);
    return null;
  }
}

