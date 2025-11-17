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

export const BASE_FACTORIES: Record<string, BaseFactory> = {
  // Uniswap V3 Factory
  "0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce": {
    name: "Uniswap V3",
    address: "0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce",
    explorerUrl: "https://basescan.org/address/0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce",
    swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
  },
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
 * Get factory info by address
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
 * Get all known factory names
 */
export function getKnownFactoryNames(): string[] {
  return Object.values(BASE_FACTORIES).map((f) => f.name);
}


