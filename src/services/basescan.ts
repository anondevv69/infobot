/**
 * Basescan API service for Base network
 * Used to get contract creation information
 */

const BASESCAN_API_BASE = "https://api.basescan.org/api";

export interface ContractCreation {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
}

/**
 * Get contract creation information from Basescan API
 * Returns the creator address and transaction hash
 */
export async function getContractCreation(
  contractAddress: string,
): Promise<ContractCreation | null> {
  try {
    // Basescan API endpoint for contract creation
    // Note: This is a free endpoint that doesn't require an API key
    const url = `${BASESCAN_API_BASE}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(
        `Basescan API error (${response.status}): ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      status?: string;
      message?: string;
      result?: Array<{
        contractAddress: string;
        contractCreator: string;
        txHash: string;
      }>;
    };

    if (data.status !== "1" || !data.result || data.result.length === 0) {
      return null;
    }

    const result = data.result[0];
    return {
      contractAddress: result.contractAddress,
      contractCreator: result.contractCreator,
      txHash: result.txHash,
    };
  } catch (error) {
    console.error("Failed to fetch contract creation from Basescan:", error);
    return null;
  }
}

