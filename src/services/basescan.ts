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
 * Get contract creation information using working Basescan endpoints
 * Returns the creator address and transaction hash
 * 
 * Uses RPC proxy endpoints and the getcontractcreation endpoint that still works
 * (even though other V1 endpoints are deprecated)
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

    // STEP 1: Try the getcontractcreation endpoint (this still works even though other V1 endpoints are deprecated)
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
          console.log(`[Basescan] Found creator via getcontractcreation for ${contractAddress}: ${result.contractCreator}`);
          return result;
        }
      }
    } catch (error) {
      console.warn(`[Basescan] Contract creation endpoint failed for ${contractAddress}, trying fallback:`, error);
    }

    // STEP 2: Fallback → Use logs to find creation transaction
    try {
      const logsUrl = `${BASESCAN_API_BASE}?module=logs&action=getLogs&address=${contractAddress}&fromBlock=1&toBlock=latest&page=1&offset=1${apiKeyParam}`;
      const logsResponse = await fetch(logsUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (logsResponse.ok) {
        const logsData = (await logsResponse.json()) as {
          status?: string;
          result?: Array<{
            transactionHash: string;
            blockNumber: string;
            timeStamp?: string;
            topics?: string[];
            address?: string;
          }>;
        };

        if (logsData.status === "1" && Array.isArray(logsData.result) && logsData.result.length > 0) {
          const firstLog = logsData.result[0];
          const txHash = firstLog.transactionHash;
          const createdAt = firstLog.timeStamp ? parseInt(firstLog.timeStamp, 10) : null;

          // Get the transaction receipt to find the creator
          const receiptUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}${apiKeyParam}`;
          const receiptResponse = await fetch(receiptUrl, { headers: { Accept: "application/json" } });

          if (receiptResponse.ok) {
            const receiptData = (await receiptResponse.json()) as { result?: { from?: string; blockNumber?: string } };
            if (receiptData.result?.from) {
              // Get timestamp from block if we don't have it
              let finalCreatedAt = createdAt;
              if (!finalCreatedAt && receiptData.result.blockNumber) {
                try {
                  const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${receiptData.result.blockNumber}&boolean=true${apiKeyParam}`;
                  const blockResponse = await fetch(blockUrl, { headers: { Accept: "application/json" } });
                  if (blockResponse.ok) {
                    const blockData = (await blockResponse.json()) as { result?: { timestamp?: string } };
                    if (blockData.result?.timestamp) {
                      finalCreatedAt = parseInt(blockData.result.timestamp, 16);
                    }
                  }
                } catch (error) {
                  // Ignore
                }
              }

              const result = {
                contractAddress: contractAddress,
                contractCreator: receiptData.result.from,
                txHash: txHash,
                createdAt: finalCreatedAt,
              };
              creatorCache.set(normalizedAddress, result);
              console.log(`[Basescan] Found creator via logs for ${contractAddress}: ${result.contractCreator}`);
              return result;
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Basescan] Logs method failed for ${contractAddress}:`, error);
    }

    // STEP 3: Fallback → Use RPC proxy to get transaction by hash
    // This requires knowing the transaction hash, so we'll try to get it from the contract's first log
    // or use eth_getCode to verify it's a contract first
    try {
      // Verify it's a contract
      const codeUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getCode&address=${contractAddress}&tag=latest${apiKeyParam}`;
      const codeResponse = await fetch(codeUrl, { headers: { Accept: "application/json" } });
      
      if (codeResponse.ok) {
        const codeData = (await codeResponse.json()) as { result?: string };
        if (codeData.result && codeData.result !== "0x") {
          // It's a contract, but we can't find the creation tx without more info
          // This fallback would need the transaction hash, which we don't have
          console.warn(`[Basescan] Contract verified but cannot find creation transaction for ${contractAddress}`);
        }
      }
    } catch (error) {
      console.error(`[Basescan] RPC proxy fallback failed for ${contractAddress}:`, error);
    }

    console.warn(`[Basescan] All methods failed to find creator for ${contractAddress}`);
    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation:", error);
    return null;
  }
}

/**
 * Detect factory address from contract logs
 * Scans event logs for known factory event signatures
 */
export async function detectFactoryFromLogs(
  contractAddress: string,
): Promise<string | null> {
  try {
    const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";
    
    // Get logs for the contract
    const logsUrl = `${BASESCAN_API_BASE}?module=logs&action=getLogs&address=${contractAddress}&fromBlock=1&toBlock=latest&page=1&offset=10${apiKeyParam}`;
    const logsResponse = await fetch(logsUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (logsResponse.ok) {
      const logsData = (await logsResponse.json()) as {
        status?: string;
        result?: Array<{
          topics?: string[];
          address?: string;
          transactionHash?: string;
        }>;
      };

      if (logsData.status === "1" && Array.isArray(logsData.result)) {
        // Known factory event signatures
        // TokenCreated(address,address) - Pump.fun Base
        // NewToken(address,address,address) - OpenToken
        // PairCreated(address,address,address) - Launchpad/BasePad
        // Factory address is usually in topics[1] or topics[2]
        
        for (const log of logsData.result) {
          if (log.topics && log.topics.length > 1) {
            // Check if this looks like a factory creation event
            // The factory address might be in the log's address field or in topics
            if (log.address && log.address.toLowerCase() !== contractAddress.toLowerCase()) {
              // This might be the factory address
              return log.address;
            }
            
            // Check topics for factory address
            // Topics are usually 32-byte hashes, but sometimes contain addresses
            for (let i = 1; i < log.topics.length; i++) {
              const topic = log.topics[i];
              // Addresses in topics are usually padded with zeros
              if (topic && topic.startsWith("0x000000000000000000000000")) {
                const address = "0x" + topic.slice(-40);
                // Basic validation - check if it looks like an address
                if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
                  return address;
                }
              }
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[Basescan] Failed to detect factory from logs for ${contractAddress}:`, error);
    return null;
  }
}

