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
 * Fetch transaction details from Relay.link
 */
export async function fetchRelayTransaction(
  txHash: string,
  sourceChainId?: number,
): Promise<RelayTransaction | null> {
  try {
    // Optionally index first if we know the source chain
    if (sourceChainId) {
      await indexRelayTransaction(txHash, sourceChainId);
      // Small delay to allow indexing
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const response = await fetch(
      `https://api.relay.link/transactions/${txHash}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Relay API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Parse the response based on Relay.link API structure
    // The actual structure may vary, so we'll handle common patterns
    const transaction: RelayTransaction = {
      txHash: data.txHash || txHash,
      sourceChain: {
        chainId: data.sourceChainId || data.sourceChain?.chainId || sourceChainId || 0,
        chainName: getChainName(data.sourceChainId || data.sourceChain?.chainId || sourceChainId || 0),
        wallet: data.sourceWallet || data.from || data.sourceAddress || "",
      },
      destinationChain: {
        chainId: data.destinationChainId || data.destinationChain?.chainId || 0,
        chainName: getChainName(data.destinationChainId || data.destinationChain?.chainId || 0),
        wallet: data.destinationWallet || data.to || data.destinationAddress || "",
      },
      amount: data.amount || data.value,
      token: data.token
        ? {
            symbol: data.token.symbol || "",
            address: data.token.address || "",
          }
        : undefined,
      status: data.status || "unknown",
      timestamp: data.timestamp || data.blockTimestamp,
    };

    return transaction;
  } catch (error) {
    console.error(`Error fetching Relay transaction ${txHash}:`, error);
    throw error;
  }
}

