/**
 * Multi-chain transaction lookup service
 * Supports Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, Fantom, BSC, Mantle, Monad, and more
 */

import { getMonadTransaction, MONAD_CHAIN_ID } from "./blockvision";

export interface TransactionInfo {
  txHash: string;
  chainId: number;
  chainName: string;
  from: string;
  to: string | null;
  value: string;
  status: "success" | "failed" | "pending" | "unknown";
  blockNumber: number | null;
  timestamp: number | null;
  explorerUrl: string;
  gasUsed?: string | null;
  gasPrice?: string | null;
}

// Chain configuration with explorer APIs and RPC endpoints
interface ChainConfig {
  chainId: number;
  name: string;
  explorerApi: string | null;
  explorerUrl: string;
  rpcUrl: string | null;
  apiKey?: string;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: 1,
    name: "Ethereum",
    explorerApi: "https://api.etherscan.io/api",
    explorerUrl: "https://etherscan.io/tx",
    rpcUrl: "https://eth.llamarpc.com",
  },
  {
    chainId: 8453,
    name: "Base",
    explorerApi: "https://api.basescan.org/api",
    explorerUrl: "https://basescan.org/tx",
    rpcUrl: "https://mainnet.base.org",
  },
  {
    chainId: 137,
    name: "Polygon",
    explorerApi: "https://api.polygonscan.com/api",
    explorerUrl: "https://polygonscan.com/tx",
    rpcUrl: "https://polygon-rpc.com",
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    explorerApi: "https://api.arbiscan.io/api",
    explorerUrl: "https://arbiscan.io/tx",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  {
    chainId: 10,
    name: "Optimism",
    explorerApi: "https://api-optimistic.etherscan.io/api",
    explorerUrl: "https://optimistic.etherscan.io/tx",
    rpcUrl: "https://mainnet.optimism.io",
  },
  {
    chainId: 43114,
    name: "Avalanche",
    explorerApi: "https://api.snowtrace.io/api",
    explorerUrl: "https://snowtrace.io/tx",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  },
  {
    chainId: 56,
    name: "BSC",
    explorerApi: "https://api.bscscan.com/api",
    explorerUrl: "https://bscscan.com/tx",
    rpcUrl: "https://bsc-dataseed.binance.org",
  },
  {
    chainId: 250,
    name: "Fantom",
    explorerApi: "https://api.ftmscan.com/api",
    explorerUrl: "https://ftmscan.com/tx",
    rpcUrl: "https://rpc.ftm.tools",
  },
  {
    chainId: 5000,
    name: "Mantle",
    explorerApi: null, // Mantle explorer doesn't have a public API, use RPC
    explorerUrl: "https://explorer.mantle.xyz/tx",
    rpcUrl: "https://rpc.mantle.xyz",
  },
  {
    chainId: 5001,
    name: "Monad",
    explorerApi: null, // BlockVision API handles this
    explorerUrl: "https://monadscan.com/tx",
    rpcUrl: "https://monad-mainnet.blockvision.org/v1", // BlockVision RPC endpoint
  },
  {
    chainId: 100,
    name: "Gnosis",
    explorerApi: "https://api.gnosisscan.io/api",
    explorerUrl: "https://gnosisscan.io/tx",
    rpcUrl: "https://rpc.gnosischain.com",
  },
  {
    chainId: 42220,
    name: "Celo",
    explorerApi: "https://api.celoscan.io/api",
    explorerUrl: "https://celoscan.io/tx",
    rpcUrl: "https://forno.celo.org",
  },
  {
    chainId: 59144,
    name: "Linea",
    explorerApi: null,
    explorerUrl: "https://lineascan.build/tx",
    rpcUrl: "https://rpc.linea.build",
  },
  {
    chainId: 534352,
    name: "Scroll",
    explorerApi: null,
    explorerUrl: "https://scrollscan.com/tx",
    rpcUrl: "https://rpc.scroll.io",
  },
];

/**
 * Look up a transaction across multiple chains
 * Tries each chain until it finds the transaction
 */
export async function lookupTransaction(
  txHash: string,
  preferredChainId?: number,
): Promise<TransactionInfo | null> {
  // If preferred chain is specified, try it first
  if (preferredChainId) {
    const config = CHAIN_CONFIGS.find((c) => c.chainId === preferredChainId);
    if (config) {
      const result = await tryLookupOnChain(txHash, config);
      if (result) return result;
    }
  }

  // Try all chains in parallel (limit to 5 at a time to avoid rate limits)
  const chunks = [];
  for (let i = 0; i < CHAIN_CONFIGS.length; i += 5) {
    chunks.push(CHAIN_CONFIGS.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map((config) => tryLookupOnChain(txHash, config)),
    );
    const found = results.find((r) => r !== null);
    if (found) return found;
  }

  return null;
}

/**
 * Try to look up a transaction on a specific chain
 */
async function tryLookupOnChain(
  txHash: string,
  config: ChainConfig,
): Promise<TransactionInfo | null> {
  // Special handling for Monad (uses BlockVision API)
  if (config.chainId === MONAD_CHAIN_ID) {
    try {
      const tx = await getMonadTransaction(txHash);
      if (tx) {
        return {
          txHash: tx.hash,
          chainId: config.chainId,
          chainName: config.name,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          status: tx.status,
          blockNumber: tx.blockNumber,
          timestamp: tx.timestamp,
          gasUsed: tx.gasUsed || null,
          gasPrice: tx.gasPrice || null,
          explorerUrl: `${config.explorerUrl}/${txHash}`,
        };
      }
      return null;
    } catch (error) {
      console.warn(`BlockVision API lookup failed for Monad:`, error);
      return null;
    }
  }

  // Try explorer API first if available
  if (config.explorerApi) {
    try {
      const result = await lookupViaExplorerAPI(txHash, config);
      if (result) return result;
    } catch (error) {
      console.warn(`Explorer API lookup failed for ${config.name}:`, error);
    }
  }

  // Fallback to RPC
  if (config.rpcUrl) {
    try {
      const result = await lookupViaRPC(txHash, config);
      if (result) return result;
    } catch (error) {
      console.warn(`RPC lookup failed for ${config.name}:`, error);
    }
  }

  return null;
}

/**
 * Look up transaction via block explorer API
 */
async function lookupViaExplorerAPI(
  txHash: string,
  config: ChainConfig,
): Promise<TransactionInfo | null> {
  if (!config.explorerApi) return null;

  const apiKey = config.apiKey || "";
  const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";

  // Try to get transaction receipt (more reliable)
  const receiptUrl = `${config.explorerApi}?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&tag=latest${apiKeyParam}`;
  const receiptResponse = await fetch(receiptUrl);
  
  if (!receiptResponse.ok) return null;
  
  const receiptData = await receiptResponse.json();
  if (receiptData.error || !receiptData.result) return null;

  const receipt = receiptData.result;

  // Get transaction details
  const txUrl = `${config.explorerApi}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&tag=latest${apiKeyParam}`;
  const txResponse = await fetch(txUrl);
  
  if (!txResponse.ok) return null;
  
  const txData = await txResponse.json();
  if (txData.error || !txData.result) return null;

  const tx = txData.result;

  // Determine status
  let status: "success" | "failed" | "pending" | "unknown" = "unknown";
  if (receipt.status === "0x1" || receipt.status === "0x01") {
    status = "success";
  } else if (receipt.status === "0x0" || receipt.status === "0x00") {
    status = "failed";
  } else if (!receipt.blockNumber) {
    status = "pending";
  }

  // Get block timestamp if possible
  let timestamp: number | null = null;
  if (receipt.blockNumber) {
    try {
      const blockUrl = `${config.explorerApi}?module=proxy&action=eth_getBlockByNumber&tag=${receipt.blockNumber}&boolean=true${apiKeyParam}`;
      const blockResponse = await fetch(blockUrl);
      if (blockResponse.ok) {
        const blockData = await blockResponse.json();
        if (blockData.result?.timestamp) {
          timestamp = parseInt(blockData.result.timestamp, 16);
        }
      }
    } catch (error) {
      // Ignore timestamp errors
    }
  }

  return {
    txHash,
    chainId: config.chainId,
    chainName: config.name,
    from: tx.from || "",
    to: tx.to || null,
    value: tx.value || "0x0",
    status,
    blockNumber: receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null,
    timestamp,
    explorerUrl: `${config.explorerUrl}/${txHash}`,
    gasUsed: receipt.gasUsed || null,
    gasPrice: tx.gasPrice || null,
  };
}

/**
 * Look up transaction via RPC
 */
async function lookupViaRPC(
  txHash: string,
  config: ChainConfig,
): Promise<TransactionInfo | null> {
  if (!config.rpcUrl) return null;

  try {
    // Get transaction
    const txResponse = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionByHash",
        params: [txHash],
        id: 1,
      }),
    });

    if (!txResponse.ok) return null;

    const txData = await txResponse.json();
    if (txData.error || !txData.result) return null;

    const tx = txData.result;

    // Get receipt
    const receiptResponse = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 2,
      }),
    });

    if (!receiptResponse.ok) return null;

    const receiptData = await receiptResponse.json();
    if (receiptData.error || !receiptData.result) return null;

    const receipt = receiptData.result;

    // Determine status
    let status: "success" | "failed" | "pending" | "unknown" = "unknown";
    if (receipt.status === "0x1" || receipt.status === "0x01") {
      status = "success";
    } else if (receipt.status === "0x0" || receipt.status === "0x00") {
      status = "failed";
    } else if (!receipt.blockNumber) {
      status = "pending";
    }

    // Get block timestamp
    let timestamp: number | null = null;
    if (receipt.blockNumber) {
      try {
        const blockResponse = await fetch(config.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getBlockByNumber",
            params: [receipt.blockNumber, false],
            id: 3,
          }),
        });

        if (blockResponse.ok) {
          const blockData = await blockResponse.json();
          if (blockData.result?.timestamp) {
            timestamp = parseInt(blockData.result.timestamp, 16);
          }
        }
      } catch (error) {
        // Ignore timestamp errors
      }
    }

    return {
      txHash,
      chainId: config.chainId,
      chainName: config.name,
      from: tx.from || "",
      to: tx.to || null,
      value: tx.value || "0x0",
      status,
      blockNumber: receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null,
      timestamp,
      explorerUrl: `${config.explorerUrl}/${txHash}`,
      gasUsed: receipt.gasUsed || null,
      gasPrice: tx.gasPrice || null,
    };
  } catch (error) {
    console.error(`RPC lookup error for ${config.name}:`, error);
    return null;
  }
}

/**
 * Detect chain from transaction link
 */
export function detectChainFromTransactionLink(link: string): number | null {
  const lowerLink = link.toLowerCase();
  
  const chainPatterns: Array<[number, string[]]> = [
    [1, ["etherscan.io", "ethereum"]],
    [8453, ["basescan.org", "base"]],
    [137, ["polygonscan.com", "polygon"]],
    [42161, ["arbiscan.io", "arbitrum"]],
    [10, ["optimistic.etherscan.io", "optimism"]],
    [43114, ["snowtrace.io", "avalanche"]],
    [56, ["bscscan.com", "bsc"]],
    [250, ["ftmscan.com", "fantom"]],
    [5000, ["explorer.mantle.xyz", "mantle"]],
    [100, ["gnosisscan.io", "gnosis"]],
    [42220, ["celoscan.io", "celo"]],
    [59144, ["lineascan.build", "linea"]],
    [534352, ["scrollscan.com", "scroll"]],
  ];

  for (const [chainId, patterns] of chainPatterns) {
    if (patterns.some((pattern) => lowerLink.includes(pattern))) {
      return chainId;
    }
  }

  return null;
}

