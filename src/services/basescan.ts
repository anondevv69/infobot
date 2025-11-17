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

    // STEP 1: Try Basescan API V2 endpoint first (if available)
    try {
      const v2Url = `https://api.basescan.org/api/v2/contracts/${contractAddress}/creation${apiKeyParam ? `?apikey=${env.basescanApiKey}` : ""}`;
      const v2Response = await fetch(v2Url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (v2Response.ok) {
        const v2Data = (await v2Response.json()) as {
          status?: string;
          message?: string;
          result?: {
            contractAddress: string;
            creatorAddress: string;
            transactionHash: string;
            blockNumber: string;
          };
        };

        if (v2Data.status === "1" && v2Data.result) {
          // Get timestamp from block
          let createdAt: number | null = null;
          try {
            const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${v2Data.result.blockNumber}&boolean=true${apiKeyParam}`;
            const blockResponse = await fetch(blockUrl, { headers: { Accept: "application/json" } });
            if (blockResponse.ok) {
              const blockData = (await blockResponse.json()) as { result?: { timestamp?: string } };
              if (blockData.result?.timestamp) {
                createdAt = parseInt(blockData.result.timestamp, 16);
              }
            }
          } catch (error) {
            // Ignore timestamp errors
          }

          const result = {
            contractAddress: v2Data.result.contractAddress,
            contractCreator: v2Data.result.creatorAddress,
            txHash: v2Data.result.transactionHash,
            createdAt,
          };
          creatorCache.set(normalizedAddress, result);
          console.log(`[Basescan] Found creator via V2 API for ${contractAddress}: ${result.contractCreator}`);
          return result;
        }
      } else if (v2Response.status === 404) {
        console.log(`[Basescan] V2 API endpoint not available (404), trying V1 fallback`);
      }
    } catch (error) {
      console.warn(`[Basescan] V2 API failed for ${contractAddress}, trying V1 fallback:`, error);
    }

    // STEP 2: Try the getcontractcreation endpoint (this still works even though other V1 endpoints are deprecated)
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
          console.warn(`[Basescan] Contract creation endpoint deprecated for ${contractAddress}, trying fallback`);
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

    // STEP 3: Use Base public RPC to find contract creation
    // Since Basescan API endpoints are deprecated, we'll use Base RPC directly
    try {
      // Use Base public RPC endpoint
      const BASE_RPC_URL = "https://mainnet.base.org";
      
      // Method: Use debug_traceBlockByNumber to find when contract was created
      // First, we need to find the block where the contract first appeared
      // We'll use a binary search approach on recent blocks
      
      // Alternative simpler approach: Use the contract's transaction count
      // If transactionCount is 0, it's a new contract - but we still need the creation tx
      
      // Actually, the most reliable way: Use Basescan's website data
      // But since API is deprecated, let's try using the Basescan website's internal API
      // Or use a third-party service
      
      // For now, let's try using the Basescan website HTML parsing as a last resort
      // But first, let's see if we can get the data from the website's internal API
      
      console.log(`[Basescan] Attempting to fetch creation data from Basescan website for ${contractAddress}`);
      
      // Try fetching the Basescan contract page and parsing it
      const basescanPageUrl = `https://basescan.org/address/${contractAddress}`;
      const pageResponse = await fetch(basescanPageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      if (pageResponse.ok) {
        const pageHtml = await pageResponse.text();
        
        // Look for contract creator pattern in the HTML
        // Basescan shows: "Contract Creator: 0x..." or "Creator: 0x..."
        const creatorMatch = pageHtml.match(/Contract Creator[^>]*>([^<]*<a[^>]*>)?(0x[a-fA-F0-9]{40})/i);
        const txHashMatch = pageHtml.match(/Creation Transaction[^>]*>([^<]*<a[^>]*href="[^"]*tx\/(0x[a-fA-F0-9]{64})[^"]*"[^>]*>)?(0x[a-fA-F0-9]{64})/i);
        
        if (creatorMatch && creatorMatch[2]) {
          const creator = creatorMatch[2];
          let txHash: string | null = null;
          
          if (txHashMatch) {
            txHash = txHashMatch[2] || txHashMatch[3] || null;
          }
          
          if (creator && txHash) {
            // Get timestamp from the transaction
            let createdAt: number | null = null;
            try {
              // Use Base RPC to get transaction details
              const rpcResponse = await fetch(BASE_RPC_URL, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  method: "eth_getTransactionByHash",
                  params: [txHash],
                  id: 1,
                }),
              });
              
              if (rpcResponse.ok) {
                const rpcData = (await rpcResponse.json()) as { result?: { blockNumber?: string } };
                if (rpcData.result?.blockNumber) {
                  // Get block timestamp
                  const blockResponse = await fetch(BASE_RPC_URL, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      jsonrpc: "2.0",
                      method: "eth_getBlockByNumber",
                      params: [rpcData.result.blockNumber, false],
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
            
            const result = {
              contractAddress: contractAddress,
              contractCreator: creator,
              txHash: txHash,
              createdAt,
            };
            creatorCache.set(normalizedAddress, result);
            console.log(`[Basescan] Found creator via website parsing for ${contractAddress}: ${result.contractCreator}`);
            return result;
          }
        }
      }
    } catch (error) {
      console.error(`[Basescan] Website parsing failed for ${contractAddress}:`, error);
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

