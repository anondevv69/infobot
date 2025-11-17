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

const CHAIN_ID_TO_NAME: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
  43114: "Avalanche",
  56: "BSC",
  250: "Fantom",
  100: "Gnosis",
  42220: "Celo",
  1313161554: "Aurora",
  1666600000: "Harmony",
  25: "Cronos",
  1284: "Moonbeam",
  1285: "Moonriver",
  128: "Heco",
  66: "OKExChain",
  321: "KCC",
  1088: "Metis",
  288: "Boba",
  106: "Velas",
  1287: "Moonbase",
  40: "Telos",
  57: "Syscoin",
  122: "Fuse",
  246: "Energy Web",
  10000: "SmartBCH",
  32659: "Fusion",
  361: "Theta",
  70: "Hoo",
  199: "BitTorrent",
  88: "TomoChain",
  50: "XDC",
  333999: "Polis",
  336: "Shiden",
  592: "Astar",
  4689: "IoTeX",
  534352: "Scroll",
  5000: "Mantle",
  59144: "Linea",
  1101: "Polygon zkEVM",
  324: "zkSync Era",
  81457: "Blast",
  999: "Hyperliquid",
  7777777: "Zora Network",
};

function getChainName(chainId: number): string {
  return CHAIN_ID_TO_NAME[chainId] || `Chain ${chainId}`;
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
 * Detect chain ID from transaction link
 * Returns null for Solana transactions (they don't use chain IDs)
 */
export function detectChainFromLink(link: string): number | null {
  const lowerLink = link.toLowerCase();
  
  // Solana explorers
  if (lowerLink.includes("solscan") || lowerLink.includes("explorer.solana")) {
    return null; // Solana doesn't use chain IDs
  }
  
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
    const chainIdToUse = sourceChainId || 8453; // Default to Base

    // Query Relay API using the official /requests/v2 endpoint with hash parameter
    // This is the correct way according to the API documentation
    console.log(`Querying Relay API for transaction hash: ${txHash}`);
    const url = new URL("https://api.relay.link/requests/v2");
    url.searchParams.set("hash", txHash);
    if (chainIdToUse) {
      url.searchParams.set("chainId", chainIdToUse.toString());
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Transaction ${txHash} not found on Relay API`);
        return null;
      }
      const errorText = await response.text().catch(() => "");
      console.error(`Relay API error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Relay API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Debug: log the response to understand the structure
    console.log("Relay API response:", JSON.stringify(data, null, 2));

    // The API returns { requests: [...], continuation: "..." }
    const requests = data.requests || [];
    console.log(`Found ${requests.length} request(s) for hash ${txHash}`);

    if (requests.length === 0) {
      console.log(`No requests found for transaction hash ${txHash}`);
      
      // If this is a Solana transaction, suggest using the Relay transaction ID instead
      // Solana transactions might not be directly queryable by their signature
      if (!txHash.startsWith("0x") && txHash.length >= 87) {
        console.log(`Note: Solana transaction signatures may not be directly queryable. Try using the Relay transaction ID from the Relay transaction page instead.`);
      }
      
      return null;
    }

    // Find the request that matches our hash
    // The hash could be in inTxs (incoming) or outTxs (outgoing)
    const searchHash = txHash.toLowerCase();
    let matchingRequest = requests.find((req: any) => {
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

    // If no exact match, use the first request (hash parameter should filter it)
    if (!matchingRequest && requests.length > 0) {
      matchingRequest = requests[0];
    }

    if (!matchingRequest) {
      console.log(`No matching request found for transaction hash ${txHash}`);
      return null;
    }

    console.log(`Found matching request!`);
    console.log("Full request data:", JSON.stringify(matchingRequest, null, 2));

    const req = matchingRequest;
    const inTxs = req.data?.inTxs || [];
    const outTxs = req.data?.outTxs || [];
    
    console.log(`Request user: ${req.user}, recipient: ${req.recipient}`);
    console.log(`InTxs count: ${inTxs.length}, OutTxs count: ${outTxs.length}`);
    if (inTxs.length > 0) {
      console.log(`First inTx:`, JSON.stringify(inTxs[0], null, 2));
    }
    if (outTxs.length > 0) {
      console.log(`First outTx:`, JSON.stringify(outTxs[0], null, 2));
    }

    // Find which transaction matches our hash
    const matchingInTx = inTxs.find((tx: any) => tx.hash?.toLowerCase() === searchHash);
    const matchingOutTx = outTxs.find((tx: any) => tx.hash?.toLowerCase() === searchHash);

    // Determine source and destination based on which transaction matches
    // Use req.user and req.recipient as primary sources (they're more reliable)
    let sourceChain: { chainId: number; wallet: string } | null = null;
    let destinationChain: { chainId: number; wallet: string } | null = null;
    let amount: string | undefined;
    let token: { symbol: string; address: string } | undefined;

    if (matchingInTx) {
      // The matching hash is an incoming transaction (source chain)
      sourceChain = {
        chainId: matchingInTx.chainId || chainIdToUse,
        wallet: matchingInTx.data?.from || req.user || "",
      };
      // Destination is from the first outTx, but prefer req.recipient for wallet
      if (outTxs.length > 0) {
        destinationChain = {
          chainId: outTxs[0].chainId || 0,
          wallet: req.recipient || outTxs[0].data?.to || "",
        };
        // Don't set amount from raw transaction value - wait for outputCurrency
      } else if (req.recipient) {
        // If no outTxs but we have recipient, try to get chain from request data
        const destChainId = req.data?.destinationChainId || req.destinationChainId || 0;
        destinationChain = {
          chainId: destChainId,
          wallet: req.recipient,
        };
      }
    } else if (matchingOutTx) {
      // The matching hash is an outgoing transaction (destination chain)
      // This is a deposit - the hash is on the destination chain
      destinationChain = {
        chainId: matchingOutTx.chainId || 0,
        wallet: req.recipient || matchingOutTx.data?.to || "",
      };
      // Source is from the first inTx, but prefer req.user for wallet
      if (inTxs.length > 0) {
        sourceChain = {
          chainId: inTxs[0].chainId || chainIdToUse,
          wallet: req.user || inTxs[0].data?.from || "",
        };
      } else if (req.user) {
        // If no inTxs but we have user, try to get chain from request data
        const srcChainId = req.data?.originChainId || req.originChainId || chainIdToUse;
        sourceChain = {
          chainId: srcChainId,
          wallet: req.user,
        };
      }
      // Don't set amount from raw transaction value - wait for outputCurrency
    } else {
      // Fallback: use first inTx and first outTx, but prefer req.user/req.recipient
      if (inTxs.length > 0) {
        sourceChain = {
          chainId: inTxs[0].chainId || chainIdToUse,
          wallet: req.user || inTxs[0].data?.from || "",
        };
      } else if (req.user) {
        const srcChainId = req.data?.originChainId || req.originChainId || chainIdToUse;
        sourceChain = {
          chainId: srcChainId,
          wallet: req.user,
        };
      }
      if (outTxs.length > 0) {
        destinationChain = {
          chainId: outTxs[0].chainId || 0,
          wallet: req.recipient || outTxs[0].data?.to || "",
        };
        // Don't set amount from raw transaction value - wait for outputCurrency
      } else if (req.recipient) {
        const destChainId = req.data?.destinationChainId || req.destinationChainId || 0;
        destinationChain = {
          chainId: destChainId,
          wallet: req.recipient,
        };
      }
    }

    // Extract token information from outputCurrency if available
    // Only use amount from outputCurrency as it's the most reliable source
    if (req.data?.outputCurrency) {
      const currency = req.data.outputCurrency.currency;
      if (currency) {
        token = {
          symbol: currency.symbol || "",
          address: currency.address || "",
        };
        // Use amountFormatted if available, otherwise use amount
        // Only set amount if we have a valid formatted value (not "0" or empty)
        if (req.data.outputCurrency.amountFormatted) {
          const formattedAmount = req.data.outputCurrency.amountFormatted;
          if (formattedAmount && formattedAmount !== "0" && formattedAmount !== "0.0" && formattedAmount !== "0.00") {
            amount = formattedAmount;
          }
        } else if (req.data.outputCurrency.amount) {
          const rawAmount = req.data.outputCurrency.amount;
          // Only use raw amount if it's not zero
          if (rawAmount && rawAmount !== "0" && rawAmount !== "0x0") {
            amount = rawAmount;
          }
        }
      }
    } else {
      // If no outputCurrency, don't show amount (it's likely raw wei value)
      amount = undefined;
    }
    
    // Also clear amount if it was set from transaction value but is zero
    if (amount === "0" || amount === "0x0" || amount === "0.0" || amount === "0.00") {
      amount = undefined;
    }

    // Fallback to user/recipient if wallet addresses are missing
    if (!sourceChain?.wallet && req.user) {
      sourceChain = sourceChain || { chainId: chainIdToUse, wallet: "" };
      sourceChain.wallet = req.user;
    }
    if (!destinationChain?.wallet && req.recipient) {
      destinationChain = destinationChain || { chainId: 0, wallet: "" };
      destinationChain.wallet = req.recipient;
    }

    if (!sourceChain || !destinationChain || !sourceChain.wallet || !destinationChain.wallet) {
      console.warn("Incomplete transaction data:", { sourceChain, destinationChain, request: req });
      return null;
    }

    const transaction: RelayTransaction = {
      txHash: matchingInTx?.hash || matchingOutTx?.hash || txHash,
      sourceChain: {
        chainId: sourceChain.chainId,
        chainName: getChainName(sourceChain.chainId),
        wallet: sourceChain.wallet,
      },
      destinationChain: {
        chainId: destinationChain.chainId,
        chainName: getChainName(destinationChain.chainId),
        wallet: destinationChain.wallet,
      },
      amount: amount,
      token: token,
      status: req.status || "unknown",
      timestamp: matchingInTx?.timestamp || matchingOutTx?.timestamp || new Date(req.createdAt || req.updatedAt).getTime() / 1000,
    };

    return transaction;
  } catch (error) {
    console.error(`Error fetching Relay transaction ${txHash}:`, error);
    throw error;
  }
}

