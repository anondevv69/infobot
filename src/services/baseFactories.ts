/**
 * Known Base network factory contract addresses
 * These are the factory contracts that create tokens on Base
 */

export interface BaseFactory {
  name: string;
  address: string;
  explorerUrl: string;
  swapUrl?: string;
}

/**
 * Token Factory Map - Maps token factory addresses to their names
 * These are the factories that CREATE tokens (not DEX factories that create pools)
 */
export const TOKEN_FACTORY_MAP: Record<string, string> = {
  // ApeStore (multiple factory addresses)
  "0x7777777778f3b8b3d85f95a08d6e225a8f1ccfc6": "ApeStore",
  // ApeStore deployment contract (from token 0x05a5b4e217004eb84c6787e0ecbe7a46cfd94cdd)
  // Pattern: 0xb3bea12a...0261dabf - need to check logs for full address
  // KLIK Finance
  "0x4a0a35e7b9b4a29565b0f77ec0957dd64bb337d0": "KLIK Finance",
  "0xb6cb1c049ee8942683fd3172f7eba63b6e8a6835": "KLIK Finance",
  // FEY (multiple factory addresses)
  "0xc1d0e984d87c32f2b0d45fb8f50aa2be6e9eb687": "Fey",
  "0x94c2ec832c8f885b34b8ffa2724e6e8a9f4a63bb": "Fey",
  "0xbc13a34e6fed856e66a153a1ef8e2903e8963924": "Fey", // Found from token lookup
  "0x8eef0dc80adf57908bb1be0236c2a72a7e379c2d": "Fey", // Fey deployment contract
  // Clanker
  "0xb07b3c97a7658c520267dbb5aeb41199fe6b2c6a": "Clanker",
  // Zora
  "0xabefbc9fd2f806065b4f3c237d4b59d9a97bcac7": "Zora",
  // Virtuals
  "0x42f4f5a3389ca0bed694de339f4d432acddb1ea9": "Virtuals",
  // Paragraph
  "0x9e68675b4bbaa7c281e07496cf24bae65e8450ec": "Paragraph",
};

export const BASE_FACTORIES: Record<string, BaseFactory> = {
  // Uniswap V3 Factory (DEX factory - for reference, but we use TOKEN_FACTORY_MAP for token factories)
  "0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce": {
    name: "Uniswap V3",
    address: "0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce",
    explorerUrl: "https://basescan.org/address/0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce",
    swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
  },
  // ApeStore Factory (TODO: Need to find the correct address)
  // "0x...": {
  //   name: "ApeStore",
  //   address: "0x...",
  //   explorerUrl: "https://basescan.org/address/0x...",
  // },
  // Klik Finance Factory (TODO: Need to find the correct address)
  // "0x...": {
  //   name: "Klik Finance",
  //   address: "0x...",
  //   explorerUrl: "https://basescan.org/address/0x...",
  // },
  // Rainbow Factory (partial address provided - need full address)
  // "0xd2ce...939": {
  //   name: "Rainbow",
  //   address: "0x...", // TODO: Get full address
  //   explorerUrl: "https://basescan.org/address/",
  //   swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
  // },
  // ApeStore (partial address provided - need full address)
  // "0xc017...d93": {
  //   name: "ApeStore",
  //   address: "0x...", // TODO: Get full address
  //   explorerUrl: "https://basescan.org/address/",
  //   swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
  // },
  // Fey Factory (partial address provided - need full address)
  // "0x7cee...bce": {
  //   name: "Fey",
  //   address: "0x...", // TODO: Get full address
  //   explorerUrl: "https://basescan.org/address/",
  //   swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
  // },
  // Virtuals (partial address provided - need full address)
  // "0x9e0d...7ca": {
  //   name: "Virtuals",
  //   address: "0x...", // TODO: Get full address
  //   explorerUrl: "https://basescan.org/address/",
  //   swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
  // },
  // Zora Factory (need actual address)
  // ZORA: {
  //   name: "Zora",
  //   address: "0x...", // TODO: Replace with actual Zora factory address
  //   explorerUrl: "https://basescan.org/address/",
  //   swapUrl: "https://zora.co/",
  // },
};

/**
 * Detect which factory created a token by checking the contract creation transaction
 * This requires querying Basescan API or Base RPC
 */
export async function detectTokenFactory(
  contractAddress: string,
): Promise<BaseFactory | null> {
  try {
    // Check contract creation transaction via Basescan API
    const basescanUrl = `https://api.basescan.org/api?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}&apikey=YourApiKeyToken`;
    
    // For now, we'll use a simpler approach: check if token exists on DexScreener
    // and infer from metadata or use pattern matching
    
    // TODO: Implement actual factory detection via:
    // 1. Basescan API to get creation transaction
    // 2. Parse creation transaction to find factory address
    // 3. Match factory address against known factories
    
    return null;
  } catch (error) {
    console.error("Failed to detect token factory:", error);
    return null;
  }
}

/**
 * Get token factory name by address (from TOKEN_FACTORY_MAP)
 */
export function getTokenFactoryName(address: string): string | null {
  const normalized = address.toLowerCase();
  return TOKEN_FACTORY_MAP[normalized] ?? null;
}

/**
 * Get factory info by address (for DEX factories)
 */
export function getFactoryByAddress(address: string): BaseFactory | null {
  const normalized = address.toLowerCase();
  // Check if address is a key in BASE_FACTORIES
  if (BASE_FACTORIES[normalized]) {
    return BASE_FACTORIES[normalized];
  }
  // Also check by address property (for backwards compatibility)
  for (const factory of Object.values(BASE_FACTORIES)) {
    if (factory.address.toLowerCase() === normalized) {
      return factory;
    }
  }
  return null;
}

/**
 * Create a BaseFactory object from a token factory address
 */
export function createTokenFactory(address: string): BaseFactory | null {
  const factoryName = getTokenFactoryName(address);
  if (!factoryName) {
    return null;
  }
  return {
    name: factoryName,
    address: address.toLowerCase(),
    explorerUrl: `https://basescan.org/address/${address}`,
  };
}

/**
 * Get all known factory names
 */
export function getKnownFactoryNames(): string[] {
  return Object.values(BASE_FACTORIES).map((f) => f.name);
}







