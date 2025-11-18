/**
 * Relay.link API service
 * Fetches cross-chain transaction information
 */

export interface RelayTransaction {
  txHash: string;
  sourceChain: {
    chainId: number;
    chainName: string;
    wallet: string;
  };
  destinationChain: {
    chainId: number;
    chainName: string;
    wallet: string;
  };
  amount?: string;
  token?: {
    symbol: string;
    address: string;
  };
  status: string;
  timestamp?: number;
}

// Cache for chain data from Relay API
let chainCache: { chains: Record<number, { name: string; displayName: string; explorerUrl?: string; explorerName?: string }>; lastFetched: number } | null = null;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

/**
 * Fetch all supported chains from Relay API
 * Reference: https://docs.relay.link/references/api/get-chains
 */
async function fetchRelayChains(): Promise<Record<number, { name: string; displayName: string; explorerUrl?: string; explorerName?: string }>> {
  // Return cached data if still valid
  if (chainCache && Date.now() - chainCache.lastFetched < CACHE_DURATION) {
    return chainCache.chains;
  }

  try {
    const response = await fetch("https://api.relay.link/chains", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch chains from Relay API: ${response.status}`);
      // Return empty object if fetch fails, will fall back to chain ID
      return {};
    }

    const data = await response.json();
    const chains: Record<number, { name: string; displayName: string; explorerUrl?: string; explorerName?: string }> = {};

    if (data.chains && Array.isArray(data.chains)) {
      for (const chain of data.chains) {
        if (chain.id && chain.displayName) {
          chains[chain.id] = {
            name: chain.name || chain.displayName,
            displayName: chain.displayName,
            explorerUrl: chain.explorerUrl,
            explorerName: chain.explorerName,
          };
        }
      }
    }

    // Update cache
    chainCache = {
      chains,
      lastFetched: Date.now(),
    };

    console.log(`Fetched ${Object.keys(chains).length} chains from Relay API`);
    return chains;
  } catch (error) {
    console.error("Error fetching chains from Relay API:", error);
    return {};
  }
}

/**
 * Get chain name, fetching from Relay API if needed
 */
async function getChainName(chainId: number): Promise<string> {
  const chains = await fetchRelayChains();
  if (chains[chainId]) {
    return chains[chainId].displayName || chains[chainId].name;
  }
  return `Chain ${chainId}`;
}

/**
 * Detect chain ID from transaction link by checking against Relay's supported chains
 */
export async function detectChainFromLinkAdvanced(link: string): Promise<number | null> {
  const chains = await fetchRelayChains();
  const lowerLink = link.toLowerCase();

  // Check each chain's explorer URL patterns
  for (const [chainIdStr, chainInfo] of Object.entries(chains)) {
    const chainId = parseInt(chainIdStr);
    if (chainInfo.explorerUrl && lowerLink.includes(chainInfo.explorerUrl.toLowerCase().replace("https://", "").replace("http://", "").split("/")[0])) {
      return chainId;
    }
    if (chainInfo.explorerName && lowerLink.includes(chainInfo.explorerName.toLowerCase())) {
      return chainId;
    }
  }

  // Fallback to basic detection for common chains
  return detectChainFromLink(link);
}

/**
 * Extract transaction hash from various transaction link formats
 * Supports both Ethereum-style (0x...) and Solana (base58) transaction signatures
 */
export function extractTransactionHash(input: string): string | null {
  const trimmed = input.trim();
  
  // Direct Ethereum-style hash (0x followed by 64 hex chars)
  if (/^0x[a-fA-F0-9]{64}$/i.test(trimmed)) {
    return trimmed;
  }

  // Direct Solana transaction signature (base58, typically 87-88 characters)
  // Solana signatures are base58 encoded and usually 87-88 chars long
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(trimmed)) {
    return trimmed;
  }

  // Extract from various explorer URLs - Ethereum-style
  const ethereumPatterns = [
    /(?:basescan|etherscan|arbiscan|optimistic|polygonscan|snowtrace|bscscan|ftmscan|gnosisscan|celoscan|aurorascan|harmony|explorer)\.(?:org|io|com)\/tx\/(0x[a-fA-F0-9]{64})/i,
    /\/tx\/(0x[a-fA-F0-9]{64})/i,
    /transaction[\/=](0x[a-fA-F0-9]{64})/i,
  ];

  for (const pattern of ethereumPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Extract from Solana explorer URLs (solscan, explorer.solana.com, etc.)
  const solanaPatterns = [
    /(?:solscan|explorer\.solana)\.(?:io|com)\/tx\/([1-9A-HJ-NP-Za-km-z]{87,88})/i,
    /\/tx\/([1-9A-HJ-NP-Za-km-z]{87,88})/i,
    /transaction[\/=]([1-9A-HJ-NP-Za-km-z]{87,88})/i,
  ];

  for (const pattern of solanaPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Extract from Relay.link transaction URLs (these use Relay's transaction IDs)
  const relayPatterns = [
    /relay\.link\/transaction\/(0x[a-fA-F0-9]{64})/i,
    /relay\.link\/transaction\/([1-9A-HJ-NP-Za-km-z]{87,88})/i,
  ];

  for (const pattern of relayPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Detect chain ID from transaction link (basic fallback)
 * Returns null for Solana transactions (they don't use chain IDs)
 */
export function detectChainFromLink(link: string): number | null {
  const lowerLink = link.toLowerCase();
  
  // Solana explorers
  if (lowerLink.includes("solscan") || lowerLink.includes("explorer.solana")) {
    return null; // Solana doesn't use chain IDs
  }
  
  // Common chain patterns (fallback if API fetch fails)
  if (lowerLink.includes("basescan") || lowerLink.includes("base")) {
    return 8453;
  }
  if (lowerLink.includes("etherscan") || lowerLink.includes("ethereum")) {
    return 1;
  }
  if (lowerLink.includes("arbiscan") || lowerLink.includes("arbitrum")) {
    return 42161;
  }
  if (lowerLink.includes("optimistic") || lowerLink.includes("optimism")) {
    return 10;
  }
  if (lowerLink.includes("polygonscan") || lowerLink.includes("polygon")) {
    return 137;
  }
  if (lowerLink.includes("snowtrace") || lowerLink.includes("avalanche")) {
    return 43114;
  }
  if (lowerLink.includes("bscscan") || lowerLink.includes("bsc")) {
    return 56;
  }
  if (lowerLink.includes("ftmscan") || lowerLink.includes("fantom")) {
    return 250;
  }
  
  // Default to Base if unknown (most common for this bot)
  return 8453;
}

/**
 * Index a transaction in Relay.link (optional, helps if transaction is new)
 */
export async function indexRelayTransaction(
  txHash: string,
  chainId: number,
): Promise<void> {
  try {
    const response = await fetch("https://api.relay.link/transactions/index", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        txHash,
        chainId,
      }),
    });

    if (!response.ok) {
      // Don't throw - indexing is optional
      console.warn(`Failed to index transaction ${txHash}:`, response.statusText);
    }
  } catch (error) {
    // Don't throw - indexing is optional
    console.warn(`Error indexing transaction ${txHash}:`, error);
  }
}

/**
 * Fetch transaction details from a blockchain transaction to get the wallet address
 * This is needed because Relay API requires wallet address, not transaction hash
 */
async function getWalletFromTransaction(
  txHash: string,
  chainId: number,
): Promise<{ from: string | null; to: string | null; userAddress: string | null }> {
  try {
    // For Base chain, use Base RPC
    if (chainId === 8453) {
      const BASE_RPC_URL = "https://mainnet.base.org";
      
      // Get transaction details
      const txResponse = await fetch(BASE_RPC_URL, {
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

      const txData = await txResponse.json();
      let from: string | null = null;
      let to: string | null = null;
      
      if (txData.result) {
        from = txData.result.from ? txData.result.from.toLowerCase() : null;
        to = txData.result.to ? txData.result.to.toLowerCase() : null;
      }
      
      // Get transaction receipt to check logs for user address
      // For Relay deposits, the user address might be in the logs
      const receiptResponse = await fetch(BASE_RPC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [txHash],
          id: 2,
        }),
      });

      const receiptData = await receiptResponse.json();
      let userAddress: string | null = null;
      
      // Check logs for Transfer events or other events that might contain user address
      if (receiptData.result && receiptData.result.logs) {
        // Look for addresses in log topics (first 20 bytes after 0x)
        for (const log of receiptData.result.logs) {
          if (log.topics && log.topics.length > 0) {
            // Topics often contain addresses - check if any look like user addresses
            for (const topic of log.topics) {
              if (topic && topic.length === 66) { // 0x + 64 hex chars
                const addr = "0x" + topic.slice(-40); // Last 20 bytes
                // Skip zero address and contract addresses (might be Relay contract)
                if (addr !== "0x0000000000000000000000000000000000000000" && 
                    addr !== from && 
                    addr !== to &&
                    addr.length === 42) {
                  userAddress = addr.toLowerCase();
                  break;
                }
              }
            }
            if (userAddress) break;
          }
        }
      }
      
      console.log(`Extracted addresses from transaction - from: ${from}, to: ${to}, userAddress from logs: ${userAddress}`);
      return { from, to, userAddress };
      
      // If no result, log the error
      if (txData.error) {
        console.error(`RPC error fetching transaction:`, txData.error);
      } else if (!txData.result) {
        console.warn(`Transaction ${txHash} returned no result from RPC`);
      }
    }

    // For Ethereum mainnet
    if (chainId === 1) {
      const ETH_RPC_URL = "https://eth.llamarpc.com";
      const txResponse = await fetch(ETH_RPC_URL, {
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

      const txData = await txResponse.json();
      let from: string | null = null;
      let to: string | null = null;
      
      if (txData.result) {
        from = txData.result.from ? txData.result.from.toLowerCase() : null;
        to = txData.result.to ? txData.result.to.toLowerCase() : null;
      }
      
      // Get receipt for logs
      const receiptResponse = await fetch(ETH_RPC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [txHash],
          id: 2,
        }),
      });

      const receiptData = await receiptResponse.json();
      let userAddress: string | null = null;
      
      if (receiptData.result && receiptData.result.logs) {
        for (const log of receiptData.result.logs) {
          if (log.topics && log.topics.length > 0) {
            for (const topic of log.topics) {
              if (topic && topic.length === 66) {
                const addr = "0x" + topic.slice(-40);
                if (addr !== "0x0000000000000000000000000000000000000000" && 
                    addr !== from && 
                    addr !== to &&
                    addr.length === 42) {
                  userAddress = addr.toLowerCase();
                  break;
                }
              }
            }
            if (userAddress) break;
          }
        }
      }
      
      console.log(`Extracted addresses from transaction - from: ${from}, to: ${to}, userAddress from logs: ${userAddress}`);
      return { from, to, userAddress };
    }

    // For other chains, you could add similar RPC calls here
    // For now, return null if we can't fetch it
    return { from: null, to: null, userAddress: null };
  } catch (error) {
    console.error(`Error fetching transaction ${txHash} from chain ${chainId}:`, error);
    return { from: null, to: null, userAddress: null };
  }
}

/**
 * Fetch transaction details from Relay.link by wallet address
 * Returns the most recent transaction for the wallet
 * Reference: https://docs.relay.link/references/api/get-requests
 */
export async function fetchRelayTransactionByWallet(
  walletAddress: string,
  limit: number = 1,
): Promise<RelayTransaction | null> {
  try {
    console.log(`Querying Relay API for wallet: ${walletAddress}`);
    const url = new URL("https://api.relay.link/requests/v2");
    url.searchParams.set("user", walletAddress);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("sortBy", "createdAt");
    url.searchParams.set("sortDirection", "desc");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No transactions found for wallet ${walletAddress}`);
        return null;
      }
      const errorText = await response.text().catch(() => "");
      console.error(`Relay API error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Relay API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const requests = data.requests || [];

    if (requests.length === 0) {
      console.log(`No requests found for wallet ${walletAddress}`);
      return null;
    }

    // Use the first (most recent) request
    const req = requests[0];
    return await parseRelayRequest(req, undefined);
  } catch (error) {
    console.error(`Error fetching Relay transaction for wallet ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Parse a Relay API request object into a RelayTransaction
 */
async function parseRelayRequest(
  req: any,
  txHash: string | undefined,
): Promise<RelayTransaction | null> {
  const inTxs = req.data?.inTxs || [];
  const outTxs = req.data?.outTxs || [];

  // Find which transaction matches our hash (if provided)
  const searchHash = txHash?.toLowerCase();
  const matchingInTx = searchHash ? inTxs.find((tx: any) => tx.hash?.toLowerCase() === searchHash) : null;
  const matchingOutTx = searchHash ? outTxs.find((tx: any) => tx.hash?.toLowerCase() === searchHash) : null;

  // Determine source and destination
  let sourceChain: { chainId: number; wallet: string } | null = null;
  let destinationChain: { chainId: number; wallet: string } | null = null;
  let amount: string | undefined;
  let token: { symbol: string; address: string } | undefined;

  if (matchingInTx) {
    sourceChain = {
      chainId: matchingInTx.chainId || 8453,
      wallet: matchingInTx.data?.from || req.user || "",
    };
    if (outTxs.length > 0) {
      destinationChain = {
        chainId: outTxs[0].chainId || 0,
        wallet: req.recipient || outTxs[0].data?.to || "",
      };
    }
  } else if (matchingOutTx) {
    destinationChain = {
      chainId: matchingOutTx.chainId || 0,
      wallet: req.recipient || matchingOutTx.data?.to || "",
    };
    if (inTxs.length > 0) {
      sourceChain = {
        chainId: inTxs[0].chainId || 8453,
        wallet: req.user || inTxs[0].data?.from || "",
      };
    }
  } else {
    // Use first inTx and first outTx
    if (inTxs.length > 0) {
      sourceChain = {
        chainId: inTxs[0].chainId || 8453,
        wallet: req.user || inTxs[0].data?.from || "",
      };
    }
    if (outTxs.length > 0) {
      destinationChain = {
        chainId: outTxs[0].chainId || 0,
        wallet: req.recipient || outTxs[0].data?.to || "",
      };
    }
  }

  // Extract token information
  if (req.data?.outputCurrency) {
    const currency = req.data.outputCurrency.currency;
    if (currency) {
      token = {
        symbol: currency.symbol || "",
        address: currency.address || "",
      };
      if (req.data.outputCurrency.amountFormatted) {
        const formattedAmount = req.data.outputCurrency.amountFormatted;
        if (formattedAmount && formattedAmount !== "0" && formattedAmount !== "0.0" && formattedAmount !== "0.00") {
          amount = formattedAmount;
        }
      } else if (req.data.outputCurrency.amount) {
        const rawAmount = req.data.outputCurrency.amount;
        if (rawAmount && rawAmount !== "0" && rawAmount !== "0x0") {
          amount = rawAmount;
        }
      }
    }
  }

  // Fallback to user/recipient
  if (!sourceChain?.wallet && req.user) {
    if (!sourceChain) {
      sourceChain = { chainId: 8453, wallet: "" };
    }
    sourceChain.wallet = req.user;
  }
  if (!destinationChain?.wallet && req.recipient) {
    if (!destinationChain) {
      destinationChain = { chainId: 0, wallet: "" };
    }
    destinationChain.wallet = req.recipient;
  }

  if (!sourceChain || !destinationChain || !sourceChain.wallet || !destinationChain.wallet) {
    console.warn("Incomplete transaction data:", { sourceChain, destinationChain, request: req });
    return null;
  }

  if (!sourceChain.chainId || !destinationChain.chainId) {
    console.warn("Missing chain IDs:", { sourceChain, destinationChain });
    return null;
  }

  // Get chain names asynchronously
  const [sourceChainName, destChainName] = await Promise.all([
    getChainName(sourceChain.chainId),
    getChainName(destinationChain.chainId),
  ]);

  const transaction: RelayTransaction = {
    txHash: matchingInTx?.hash || matchingOutTx?.hash || txHash || inTxs[0]?.hash || outTxs[0]?.hash || "",
    sourceChain: {
      chainId: sourceChain.chainId,
      chainName: sourceChainName,
      wallet: sourceChain.wallet,
    },
    destinationChain: {
      chainId: destinationChain.chainId,
      chainName: destChainName,
      wallet: destinationChain.wallet,
    },
    amount: amount,
    token: token,
    status: req.status || "unknown",
    timestamp: matchingInTx?.timestamp || matchingOutTx?.timestamp || inTxs[0]?.timestamp || outTxs[0]?.timestamp || new Date(req.createdAt || req.updatedAt).getTime() / 1000,
  };

  return transaction;
}

/**
 * Fetch transaction details from Relay.link by transaction hash
 * Uses the official /requests/v2 API endpoint with hash query parameter
 * Reference: https://docs.relay.link/references/api/get-requests
 */
export async function fetchRelayTransaction(
  txHash: string,
  sourceChainId?: number,
  walletAddress?: string,
): Promise<RelayTransaction | null> {
  try {
    // Detect if this is a Solana transaction (base58, 87-88 chars, not starting with 0x)
    const isSolanaTx = !txHash.startsWith("0x") && txHash.length >= 87 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(txHash);
    
    // If no chainId provided, try to detect from common patterns or use advanced detection
    let chainIdToUse = sourceChainId;
    if (!chainIdToUse) {
      // For Solana transactions, don't use chainId (Solana doesn't use chain IDs)
      // For EVM chains, default to Base
      chainIdToUse = isSolanaTx ? undefined : 8453; // Default to Base for EVM
    }
    
    const isRelayTxId = txHash.startsWith("0x") && txHash.length === 66; // Relay transaction IDs are 0x + 64 hex chars

    // Query Relay API using the official /requests/v2 endpoint
    // Try by hash first (for source/destination transaction hashes)
    // If that fails and it looks like a Relay transaction ID, try by id parameter
    console.log(`Querying Relay API for transaction: ${txHash}${isRelayTxId ? " (Relay transaction ID)" : isSolanaTx ? " (Solana)" : ""}`);
    
    let url = new URL("https://api.relay.link/requests/v2");
    url.searchParams.set("hash", txHash);
    // Don't include chainId for Solana transactions (they don't use chain IDs)
    // For Solana, we must query without chainId from the start
    // Also don't include it if we're querying by wallet address
    if (chainIdToUse && !isSolanaTx && !walletAddress) {
      url.searchParams.set("chainId", chainIdToUse.toString());
    }
    // For Solana transactions, we already don't include chainId, so the query should work

    let response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    let data: any;
    if (response.ok) {
      data = await response.json();
      console.log(`First query (hash) succeeded, found ${(data.requests || []).length} requests`);
    } else if (response.status === 404) {
      // If hash query failed, try alternative methods
      if (isRelayTxId) {
        // Try querying by id parameter (without chainId)
        console.log(`Hash query returned 404, trying id parameter for Relay transaction ID`);
        url = new URL("https://api.relay.link/requests/v2");
        url.searchParams.set("id", txHash);
        // Don't include chainId when querying by id
        
        response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        
        if (response.ok) {
          data = await response.json();
          console.log(`Id query succeeded, found ${(data.requests || []).length} requests`);
        } else {
          const errorText = await response.text().catch(() => "");
          console.error(`Id query also failed: ${response.status} ${response.statusText} - ${errorText}`);
          console.log(`Transaction ${txHash} not found on Relay API (tried both hash and id)`);
          console.log(`Note: Relay transaction IDs from relay.link URLs may not be directly queryable via the API. Try using the source or destination transaction hash instead.`);
          return null;
        }
      } else {
        // For non-Relay transaction IDs, also try without chainId filter
        console.log(`Hash query returned 404, trying without chainId filter`);
        url = new URL("https://api.relay.link/requests/v2");
        url.searchParams.set("hash", txHash);
        // Remove chainId to search across all chains
        
        response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        
        if (response.ok) {
          data = await response.json();
          console.log(`Query without chainId succeeded, found ${(data.requests || []).length} requests`);
        } else {
          const errorText = await response.text().catch(() => "");
          console.error(`Query without chainId also failed: ${response.status} ${response.statusText} - ${errorText}`);
          console.log(`Transaction ${txHash} not found on Relay API`);
          return null;
        }
      }
    } else {
      const errorText = await response.text().catch(() => "");
      console.error(`Relay API error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Relay API error: ${response.status} ${response.statusText}`);
    }

    // Debug: log the response to understand the structure
    console.log("Relay API response:", JSON.stringify(data, null, 2));

    // The API returns { requests: [...], continuation: "..." }
    const requests = data.requests || [];
    console.log(`Found ${requests.length} request(s) for ${txHash}`);

    if (requests.length === 0) {
      console.log(`No requests found for transaction ${txHash}`);
      
      // If this is a Solana transaction, suggest using the Relay transaction ID instead
      // Solana transactions might not be directly queryable by their signature
      if (!txHash.startsWith("0x") && txHash.length >= 87) {
        console.log(`Note: Solana transaction signatures may not be directly queryable. Try using the Relay transaction ID from the Relay transaction page instead.`);
      }
      
      return null;
    }

    // Find the request that matches our hash
    // If we queried by id, the request ID should match directly
    // Otherwise, the hash could be in inTxs (incoming) or outTxs (outgoing)
    const searchHash = txHash.toLowerCase();
    let matchingRequest = requests.find((req: any) => {
      // If this looks like a Relay transaction ID, check if the request ID matches
      if (isRelayTxId && req.id?.toLowerCase() === searchHash) {
        return true;
      }
      
      // Check inTxs (incoming transactions)
      const inTxs = req.data?.inTxs || [];
      for (const inTx of inTxs) {
        if (inTx.hash?.toLowerCase() === searchHash) {
          return true;
        }
      }
      // Check outTxs (outgoing transactions)
      const outTxs = req.data?.outTxs || [];
      for (const outTx of outTxs) {
        if (outTx.hash?.toLowerCase() === searchHash) {
          return true;
        }
      }
      return false;
    });

    // If no exact match, use the first request (hash/id parameter should filter it)
    if (!matchingRequest && requests.length > 0) {
      matchingRequest = requests[0];
      console.log(`Using first request from results (ID: ${matchingRequest.id})`);
    }

    if (!matchingRequest) {
      console.log(`No matching request found for transaction hash ${txHash}`);
      return null;
    }

    console.log(`Found matching request!`);
    return await parseRelayRequest(matchingRequest, txHash);
  } catch (error) {
    console.error(`Error fetching Relay transaction ${txHash}:`, error);
    throw error;
  }
}

