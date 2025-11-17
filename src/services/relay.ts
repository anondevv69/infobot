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
};

function getChainName(chainId: number): string {
  return CHAIN_ID_TO_NAME[chainId] || `Chain ${chainId}`;
}

/**
 * Extract transaction hash from various transaction link formats
 */
export function extractTransactionHash(input: string): string | null {
  // Direct hash
  if (/^0x[a-fA-F0-9]{64}$/i.test(input.trim())) {
    return input.trim();
  }

  // Extract from various explorer URLs
  const patterns = [
    /(?:basescan|etherscan|arbiscan|optimistic|polygonscan|snowtrace|bscscan|ftmscan|gnosisscan|celoscan|aurorascan|harmony|explorer)\.(?:org|io|com)\/tx\/(0x[a-fA-F0-9]{64})/i,
    /\/tx\/(0x[a-fA-F0-9]{64})/i,
    /transaction[\/=](0x[a-fA-F0-9]{64})/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Detect chain ID from transaction link
 */
export function detectChainFromLink(link: string): number | null {
  const lowerLink = link.toLowerCase();
  
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
): Promise<{ from: string | null; to: string | null }> {
  try {
    // For Base chain, use Base RPC
    if (chainId === 8453) {
      const BASE_RPC_URL = "https://mainnet.base.org";
      const response = await fetch(BASE_RPC_URL, {
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

      const data = await response.json();
      if (data.result) {
        const from = data.result.from ? data.result.from.toLowerCase() : null;
        const to = data.result.to ? data.result.to.toLowerCase() : null;
        console.log(`Extracted addresses from transaction - from: ${from}, to: ${to}`);
        return { from, to };
      }
      
      // If no result, log the error
      if (data.error) {
        console.error(`RPC error fetching transaction:`, data.error);
      } else {
        console.warn(`Transaction ${txHash} returned no result from RPC`);
      }
    }

    // For Ethereum mainnet
    if (chainId === 1) {
      const ETH_RPC_URL = "https://eth.llamarpc.com";
      const response = await fetch(ETH_RPC_URL, {
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

      const data = await response.json();
      if (data.result) {
        const from = data.result.from ? data.result.from.toLowerCase() : null;
        const to = data.result.to ? data.result.to.toLowerCase() : null;
        console.log(`Extracted addresses from transaction - from: ${from}, to: ${to}`);
        return { from, to };
      }
    }

    // For other chains, you could add similar RPC calls here
    // For now, return null if we can't fetch it
    return { from: null, to: null };
  } catch (error) {
    console.error(`Error fetching transaction ${txHash} from chain ${chainId}:`, error);
    return { from: null, to: null };
  }
}

/**
 * Fetch transaction details from Relay.link by wallet address
 * Relay API only supports querying by address, not by transaction hash
 */
export async function fetchRelayTransaction(
  txHash: string,
  sourceChainId?: number,
  walletAddress?: string,
): Promise<RelayTransaction | null> {
  try {
    const chainIdToUse = sourceChainId || 8453; // Default to Base

    // If wallet address not provided, try to fetch it from the transaction
    let wallet: string | undefined = walletAddress;
    if (!wallet) {
      const addresses = await getWalletFromTransaction(txHash, chainIdToUse);
      if (!addresses.from && !addresses.to) {
        console.warn(`Could not extract wallet address from transaction ${txHash}`);
        return null;
      }
      // For deposits, try "from" address first (the user's address on source chain)
      // If that doesn't work, we'll try "to" address
      wallet = addresses.from || addresses.to || undefined;
    }

    // Query Relay API by wallet address
    console.log(`Querying Relay API for wallet: ${wallet}`);
    const response = await fetch(
      `https://api.relay.link/v1/addresses/${wallet}/transactions`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No transactions found for wallet ${wallet} on Relay API`);
        return null;
      }
      const errorText = await response.text().catch(() => "");
      console.error(`Relay API error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Relay API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // Debug: log the response to understand the structure
    console.log("Relay API response:", JSON.stringify(data, null, 2));
    console.log(`Found ${(data.transactions || data.data || []).length} transactions for wallet ${wallet}`);

    // Find the transaction that matches our hash
    // Note: The hash we're searching for might be the destination transaction hash on Base
    // Relay API may store it as destTxHash, destinationTxHash, or in a nested structure
    const transactions = data.transactions || data.data || [];
    console.log(`Searching ${transactions.length} transactions for hash ${txHash}`);
    
    const searchHash = txHash.toLowerCase();
    const matchingTx = transactions.find(
      (t: any) => {
        // Check all possible hash fields
        const srcHash = (t.srcTxHash || t.sourceTxHash || t.sourceTransactionHash || "").toLowerCase();
        const destHash = (t.destTxHash || t.destinationTxHash || t.destinationTransactionHash || "").toLowerCase();
        const relayTxHash = (t.txHash || t.transactionHash || t.relayTxHash || "").toLowerCase();
        
        // Also check nested structures
        const nestedSrcHash = (t.source?.txHash || t.source?.transactionHash || "").toLowerCase();
        const nestedDestHash = (t.destination?.txHash || t.destination?.transactionHash || "").toLowerCase();
        
        return srcHash === searchHash || 
               destHash === searchHash || 
               relayTxHash === searchHash ||
               nestedSrcHash === searchHash ||
               nestedDestHash === searchHash;
      }
    );

    if (!matchingTx) {
      console.log(`Transaction ${txHash} not found in wallet ${wallet}'s Relay transactions`);
      
      // If we used "from" address and there's a "to" address, try querying by "to" address
      // This handles cases where the deposit transaction's "to" is the user's address on destination chain
      if (!walletAddress) {
        const addresses = await getWalletFromTransaction(txHash, chainIdToUse);
        if (addresses.to && addresses.to !== wallet) {
          console.log(`Trying alternative address: ${addresses.to}`);
          const altResponse = await fetch(
            `https://api.relay.link/v1/addresses/${addresses.to}/transactions`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
          
          if (altResponse.ok) {
            const altData = await altResponse.json();
            const altTransactions = altData.transactions || altData.data || [];
            const searchHash = txHash.toLowerCase();
            const altMatchingTx = altTransactions.find(
              (t: any) => {
                const srcHash = (t.srcTxHash || t.sourceTxHash || t.sourceTransactionHash || "").toLowerCase();
                const destHash = (t.destTxHash || t.destinationTxHash || t.destinationTransactionHash || "").toLowerCase();
                const relayTxHash = (t.txHash || t.transactionHash || t.relayTxHash || "").toLowerCase();
                const nestedSrcHash = (t.source?.txHash || t.source?.transactionHash || "").toLowerCase();
                const nestedDestHash = (t.destination?.txHash || t.destination?.transactionHash || "").toLowerCase();
                return srcHash === searchHash || 
                       destHash === searchHash || 
                       relayTxHash === searchHash ||
                       nestedSrcHash === searchHash ||
                       nestedDestHash === searchHash;
              }
            );
            
            if (altMatchingTx) {
              console.log(`Found matching transaction using alternative address!`);
              const tx = altMatchingTx;
              const relayTxHash = tx.txHash || tx.transactionHash || tx.relayTxHash || txHash;
              
              const transaction: RelayTransaction = {
                txHash: relayTxHash,
                sourceChain: {
                  chainId: tx.srcChainId || tx.sourceChainId || tx.fromChainId || tx.originChainId || tx.source?.chainId || chainIdToUse,
                  chainName: getChainName(tx.srcChainId || tx.sourceChainId || tx.fromChainId || tx.originChainId || tx.source?.chainId || chainIdToUse),
                  wallet: tx.srcAddress || tx.sourceAddress || tx.fromAddress || tx.originAddress || tx.source?.address || addresses.from || "",
                },
                destinationChain: {
                  chainId: tx.destChainId || tx.destinationChainId || tx.toChainId || tx.targetChainId || tx.destination?.chainId || 0,
                  chainName: getChainName(tx.destChainId || tx.destinationChainId || tx.toChainId || tx.targetChainId || tx.destination?.chainId || 0),
                  wallet: tx.destAddress || tx.destinationAddress || tx.toAddress || tx.targetAddress || tx.destination?.address || addresses.to || "",
                },
                amount: tx.amountOut || tx.amount || tx.value || tx.transferAmount || tx.amountReceived,
                token: tx.tokenOut
                  ? {
                      symbol: tx.tokenOut.symbol || tx.tokenOutSymbol || "",
                      address: tx.tokenOut.address || tx.tokenOutAddress || "",
                    }
                  : tx.tokenSymbol
                  ? {
                      symbol: tx.tokenSymbol,
                      address: tx.tokenAddress || "",
                    }
                  : tx.destinationToken
                  ? {
                      symbol: tx.destinationToken.symbol || "",
                      address: tx.destinationToken.address || "",
                    }
                  : undefined,
                status: tx.status || tx.transactionStatus || tx.state || "unknown",
                timestamp: tx.timestamp || tx.blockTimestamp || tx.time || tx.createdAt || tx.date,
              };

              if (!transaction.sourceChain.wallet || !transaction.destinationChain.wallet) {
                console.warn("Incomplete transaction data:", transaction);
                return null;
              }

              return transaction;
            }
          }
        }
      }
      
      // Log first few transaction hashes for debugging
      if (transactions.length > 0) {
        console.log(`Sample transaction data from wallet (first transaction):`);
        const firstTx = transactions[0];
        console.log(JSON.stringify(firstTx, null, 2));
      }
      return null;
    }
    
    console.log(`Found matching transaction!`);

    const tx = matchingTx;

    // Parse the transaction from Relay API response
    // Relay API returns transactions with fields like: srcChainId, destChainId, srcAddress, destAddress, etc.
    // Use the original hash we searched for, or Relay's transaction hash
    const relayTxHash = tx.txHash || tx.transactionHash || tx.relayTxHash || txHash;
    
    const transaction: RelayTransaction = {
      txHash: relayTxHash,
      sourceChain: {
        chainId: tx.srcChainId || tx.sourceChainId || tx.fromChainId || tx.originChainId || tx.source?.chainId || chainIdToUse,
        chainName: getChainName(tx.srcChainId || tx.sourceChainId || tx.fromChainId || tx.originChainId || tx.source?.chainId || chainIdToUse),
        wallet: tx.srcAddress || tx.sourceAddress || tx.fromAddress || tx.originAddress || tx.source?.address || wallet || "",
      },
      destinationChain: {
        chainId: tx.destChainId || tx.destinationChainId || tx.toChainId || tx.targetChainId || tx.destination?.chainId || 0,
        chainName: getChainName(tx.destChainId || tx.destinationChainId || tx.toChainId || tx.targetChainId || tx.destination?.chainId || 0),
        wallet: tx.destAddress || tx.destinationAddress || tx.toAddress || tx.targetAddress || tx.destination?.address || "",
      },
      amount: tx.amountOut || tx.amount || tx.value || tx.transferAmount || tx.amountReceived,
      token: tx.tokenOut
        ? {
            symbol: tx.tokenOut.symbol || tx.tokenOutSymbol || "",
            address: tx.tokenOut.address || tx.tokenOutAddress || "",
          }
        : tx.tokenSymbol
        ? {
            symbol: tx.tokenSymbol,
            address: tx.tokenAddress || "",
          }
        : tx.destinationToken
        ? {
            symbol: tx.destinationToken.symbol || "",
            address: tx.destinationToken.address || "",
          }
        : undefined,
      status: tx.status || tx.transactionStatus || tx.state || "unknown",
      timestamp: tx.timestamp || tx.blockTimestamp || tx.time || tx.createdAt || tx.date,
    };

    // Validate that we have at least source and destination info
    if (!transaction.sourceChain.wallet || !transaction.destinationChain.wallet) {
      console.warn("Incomplete transaction data:", transaction);
      return null;
    }

    return transaction;
  } catch (error) {
    console.error(`Error fetching Relay transaction ${txHash}:`, error);
    throw error;
  }
}

