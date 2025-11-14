export function shortenAddress(address: string): string {
  const normalized = address.trim();
  if (normalized.length <= 10) {
    return normalized;
  }
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

export function formatExplorerUrl(address: string): string {
  const normalized = address.trim();
  if (normalized.startsWith("0x")) {
    return `https://basescan.org/address/${normalized}`;
  }
  return `https://solscan.io/account/${normalized}`;
}

export function formatAddressLink(address?: string | null): string {
  if (!address) {
    return "N/A";
  }
  const normalized = address.trim();
  return `\`${normalized}\``;
}

