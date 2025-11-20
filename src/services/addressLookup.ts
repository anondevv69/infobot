/**
 * Multi-chain address lookup service
 * Gets basic information about an address across multiple chains
 */

export interface AddressInfo {
  chainId: number;
  chainName: string;
  address: string;
  isContract: boolean;
  balance: string | null;
  transactionCount: number | null;
  explorerUrl: string;
}

interface ChainConfig {
  chainId: number;
  name: string;
  explorerApi: string | null;
  explorerUrl: string;
  rpcUrl: string | null;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: 1,
    name: "Ethereum",
    explorerApi: "https://api.etherscan.io/api",
    explorerUrl: "https://etherscan.io/address",
    rpcUrl: "https://eth.llamarpc.com",
  },
  {
    chainId: 8453,
    name: "Base",
    explorerApi: "https://api.basescan.org/api",
    explorerUrl: "https://basescan.org/address",
    rpcUrl: "https://mainnet.base.org",
  },
  {
    chainId: 137,
    name: "Polygon",
    explorerApi: "https://api.polygonscan.com/api",
    explorerUrl: "https://polygonscan.com/address",
    rpcUrl: "https://polygon-rpc.com",
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    explorerApi: "https://api.arbiscan.io/api",
    explorerUrl: "https://arbiscan.io/address",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  {
    chainId: 10,
    name: "Optimism",
    explorerApi: "https://api-optimistic.etherscan.io/api",
    explorerUrl: "https://optimistic.etherscan.io/address",
    rpcUrl: "https://mainnet.optimism.io",
  },
  {
    chainId: 43114,
    name: "Avalanche",
    explorerApi: "https://api.snowtrace.io/api",
    explorerUrl: "https://snowtrace.io/address",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  },
  {
    chainId: 56,
    name: "BSC",
    explorerApi: "https://api.bscscan.com/api",
    explorerUrl: "https://bscscan.com/address",
    rpcUrl: "https://bsc-dataseed.binance.org",
  },
  {
    chainId: 250,
    name: "Fantom",
    explorerApi: "https://api.ftmscan.com/api",
    explorerUrl: "https://ftmscan.com/address",
    rpcUrl: "https://rpc.ftm.tools",
  },
  {
    chainId: 5000,
    name: "Mantle",
    explorerApi: null,
    explorerUrl: "https://explorer.mantle.xyz/address",
    rpcUrl: "https://rpc.mantle.xyz",
  },
];

/**
 * Look up address information across multiple chains
 * Returns info for all chains where the address has activity
 */
export async function lookupAddress(
  address: string,
): Promise<AddressInfo[]> {
  const results: AddressInfo[] = [];

  // Try all chains in parallel (limit to 5 at a time)
  const chunks = [];
  for (let i = 0; i < CHAIN_CONFIGS.length; i += 5) {
    chunks.push(CHAIN_CONFIGS.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((config) => lookupAddressOnChain(address, config)),
    );
    results.push(...chunkResults.filter((r) => r !== null) as AddressInfo[]);
  }

  return results;
}

/**
 * Look up address on a specific chain
 */
async function lookupAddressOnChain(
  address: string,
  config: ChainConfig,
): Promise<AddressInfo | null> {
  // Try explorer API first if available
  if (config.explorerApi) {
    try {
      const result = await lookupViaExplorerAPI(address, config);
      if (result) return result;
    } catch (error) {
      console.warn(`Explorer API lookup failed for ${config.name}:`, error);
    }
  }

  // Fallback to RPC
  if (config.rpcUrl) {
    try {
      const result = await lookupViaRPC(address, config);
      if (result) return result;
    } catch (error) {
      console.warn(`RPC lookup failed for ${config.name}:`, error);
    }
  }

  return null;
}

/**
 * Look up address via block explorer API
 */
async function lookupViaExplorerAPI(
  address: string,
  config: ChainConfig,
): Promise<AddressInfo | null> {
  if (!config.explorerApi) return null;

  try {
    // Get account balance and transaction count
    const url = `${config.explorerApi}?module=account&action=balance&address=${address}&tag=latest`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === "0" && data.message === "NOTOK") {
      // Address not found or no activity
      return null;
    }

    const balance = data.result || "0";

    // Get transaction count
    const txCountUrl = `${config.explorerApi}?module=proxy&action=eth_getTransactionCount&address=${address}&tag=latest`;
    const txCountResponse = await fetch(txCountUrl);
    let transactionCount: number | null = null;
    let isContract = false;

    if (txCountResponse.ok) {
      const txCountData = await txCountResponse.json();
      if (txCountData.result) {
        transactionCount = parseInt(txCountData.result, 16);
      }
    }

    // Check if it's a contract (has code)
    const codeUrl = `${config.explorerApi}?module=proxy&action=eth_getCode&address=${address}&tag=latest`;
    const codeResponse = await fetch(codeUrl);
    if (codeResponse.ok) {
      const codeData = await codeResponse.json();
      if (codeData.result && codeData.result !== "0x") {
        isContract = true;
      }
    }

    // Only return if address has activity (balance > 0 or transactions > 0)
    const balanceWei = BigInt(balance);
    if (balanceWei === 0n && (transactionCount === null || transactionCount === 0)) {
      return null;
    }

    return {
      chainId: config.chainId,
      chainName: config.name,
      address,
      isContract,
      balance: balance,
      transactionCount,
      explorerUrl: `${config.explorerUrl}/${address}`,
    };
  } catch (error) {
    console.error(`Error looking up address on ${config.name}:`, error);
    return null;
  }
}

/**
 * Look up address via RPC
 */
async function lookupViaRPC(
  address: string,
  config: ChainConfig,
): Promise<AddressInfo | null> {
  if (!config.rpcUrl) return null;

  try {
    // Get balance
    const balanceResponse = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
      }),
    });

    if (!balanceResponse.ok) return null;

    const balanceData = await balanceResponse.json();
    if (balanceData.error || !balanceData.result) return null;

    const balance = balanceData.result;
    const balanceWei = BigInt(balance);

    // Get transaction count
    const txCountResponse = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionCount",
        params: [address, "latest"],
        id: 2,
      }),
    });

    let transactionCount: number | null = null;
    if (txCountResponse.ok) {
      const txCountData = await txCountResponse.json();
      if (txCountData.result) {
        transactionCount = parseInt(txCountData.result, 16);
      }
    }

    // Check if it's a contract
    const codeResponse = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [address, "latest"],
        id: 3,
      }),
    });

    let isContract = false;
    if (codeResponse.ok) {
      const codeData = await codeResponse.json();
      if (codeData.result && codeData.result !== "0x") {
        isContract = true;
      }
    }

    // Only return if address has activity
    if (balanceWei === 0n && (transactionCount === null || transactionCount === 0)) {
      return null;
    }

    return {
      chainId: config.chainId,
      chainName: config.name,
      address,
      isContract,
      balance: balance,
      transactionCount,
      explorerUrl: `${config.explorerUrl}/${address}`,
    };
  } catch (error) {
    console.error(`RPC lookup error for ${config.name}:`, error);
    return null;
  }
}






