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
 * Get contract creation information from Basescan API V2
 * Returns the creator address and transaction hash
 * Uses the new V2 API endpoint which works for factory-deployed contracts
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

    const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";
    
    // Method 1: Try V2 API endpoint (if it exists)
    try {
      const v2Url = `https://api.basescan.org/api/v2/contracts/${contractAddress}/creation?apikey=${env.basescanApiKey || ""}`;
      const v2Response = await fetch(v2Url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (v2Response.ok) {
        const responseText = await v2Response.text();
        let data: {
          status?: string;
          message?: string;
          result?: {
            contractAddress: string;
            creatorAddress: string;
            transactionHash: string;
            blockNumber: string;
          };
        } | null = null;
        
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          // Not JSON, V2 endpoint doesn't exist, continue to fallback
        }

        if (data && data.status === "1" && data.result) {
          // Get timestamp from block number
          let createdAt: number | null = null;
          try {
            const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${data.result.blockNumber}&boolean=true${apiKeyParam}`;
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

          const result = {
            contractAddress: data.result.contractAddress,
            contractCreator: data.result.creatorAddress,
            txHash: data.result.transactionHash,
            createdAt,
          };
          creatorCache.set(normalizedAddress, result);
          console.log(`[Basescan V2] Successfully fetched creator for ${contractAddress}: ${result.contractCreator}`);
          return result;
        }
      }
    } catch (error) {
      console.warn(`[Basescan] V2 endpoint failed for ${contractAddress}, trying fallback:`, error);
    }

    // Method 2: Use trace API to find contract creation
    // This works for factory-deployed contracts
    try {
      // Get the contract's bytecode to verify it exists
      const codeUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getCode&address=${contractAddress}&tag=latest${apiKeyParam}`;
      const codeResponse = await fetch(codeUrl, { headers: { Accept: "application/json" } });
      
      if (codeResponse.ok) {
        const codeData = (await codeResponse.json()) as { result?: string };
        if (codeData.result && codeData.result !== "0x") {
          // It's a contract, try to find creation via trace
          // Use trace_block with a recent block range, or use internal transactions
          
          // Try internal transactions first (these show contract creations)
          const internalTxUrl = `${BASESCAN_API_BASE}?module=account&action=txlistinternal&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
          const internalTxResponse = await fetch(internalTxUrl, { headers: { Accept: "application/json" } });
          
          if (internalTxResponse.ok) {
            const internalTxData = (await internalTxResponse.json()) as {
              status?: string;
              result?: Array<{
                hash: string;
                from: string;
                to: string;
                timeStamp?: string;
                blockNumber?: string;
              }>;
            };
            
            if (internalTxData.status === "1" && internalTxData.result && internalTxData.result.length > 0) {
              const firstInternalTx = internalTxData.result[0];
              const createdAt = firstInternalTx.timeStamp ? parseInt(firstInternalTx.timeStamp, 10) : null;
              
              // Get the actual transaction to find the factory and creator
              const txUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getTransactionByHash&txhash=${firstInternalTx.hash}&tag=latest${apiKeyParam}`;
              const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
              
              if (txResponse.ok) {
                const txData = (await txResponse.json()) as { result?: { from?: string; to?: string | null } };
                // The 'from' in the transaction is the creator, 'to' is the factory
                const creator = txData.result?.from || firstInternalTx.from;
                
                const result = {
                  contractAddress: contractAddress,
                  contractCreator: creator,
                  txHash: firstInternalTx.hash,
                  createdAt,
                };
                creatorCache.set(normalizedAddress, result);
                console.log(`[Basescan] Found creator via internal transactions for ${contractAddress}: ${result.contractCreator}`);
                return result;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Basescan] Trace/internal tx method failed for ${contractAddress}:`, error);
    }

    // Method 3: Try to get from transaction list (works for direct deployments, not factory)
    // This is a last resort
    try {
      const txListUrl = `${BASESCAN_API_BASE}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
      const txResponse = await fetch(txListUrl, { headers: { Accept: "application/json" } });
      
      if (txResponse.ok) {
        const txData = (await txResponse.json()) as {
          status?: string;
          result?: Array<{
            hash: string;
            from: string;
            to: string;
            timeStamp?: string;
          }>;
        };
        
        if (txData.status === "1" && Array.isArray(txData.result) && txData.result.length > 0) {
          const firstTx = txData.result[0];
          // Check if this looks like a creation transaction
          if (!firstTx.to || firstTx.to === "" || firstTx.to.toLowerCase() === normalizedAddress) {
            const createdAt = firstTx.timeStamp ? parseInt(firstTx.timeStamp, 10) : null;
            const result = {
              contractAddress: contractAddress,
              contractCreator: firstTx.from,
              txHash: firstTx.hash,
              createdAt,
            };
            creatorCache.set(normalizedAddress, result);
            console.log(`[Basescan] Found creator via txlist for ${contractAddress}: ${result.contractCreator}`);
            return result;
          }
        }
      }
    } catch (error) {
      console.error(`[Basescan] Txlist method failed for ${contractAddress}:`, error);
    }

    console.warn(`[Basescan] All methods failed to find creator for ${contractAddress}`);
    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation from Basescan V2:", error);
    return null;
  }
}

