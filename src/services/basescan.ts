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
 * Get contract creation information using a reliable fallback pipeline
 * Returns the creator address and transaction hash
 * 
 * Flow:
 * 1. Try contract creation endpoint
 * 2. Fallback to first transaction in txlist
 * 3. Use internal transactions for factory deployments
 * 4. Use transaction origin (from field) as creator
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

    // STEP 1: Try the normal BaseScan "contract creator" endpoint
    try {
      const createUrl = `${BASESCAN_API_BASE}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}${apiKeyParam}`;
      const createResponse = await fetch(createUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (createResponse.ok) {
        const createData = (await createResponse.json()) as {
          status?: string;
          message?: string;
          result?: Array<{
            contractAddress: string;
            contractCreator: string;
            txHash: string;
            blockNumber?: string;
            timestamp?: string;
          }> | string;
        };

        // Check if it's a deprecated message
        if (typeof createData.result === "string" && createData.result.includes("deprecated")) {
          console.warn(`[Basescan] Contract creation endpoint deprecated for ${contractAddress}`);
        } else if (createData.status === "1" && Array.isArray(createData.result) && createData.result.length > 0) {
          const creation = createData.result[0];
          let createdAt: number | null = null;
          
          // Get timestamp if available
          if (creation.timestamp) {
            createdAt = parseInt(creation.timestamp, 10);
          } else if (creation.blockNumber) {
            try {
              const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${creation.blockNumber}&boolean=true${apiKeyParam}`;
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
            contractAddress: creation.contractAddress,
            contractCreator: creation.contractCreator,
            txHash: creation.txHash,
            createdAt,
          };
          creatorCache.set(normalizedAddress, result);
          console.log(`[Basescan] Found creator via contract creation endpoint for ${contractAddress}: ${result.contractCreator}`);
          return result;
        }
      }
    } catch (error) {
      console.warn(`[Basescan] Contract creation endpoint failed for ${contractAddress}, trying fallback:`, error);
    }

    // STEP 2: Fallback → Get first transaction from txlist
    // The first transaction is always the creation transaction unless deployed via factory
    try {
      const txListUrl = `${BASESCAN_API_BASE}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
      const txListResponse = await fetch(txListUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (txListResponse.ok) {
        const txListData = (await txListResponse.json()) as {
          status?: string;
          message?: string;
          result?: Array<{
            hash: string;
            from: string;
            to: string;
            timeStamp?: string;
            contractAddress?: string;
          }> | string;
        };

        // Check if endpoint is deprecated
        if (typeof txListData.result === "string" && txListData.result.includes("deprecated")) {
          console.warn(`[Basescan] Txlist endpoint deprecated for ${contractAddress}, trying next method`);
        } else if (txListData.status === "1" && Array.isArray(txListData.result) && txListData.result.length > 0) {
          const creationTx = txListData.result[0];
          const createdAt = creationTx.timeStamp ? parseInt(creationTx.timeStamp, 10) : null;

          // If "to" is empty → direct EOA deployment
          if (!creationTx.to || creationTx.to === "") {
            const result = {
              contractAddress: contractAddress,
              contractCreator: creationTx.from,
              txHash: creationTx.hash,
              createdAt,
            };
            creatorCache.set(normalizedAddress, result);
            console.log(`[Basescan] Found creator via first-tx-direct for ${contractAddress}: ${result.contractCreator}`);
            return result;
          }

          // STEP 3 + 4: Factory deployment
          // The "to" field is the factory contract
          // The "from" field is the transaction origin (the one who paid gas) - this is the true creator
          const result = {
            contractAddress: contractAddress,
            contractCreator: creationTx.from, // Origin wallet (the one who initiated the factory call)
            txHash: creationTx.hash,
            createdAt,
          };
          creatorCache.set(normalizedAddress, result);
          console.log(`[Basescan] Found creator via factory-deploy for ${contractAddress}: ${result.contractCreator} (factory: ${creationTx.to})`);
          return result;
        }
      }
    } catch (error) {
      console.error(`[Basescan] Txlist method failed for ${contractAddress}:`, error);
    }

    // STEP 3 (Alternative): Try internal transactions if txlist didn't work
    // This can help for contracts that don't show up in regular txlist
    try {
      const internalTxUrl = `${BASESCAN_API_BASE}?module=account&action=txlistinternal&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
      const internalTxResponse = await fetch(internalTxUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (internalTxResponse.ok) {
        const internalTxData = (await internalTxResponse.json()) as {
          status?: string;
          result?: Array<{
            hash: string;
            from: string;
            to: string;
            timeStamp?: string;
            type?: string;
          }>;
        };

        if (internalTxData.status === "1" && Array.isArray(internalTxData.result) && internalTxData.result.length > 0) {
          const firstInternalTx = internalTxData.result[0];
          const createdAt = firstInternalTx.timeStamp ? parseInt(firstInternalTx.timeStamp, 10) : null;

          // Get the actual transaction to find the origin (creator)
          const txUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getTransactionByHash&txhash=${firstInternalTx.hash}&tag=latest${apiKeyParam}`;
          const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });

          if (txResponse.ok) {
            const txData = (await txResponse.json()) as { result?: { from?: string; to?: string | null } };
            // The 'from' in the transaction is the origin (creator), 'to' is the factory
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
    } catch (error) {
      console.error(`[Basescan] Internal tx method failed for ${contractAddress}:`, error);
    }

    console.warn(`[Basescan] All methods failed to find creator for ${contractAddress}`);
    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation:", error);
    return null;
  }
}

