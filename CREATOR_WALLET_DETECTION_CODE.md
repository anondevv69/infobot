# Creator Wallet Detection Code

This document contains all the code used to detect and display the creator wallet address for token contracts.

## Problem
For token address `0x6ec2FD5636c71b624b3f3B03248aa7F9FD5e98de` on Base network, the bot is not showing:
- Factory information
- Creator wallet address  
- Creation date/transaction

## Current Implementation

### 1. Basescan Service (`src/services/basescan.ts`)
Handles Base network contract creation detection:

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
 * Get contract creation information from Basescan API
 * Returns the creator address and transaction hash
 * Uses the transaction list to find the contract creation transaction
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

    // Build API key parameter (optional, but improves rate limits)
    const apiKeyParam = env.basescanApiKey ? `&apikey=${env.basescanApiKey}` : "";

    // Method 1: Try to get the contract creation transaction
    // Get the first transaction for this contract (which should be the creation transaction)
    const txListUrl = `${BASESCAN_API_BASE}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
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
        console.warn(`[Basescan] API error for ${contractAddress}: ${txData.message || txData.result}`);
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
          const result = {
            contractAddress: contractAddress,
            contractCreator: firstTx.from,
            txHash: firstTx.hash,
            createdAt,
          };
          // Cache the result
          creatorCache.set(normalizedAddress, result);
          return result;
        }
      }
    }

    // Method 2: Try the contract creation endpoint (may be deprecated but worth trying)
    const url = `${BASESCAN_API_BASE}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}${apiKeyParam}`;
    
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
        console.warn(`[Basescan] Contract creation endpoint error for ${contractAddress}: ${data.message || data.result}`);
        return null;
      }
      
      if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
        const apiResult = data.result[0];
        // Try to get timestamp from transaction
        const txUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getTransactionByHash&txhash=${apiResult.txHash}&tag=latest${apiKeyParam}`;
        let createdAt: number | null = null;
        try {
          const txResponse = await fetch(txUrl, { headers: { Accept: "application/json" } });
          if (txResponse.ok) {
            const txData = (await txResponse.json()) as { result?: { blockNumber?: string } };
            if (txData.result?.blockNumber) {
              const blockUrl = `${BASESCAN_API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${txData.result.blockNumber}&boolean=true${apiKeyParam}`;
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
        const result = {
          contractAddress: apiResult.contractAddress,
          contractCreator: apiResult.contractCreator,
          txHash: apiResult.txHash,
          createdAt,
        };
        // Cache the result
        creatorCache.set(normalizedAddress, result);
        return result;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation from Basescan:", error);
    return null;
  }
}
```

### 2. Multi-Chain Contract Creation Service (`src/services/contractCreation.ts`)
Handles contract creation detection for multiple EVM chains:

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

    const apiBase = getExplorerApiBase(chainId);
    if (!apiBase) {
      console.warn(`No explorer API available for chain: ${chainId}`);
      return null;
    }

    // Build API key parameter (optional, but improves rate limits)
    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";

    // Method 1: Try to get the contract creation transaction
    // Get the first transaction for this contract (which should be the creation transaction)
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

    // Method 2: Try the contract creation endpoint (may be deprecated but worth trying)
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

/**
 * Get contract creation transaction to detect factory
 * Returns the transaction that created the contract
 */
export async function getContractCreationTx(
  contractAddress: string,
  chainId: string,
  apiKey?: string | null,
): Promise<{ from: string; to: string | null; hash: string } | null> {
  try {
    const apiBase = getExplorerApiBase(chainId);
    if (!apiBase) {
      return null;
    }

    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : "";
    const url = `${apiBase}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc${apiKeyParam}`;
    
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
          hash: string;
          from: string;
          to: string;
        }> | string;
      };

      // Check for API errors
      if (data.status === "0" || (typeof data.result === "string" && data.result.includes("deprecated"))) {
        console.warn(`[ContractCreation] Transaction list error for ${contractAddress} on ${chainId}: ${data.message || data.result}`);
        return null;
      }
      
      if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
        const firstTx = data.result[0];
        // If "to" is empty, it's a direct contract creation
        // Otherwise, "to" is the factory address
        return {
          from: firstTx.from,
          to: firstTx.to || null,
          hash: firstTx.hash,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch contract creation tx for chain ${chainId}:`, error);
    return null;
  }
}
```

### 3. Handler Code (`src/handlers/clankerAddress.ts`)
How the services are called:

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

  // Detect factory: if creationTx.to exists, that's the factory address
  let detectedFactoryName: string | null = null;
  if (creationTx?.to) {
    // Check if it's a known factory
    const { getFactoryByAddress } = await import("../services/baseFactories");
    const knownFactory = getFactoryByAddress(creationTx.to);
    if (knownFactory) {
      detectedFactoryName = knownFactory.name;
    } else {
      // Show factory address if not in known list
      detectedFactoryName = `Factory: ${creationTx.to.slice(0, 10)}...${creationTx.to.slice(-8)}`;
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

### 4. Embed Display (`src/utils/baseTokenEmbeds.ts`)
How the creator address is displayed:

```typescript
// Developer/Creator Address
const finalCreatorAddress = creatorAddress ?? metrics?.creatorAddress ?? null;
if (finalCreatorAddress) {
  embed.addFields({
    name: "🛠️ Dev",
    value: `\`\`\`\n${finalCreatorAddress}\n\`\`\``,
    inline: false,
  });
}
```

## Known Issues

1. **API Deprecation**: The Basescan API is returning deprecation warnings:
   ```
   "You are using a deprecated V1 endpoint, switch to Etherscan API V2"
   ```

2. **API Response Handling**: The code checks for `status === "1"` for success, but when the API returns deprecation errors, it returns `status === "0"` with an error message.

3. **Missing Data**: For token `0x6ec2FD5636c71b624b3f3B03248aa7F9FD5e98de`, the following are not showing:
   - Factory information
   - Creator wallet address
   - Creation date

## Test Case

**Token Address**: `0x6ec2FD5636c71b624b3f3B03248aa7F9FD5e98de`  
**Network**: Base (Base network)  
**Expected**: Should show creator wallet, factory (if applicable), and creation date  
**Actual**: None of these fields are displayed

## API Endpoints Used

1. **Transaction List**: `GET /api?module=account&action=txlist&address={address}&sort=asc`
   - Gets the first transaction (creation transaction)
   - The `from` field is the creator address
   - The `to` field is the factory address (if created via factory)

2. **Contract Creation**: `GET /api?module=contract&action=getcontractcreation&contractaddresses={address}`
   - Direct endpoint for contract creation info
   - May be deprecated

## Environment Variables

- `BASESCAN_API_KEY`: Optional API key for better rate limits (currently set to `VK75R7GXBEVUHQ4ZHGM1J34FGGE4WUXP1W`)
















