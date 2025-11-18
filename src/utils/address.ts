const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ETH_ADDRESS_FINDER_REGEX = /0x[a-fA-F0-9]{40}/i;
const SOL_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,48}$/;
const SOL_ADDRESS_FINDER_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,48}/;
const BASE_PREFIX_REGEX = /base(?::mainnet)?:0x[a-fA-F0-9]{40}/i;
const BASE_SEPOLIA_PREFIX_REGEX = /base[-_\s]?sepolia:0x[a-fA-F0-9]{40}/i;
const DEFAULT_ZORA_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export function isEthAddress(value: string): boolean {
  return ETH_ADDRESS_REGEX.test(value);
}

export function isSolAddress(value: string): boolean {
  return SOL_ADDRESS_REGEX.test(value);
}

/**
 * Check if a string is a valid EVM transaction hash (66 chars: 0x + 64 hex)
 */
export function isTransactionHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/i.test(value.trim());
}

export function extractFirstAddress(content: string): string | null {
  const ethMatch = content.match(ETH_ADDRESS_FINDER_REGEX);
  if (ethMatch) {
    return ethMatch[0];
  }

  const solMatch = content.match(SOL_ADDRESS_FINDER_REGEX);
  if (solMatch) {
    return solMatch[0];
  }

  return null;
}

export interface ZoraContractReference {
  address: string;
  chainId: number;
}

export function extractZoraContractReference(content: string): ZoraContractReference | null {
  const sepoliaMatch = content.match(BASE_SEPOLIA_PREFIX_REGEX);
  if (sepoliaMatch) {
    const address = sepoliaMatch[0].split(":")[1];
    if (address) {
      return {
        address: address.toLowerCase(),
        chainId: BASE_SEPOLIA_CHAIN_ID,
      };
    }
  }

  const baseMatch = content.match(BASE_PREFIX_REGEX);
  if (baseMatch) {
    const address = baseMatch[0].split(":")[1];
    if (address) {
      return {
        address: address.toLowerCase(),
        chainId: DEFAULT_ZORA_CHAIN_ID,
      };
    }
  }

  const directMatch = content.match(ETH_ADDRESS_FINDER_REGEX);
  if (directMatch) {
    return {
      address: directMatch[0].toLowerCase(),
      chainId: DEFAULT_ZORA_CHAIN_ID,
    };
  }

  return null;
}

