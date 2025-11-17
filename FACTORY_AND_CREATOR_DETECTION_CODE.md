# Factory and Creator Detection Code

Complete code for detecting token creator wallets and factory addresses.

## 1. Creator Detection - Basescan Service (Base Network)

**File**: `src/services/basescan.ts`

```typescript
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
 * Get contract creation information from Basescan API V2
 * Returns the creator address and transaction hash
 * Uses the new V2 API endpoint which works for factory-deployed contracts
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

    // Use the new V2 API endpoint
    const apiKeyParam = env.basescanApiKey ? `?apikey=${env.basescanApiKey}` : "";
    const url = `https://api.basescan.org/api/v2/contracts/${contractAddress}/creation${apiKeyParam}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        result?: {
          contractAddress: string;
          creatorAddress: string;
          transactionHash: string;
          blockNumber: string;
        };
      };

      if (data.status === "1" && data.result) {
        // Get timestamp from block number
        let createdAt: number | null = null;
        try {
          const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${data.result.blockNumber}&boolean=true${apiKeyParam.replace("?", "&")}`;
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

        const result = {
          contractAddress: data.result.contractAddress,
          contractCreator: data.result.creatorAddress,
          txHash: data.result.transactionHash,
          createdAt,
        };
        // Cache the result
        creatorCache.set(normalizedAddress, result);
        return result;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation from Basescan V2:", error);
    return null;
  }
}
```

## 2. Creator Detection - Multi-Chain Service

**File**: `src/services/contractCreation.ts`

```typescript
/**
 * Multi-chain contract creation service
 * Supports Base, BSC, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, Fantom
 */

interface ContractCreation {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
  chainId: string;
  createdAt?: number | null; // Timestamp in seconds
}

// Cache creator addresses (they never change once a contract is deployed)
const creatorCache = new Map<string, ContractCreation>();

/**
 * Get the API base URL for a given chain
 */
function getExplorerApiBase(chainId: string): string | null {
  const apiMap: Record<string, string> = {
    "1": "https://api.etherscan.io/api",
    "eth": "https://api.etherscan.io/api",
    "ethereum": "https://api.etherscan.io/api",
    "56": "https://api.bscscan.com/api",
    "bsc": "https://api.bscscan.com/api",
    "137": "https://api.polygonscan.com/api",
    "polygon": "https://api.polygonscan.com/api",
    "42161": "https://api.arbiscan.io/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "10": "https://api-optimistic.etherscan.io/api",
    "optimism": "https://api-optimistic.etherscan.io/api",
    "8453": "https://api.basescan.org/api",
    "base": "https://api.basescan.org/api",
    "43114": "https://api.snowtrace.io/api",
    "avalanche": "https://api.snowtrace.io/api",
    "250": "https://api.ftmscan.com/api",
    "fantom": "https://api.ftmscan.com/api",
  };
  return apiMap[chainId.toLowerCase()] ?? null;
}

/**
 * Get contract creation information for any EVM chain
 */
export async function getContractCreation(
  contractAddress: string,
  chainId: string,
  apiKey?: string | null,
): Promise<ContractCreation | null> {
  try {
    const normalizedAddress = contractAddress.toLowerCase();
    const cacheKey = `${chainId}:${normalizedAddress}`;
    
    // Check cache first (creator addresses never change)
    const cached = creatorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // For Base network, use the new V2 API endpoint
    if (chainId.toLowerCase() === "base" || chainId === "8453") {
      const apiKeyParam = apiKey ? `?apikey=${apiKey}` : "";
      const url = `https://api.basescan.org/api/v2/contracts/${contractAddress}/creation${apiKeyParam}`;
      
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          status?: string;
          message?: string;
          result?: {
            contractAddress: string;
            creatorAddress: string;
            transactionHash: string;
            blockNumber: string;
          };
        };

        if (data.status === "1" && data.result) {
          // Get timestamp from block number
          let createdAt: number | null = null;
          try {
            const blockUrl = `https://api.basescan.org/api?module=proxy&action=eth_getBlockByNumber&tag=${data.result.blockNumber}&boolean=true${apiKey ? `&apikey=${apiKey}` : ""}`;
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

          const result: ContractCreation = {
            contractAddress: data.result.contractAddress,
            contractCreator: data.result.creatorAddress,
            txHash: data.result.transactionHash,
            chainId: chainId,
            createdAt,
          };
          // Cache the result
          creatorCache.set(cacheKey, result);
          return result;
        }
      }
      // If V2 fails, continue to fallback methods below
    }

    const apiBase = getExplorerApiBase(chainId);
    if (!apiBase) {
      console.warn(`No explorer API available for chain: ${chainId}`);
      return null;
    }

    // Build API key parameter (optional, but improves rate limits)
    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";

    // Method 1: Try to get the contract creation transaction
    // Get the first transaction for this contract (which should be the creation transaction)
    // NOTE: This doesn't work for factory-deployed contracts on Base, but works for other chains
    const txListUrl = `${apiBase}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
    const txResponse = await fetch(txListUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (txResponse.ok) {
      const txData = (await txResponse.json()) as {
        status?: string;
        message?: string;
        result?: Array<{
          hash: string;
          from: string;
          to: string;
          contractAddress?: string;
          timeStamp?: string;
        }> | string;
      };

      // Check for API errors
      if (txData.status === "0" || (typeof txData.result === "string" && txData.result.includes("deprecated"))) {
        console.warn(`[ContractCreation] API error for ${contractAddress} on ${chainId}: ${txData.message || txData.result}`);
        // Continue to fallback method
      } else if (txData.status === "1" && Array.isArray(txData.result) && txData.result.length > 0) {
        const firstTx = txData.result[0];
        // If the "to" field is empty, it's a contract creation transaction
        // Also check if contractAddress matches (for contracts created via factory)
        const isContractCreation = 
          !firstTx.to || 
          firstTx.to === "" || 
          firstTx.contractAddress?.toLowerCase() === normalizedAddress ||
          firstTx.to.toLowerCase() === normalizedAddress;
        
        if (isContractCreation) {
          const createdAt = firstTx.timeStamp ? parseInt(firstTx.timeStamp, 10) : null;
          const result: ContractCreation = {
            contractAddress: contractAddress,
            contractCreator: firstTx.from,
            txHash: firstTx.hash,
            chainId: chainId,
            createdAt,
          };
          // Cache the result
          creatorCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Method 2: Try the contract creation endpoint (may be deprecated but worth trying for non-Base chains)
    const url = `${apiBase}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}${apiKeyParam}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        result?: Array<{
          contractAddress: string;
          contractCreator: string;
          txHash: string;
        }> | string;
      };

      // Check for API errors
      if (data.status === "0" || (typeof data.result === "string" && data.result.includes("deprecated"))) {
        console.warn(`[ContractCreation] Contract creation endpoint error for ${contractAddress} on ${chainId}: ${data.message || data.result}`);
        return null;
      }
      
      if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
        const apiResult = data.result[0];
        // Try to get timestamp from transaction
        let createdAt: number | null = null;
        try {
          const txUrl = `${apiBase}?module=proxy&action=eth_getTransactionByHash&txhash=${apiResult.txHash}&tag=latest${apiKeyParam}`;
          const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
          if (txResponse.ok) {
            const txData = (await txResponse.json()) as { result?: { blockNumber?: string } };
            if (txData.result?.blockNumber) {
              const blockUrl = `${apiBase}?module=proxy&action=eth_getBlockByNumber&tag=${txData.result.blockNumber}&boolean=true${apiKeyParam}`;
              const blockResponse = await fetch(blockUrl, { headers: { Accept: "application/json" } });
              if (blockResponse.ok) {
                const blockData = (await blockResponse.json()) as { result?: { timestamp?: string } };
                if (blockData.result?.timestamp) {
                  createdAt = parseInt(blockData.result.timestamp, 16);
                }
              }
            }
          }
        } catch (error) {
          // Ignore timestamp fetch errors
        }
        const result: ContractCreation = {
          contractAddress: apiResult.contractAddress,
          contractCreator: apiResult.contractCreator,
          txHash: apiResult.txHash,
          chainId: chainId,
          createdAt,
        };
        // Cache the result
        creatorCache.set(cacheKey, result);
        return result;
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch contract creation for chain ${chainId}:`, error);
    return null;
  }
}
```

## 3. Factory Detection - Known Factories

**File**: `src/services/baseFactories.ts`

```typescript
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
  // Add more factories here as needed
};

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
```

## 4. Factory Detection Logic (Discord Handler)

**File**: `src/handlers/clankerAddress.ts`

```typescript
if (baseTokenData) {
  // Fetch creator address and detect factory for Base tokens
  const [contractCreation, creationTx] = await Promise.all([
    getContractCreation(address).catch((error) => {
      console.error(`[Base Token] Failed to get contract creation for ${address}:`, error);
      return null;
    }),
    getContractCreationTx(address, "base", env.basescanApiKey).catch((error) => {
      console.error(`[Base Token] Failed to get creation transaction for ${address}:`, error);
      return null;
    }),
  ]);
  
  // Debug logging
  if (!contractCreation) {
    console.warn(`[Base Token] No contract creation data found for ${address}`);
  } else {
    console.log(`[Base Token] Found creator for ${address}: ${contractCreation.contractCreator}`);
  }
  
  if (!creationTx) {
    console.warn(`[Base Token] No creation transaction found for ${address}`);
  } else {
    console.log(`[Base Token] Found creation tx for ${address}: to=${creationTx.to}, from=${creationTx.from}`);
  }

  // Detect factory: Get the transaction details to find the factory address
  let detectedFactoryName: string | null = null;
  if (contractCreation?.txHash) {
    try {
      // Get the transaction details to find the factory address
      const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";
      const txUrl = `https://api.basescan.org/api?module=proxy&action=eth_getTransactionByHash&txhash=${contractCreation.txHash}&tag=latest${apiKeyParam}`;
      const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
      if (txResponse.ok) {
        const txData = (await txResponse.json()) as { result?: { from?: string; to?: string | null } };
        if (txData.result?.to) {
          // If "to" exists, that's the factory address
          const { getFactoryByAddress } = await import("../services/baseFactories");
          const knownFactory = getFactoryByAddress(txData.result.to);
          if (knownFactory) {
            detectedFactoryName = knownFactory.name;
          } else {
            // Show factory address if not in known list
            detectedFactoryName = `Factory: ${txData.result.to.slice(0, 10)}...${txData.result.to.slice(-8)}`;
          }
        }
      }
    } catch (error) {
      console.error(`[Base Token] Failed to get transaction details for factory detection:`, error);
    }
  }

  // Add creator, factory, and creation date to token data
  baseTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
  baseTokenData.factoryName = detectedFactoryName ?? factory?.name ?? null;
  baseTokenData.createdAt = contractCreation?.createdAt ?? null;

  const { embed, components } = await buildBaseTokenEmbed(
    address,
    baseTokenData?.tokenName ?? null,
    baseTokenData?.tokenSymbol ?? null,
    baseTokenData,
    factory,
    contractCreation?.contractCreator ?? null,
    contractCreation?.createdAt ?? null,
  );

  await message.reply({
    content: `Base token detected${factoryDisplayName} for \`${address}\`.`,
    embeds: [embed],
    components,
  });
  return true;
}
```

## 5. Factory Detection Logic (Telegram Handler)

**File**: `src/platforms/telegram/handlers/message.ts`

```typescript
if (baseTokenData) {
  // Fetch creator address and detect factory for Base tokens
  const { getContractCreation } = await import("../../../services/basescan");
  const { getContractCreationTx } = await import("../../../services/contractCreation");
  const { env } = await import("../../../config");
  
  const [contractCreation, creationTx] = await Promise.all([
    getContractCreation(address).catch(() => null),
    getContractCreationTx(address, "base", env.basescanApiKey).catch(() => null),
  ]);

  // Detect factory: Get the transaction details to find the factory address
  let detectedFactoryName: string | null = null;
  if (contractCreation?.txHash) {
    try {
      // Get the transaction details to find the factory address
      const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";
      const txUrl = `https://api.basescan.org/api?module=proxy&action=eth_getTransactionByHash&txhash=${contractCreation.txHash}&tag=latest${apiKeyParam}`;
      const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
      if (txResponse.ok) {
        const txData = (await txResponse.json()) as { result?: { from?: string; to?: string | null } };
        if (txData.result?.to) {
          // If "to" exists, that's the factory address
          const { getFactoryByAddress } = await import("../../../services/baseFactories");
          const knownFactory = getFactoryByAddress(txData.result.to);
          if (knownFactory) {
            detectedFactoryName = knownFactory.name;
          } else {
            // Show factory address if not in known list
            detectedFactoryName = `Factory: ${txData.result.to.slice(0, 10)}...${txData.result.to.slice(-8)}`;
          }
        }
      }
    } catch (error) {
      console.error(`[Base Token] Failed to get transaction details for factory detection:`, error);
    }
  }

  // Add creator, factory, and creation date to token data
  baseTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
  baseTokenData.factoryName = detectedFactoryName ?? factory?.name ?? null;
  baseTokenData.createdAt = contractCreation?.createdAt ?? null;

  const { embed } = await buildBaseTokenEmbed(
    address,
    baseTokenData?.tokenName ?? null,
    baseTokenData?.tokenSymbol ?? null,
    baseTokenData,
    factory,
    contractCreation?.contractCreator ?? null,
    contractCreation?.createdAt ?? null,
  );

  await bot.sendMessage(chatId, `Base token detected${factoryDisplayName} for <code>${address}</code>.`, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  await bot.sendMessage(chatId, messages[0], {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  return;
}
```

## 6. How It Works

### Creator Detection Flow:

1. **For Base Network**:
   - Uses Basescan API V2: `GET /api/v2/contracts/{address}/creation`
   - Returns: `creatorAddress`, `transactionHash`, `blockNumber`
   - Works for both direct deployments and factory-deployed contracts

2. **For Other EVM Chains**:
   - Uses chain-specific explorer API (Etherscan, BSCScan, etc.)
   - Method 1: Get first transaction from `txlist` (doesn't work for factory-deployed on Base)
   - Method 2: Use `getcontractcreation` endpoint (fallback)

### Factory Detection Flow:

1. **Get Transaction Hash**: From the contract creation data
2. **Fetch Transaction Details**: `GET /api?module=proxy&action=eth_getTransactionByHash`
3. **Extract Factory Address**: The `to` field in the transaction is the factory address
4. **Match Against Known Factories**: Check if factory address is in `BASE_FACTORIES`
5. **Display**: Show factory name if known, or show truncated address if unknown

## 7. API Endpoints Used

### Creator Detection:
- **Base V2**: `GET https://api.basescan.org/api/v2/contracts/{address}/creation`
- **Other Chains**: `GET {explorer}/api?module=account&action=txlist&address={address}&sort=asc`
- **Fallback**: `GET {explorer}/api?module=contract&action=getcontractcreation&contractaddresses={address}`

### Factory Detection:
- **Transaction Details**: `GET {explorer}/api?module=proxy&action=eth_getTransactionByHash&txhash={hash}`
- **Block Timestamp**: `GET {explorer}/api?module=proxy&action=eth_getBlockByNumber&tag={blockNumber}`

## 8. Known Factory Addresses

Currently configured:
- **Uniswap V3**: `0x33128a8dc178e51cc32f0ea8d2b06dfc2febb8ce`

To add more factories, update `BASE_FACTORIES` in `src/services/baseFactories.ts`:
```typescript
"0x...": {
  name: "Factory Name",
  address: "0x...",
  explorerUrl: "https://basescan.org/address/0x...",
  swapUrl: "https://...",
}
```

