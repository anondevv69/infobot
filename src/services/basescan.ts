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
 * Get contract creation information using Basescan V2 API
 * Returns the creator address and transaction hash
 * 
 * Uses the new V2 endpoints that replace deprecated V1 endpoints:
 * - /api/v2/contracts/{address}/creation for creator info
 * - /api/v2/accounts/{address}/transactions for transaction history
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

    const apiKeyParam = env.basescanApiKey ? `?apikey=${env.basescanApiKey}` : "";

    // STEP 1: Use the new V2 contract creation endpoint
    try {
      const v2Url = `https://api.basescan.org/api/v2/contracts/${contractAddress}/creation${apiKeyParam}`;
      const v2Response = await fetch(v2Url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (v2Response.ok) {
        const v2Data = (await v2Response.json()) as {
          contractCreator?: string;
          txHash?: string;
          blockNumber?: string;
          timestamp?: string | number;
        };

        if (v2Data.contractCreator && v2Data.txHash) {
          let createdAt: number | null = null;
          
          // Get timestamp if available
          if (v2Data.timestamp) {
            createdAt = typeof v2Data.timestamp === "string" 
              ? parseInt(v2Data.timestamp, 10) 
              : v2Data.timestamp;
          } else if (v2Data.blockNumber) {
            // Fallback: get timestamp from block number
            try {
              const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${v2Data.blockNumber}&boolean=true${apiKeyParam.replace("?", "&")}`;
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
          }

          const result = {
            contractAddress: contractAddress,
            contractCreator: v2Data.contractCreator,
            txHash: v2Data.txHash,
            createdAt,
          };
          creatorCache.set(normalizedAddress, result);
          console.log(`[Basescan V2] Found creator for ${contractAddress}: ${result.contractCreator}`);
          return result;
        }
      } else {
        const errorText = await v2Response.text().catch(() => "");
        console.warn(`[Basescan V2] HTTP ${v2Response.status} for ${contractAddress}: ${errorText}`);
      }
    } catch (error) {
      console.warn(`[Basescan V2] Contract creation endpoint failed for ${contractAddress}, trying fallback:`, error);
    }

    // STEP 2: Fallback → Get first transaction from V2 transactions endpoint
    try {
      const v2TxUrl = `https://api.basescan.org/api/v2/accounts/${contractAddress}/transactions?limit=1&startblock=0${apiKeyParam.replace("?", "&")}`;
      const v2TxResponse = await fetch(v2TxUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (v2TxResponse.ok) {
        const v2TxData = (await v2TxResponse.json()) as {
          transactions?: Array<{
            hash: string;
            from: string;
            to: string | null;
            timestamp?: string | number;
            blockNumber?: string;
          }>;
        };

        if (v2TxData.transactions && v2TxData.transactions.length > 0) {
          const creationTx = v2TxData.transactions[0];
          const createdAt = creationTx.timestamp 
            ? (typeof creationTx.timestamp === "string" ? parseInt(creationTx.timestamp, 10) : creationTx.timestamp)
            : null;

          // If "to" is empty → direct EOA deployment
          if (!creationTx.to || creationTx.to === "") {
            const result = {
              contractAddress: contractAddress,
              contractCreator: creationTx.from,
              txHash: creationTx.hash,
              createdAt,
            };
            creatorCache.set(normalizedAddress, result);
            console.log(`[Basescan V2] Found creator via first-tx-direct for ${contractAddress}: ${result.contractCreator}`);
            return result;
          }

          // Factory deployment: "to" is the factory, "from" is the creator (transaction origin)
          const result = {
            contractAddress: contractAddress,
            contractCreator: creationTx.from, // Origin wallet (the one who initiated the factory call)
            txHash: creationTx.hash,
            createdAt,
          };
          creatorCache.set(normalizedAddress, result);
          console.log(`[Basescan V2] Found creator via factory-deploy for ${contractAddress}: ${result.contractCreator} (factory: ${creationTx.to})`);
          return result;
        }
      }
    } catch (error) {
      console.error(`[Basescan V2] Transactions endpoint failed for ${contractAddress}:`, error);
    }

    console.warn(`[Basescan V2] All methods failed to find creator for ${contractAddress}`);
    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation:", error);
    return null;
  }
}

