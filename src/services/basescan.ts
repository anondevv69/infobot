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

