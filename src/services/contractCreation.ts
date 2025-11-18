/**
 * Multi-chain contract creation service
 * Supports Base, BSC, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, Fantom, Mantle
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
 * Get RPC URL for a chain
 */
function getRpcUrl(chainId: string): string | null {
  const rpcMap: Record<string, string> = {
    "5000": "https://rpc.mantle.xyz",
    "mantle": "https://rpc.mantle.xyz",
    "1": "https://eth.llamarpc.com",
    "eth": "https://eth.llamarpc.com",
    "ethereum": "https://eth.llamarpc.com",
    "8453": "https://mainnet.base.org",
    "base": "https://mainnet.base.org",
    "137": "https://polygon-rpc.com",
    "polygon": "https://polygon-rpc.com",
    "42161": "https://arb1.arbitrum.io/rpc",
    "arbitrum": "https://arb1.arbitrum.io/rpc",
    "10": "https://mainnet.optimism.io",
    "optimism": "https://mainnet.optimism.io",
    "43114": "https://api.avax.network/ext/bc/C/rpc",
    "avalanche": "https://api.avax.network/ext/bc/C/rpc",
    "56": "https://bsc-dataseed.binance.org",
    "bsc": "https://bsc-dataseed.binance.org",
    "250": "https://rpc.ftm.tools",
    "fantom": "https://rpc.ftm.tools",
  };
  return rpcMap[chainId.toLowerCase()] ?? null;
}

/**
 * Get contract creation via RPC (for chains without explorer APIs)
 */
async function getContractCreationViaRPC(
  contractAddress: string,
  chainId: string,
): Promise<ContractCreation | null> {
  try {
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) {
      console.warn(`No RPC URL available for chain: ${chainId}`);
      return null;
    }

    // First, verify it's a contract by checking if it has code
    const codeResponse = await fetch(rpcUrl, {
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

    const codeData = (await codeResponse.json()) as { result?: string };
    if (!codeData.result || codeData.result === "0x") {
      // Not a contract
      return null;
    }

    // For Mantle, try to use a third-party indexing service or the explorer's GraphQL API
    // Since direct RPC doesn't easily provide creation tx without the hash,
    // we'll try using Blockscout-style API if available
    if (chainId.toLowerCase() === "5000" || chainId.toLowerCase() === "mantle") {
      // Try Mantle Blockscout API (many EVM explorers use Blockscout)
      try {
        const blockscoutUrl = `https://explorer.mantle.xyz/api?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}`;
        const response = await fetch(blockscoutUrl, {
          headers: { Accept: "application/json" },
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

          if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
            const result = data.result[0];
            // Get timestamp from transaction
            let createdAt: number | null = null;
            try {
              const txRpcResponse = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  method: "eth_getTransactionByHash",
                  params: [result.txHash],
                  id: 1,
                }),
              });
              if (txRpcResponse.ok) {
                const txData = (await txRpcResponse.json()) as { result?: { blockNumber?: string } };
                if (txData.result?.blockNumber) {
                  const blockResponse = await fetch(rpcUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      jsonrpc: "2.0",
                      method: "eth_getBlockByNumber",
                      params: [txData.result.blockNumber, false],
                      id: 1,
                    }),
                  });
                  if (blockResponse.ok) {
                    const blockData = (await blockResponse.json()) as { result?: { timestamp?: string } };
                    if (blockData.result?.timestamp) {
                      createdAt = parseInt(blockData.result.timestamp, 16);
                    }
                  }
                }
              }
            } catch (error) {
              // Ignore timestamp errors
            }

            const cacheKey = `${chainId}:${contractAddress.toLowerCase()}`;
            const contractCreation: ContractCreation = {
              contractAddress: result.contractAddress,
              contractCreator: result.contractCreator,
              txHash: result.txHash,
              chainId: chainId,
              createdAt,
            };
            creatorCache.set(cacheKey, contractCreation);
            return contractCreation;
          }
        }
      } catch (error) {
        console.warn(`[ContractCreation] Mantle Blockscout API failed:`, error);
      }
    }

    // For other chains without explorer APIs, return null
    return null;
  } catch (error) {
    console.error(`[ContractCreation] RPC fallback failed for ${chainId}:`, error);
    return null;
  }
}

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
    "5000": "https://explorer.mantle.xyz/api", // Try Mantle explorer API
    "mantle": "https://explorer.mantle.xyz/api",
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
      // Try RPC fallback for chains without explorer APIs (e.g., Mantle)
      return await getContractCreationViaRPC(contractAddress, chainId);
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

    // If the API returns 404 or the endpoint doesn't exist, try RPC fallback for Mantle
    if (!txResponse.ok && (chainId.toLowerCase() === "5000" || chainId.toLowerCase() === "mantle")) {
      console.log(`[ContractCreation] Mantle explorer API returned ${txResponse.status}, trying RPC fallback`);
      return await getContractCreationViaRPC(contractAddress, chainId);
    }

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
        // For factory-deployed contracts, the first transaction's "to" is the factory,
        // and the contractAddress field should match our contract
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
          console.log(`[ContractCreation] ✅ Found creator for ${contractAddress} on ${chainId}: ${firstTx.from}`);
          return result;
        } else {
          console.warn(`[ContractCreation] First transaction for ${contractAddress} on ${chainId} doesn't appear to be creation tx. to=${firstTx.to}, contractAddress=${firstTx.contractAddress}`);
        }
      } else {
        console.warn(`[ContractCreation] No transactions found for ${contractAddress} on ${chainId}. Status: ${txData.status}, Result type: ${typeof txData.result}`);
      }
    } else {
      console.warn(`[ContractCreation] API request failed for ${contractAddress} on ${chainId}: ${txResponse.status} ${txResponse.statusText}`);
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
        console.log(`[ContractCreation] ✅ Found creator via contract creation endpoint for ${contractAddress} on ${chainId}: ${apiResult.contractCreator}`);
        return result;
      } else if (data.status === "0") {
        console.warn(`[ContractCreation] Contract creation endpoint returned status 0 for ${contractAddress} on ${chainId}: ${data.message || "Unknown error"}`);
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
      // For Mantle, try Blockscout API
      if (chainId.toLowerCase() === "5000" || chainId.toLowerCase() === "mantle") {
        try {
          const blockscoutUrl = `https://explorer.mantle.xyz/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc`;
          const response = await fetch(blockscoutUrl, {
            headers: { Accept: "application/json" },
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

            if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
              const firstTx = data.result[0];
              return {
                from: firstTx.from,
                to: firstTx.to || null,
                hash: firstTx.hash,
              };
            }
          }
        } catch (error) {
          console.warn(`[ContractCreation] Mantle Blockscout API failed for getContractCreationTx:`, error);
        }
      }
      return null;
    }

    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";
    const url = `${apiBase}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    // If the API returns 404 or the endpoint doesn't exist, try Blockscout for Mantle
    if (!response.ok && (chainId.toLowerCase() === "5000" || chainId.toLowerCase() === "mantle")) {
      try {
        const blockscoutUrl = `https://explorer.mantle.xyz/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc`;
        const blockscoutResponse = await fetch(blockscoutUrl, {
          headers: { Accept: "application/json" },
        });

        if (blockscoutResponse.ok) {
          const data = (await blockscoutResponse.json()) as {
            status?: string;
            message?: string;
            result?: Array<{
              hash: string;
              from: string;
              to: string;
            }> | string;
          };

          if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
            const firstTx = data.result[0];
            return {
              from: firstTx.from,
              to: firstTx.to || null,
              hash: firstTx.hash,
            };
          }
        }
      } catch (error) {
        console.warn(`[ContractCreation] Mantle Blockscout fallback failed:`, error);
      }
      return null;
    }

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


