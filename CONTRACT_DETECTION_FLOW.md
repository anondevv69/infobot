# Contract Detection Flow

## How Discord Detects Contracts

### 1. Address Detection Flow (in `src/handlers/clankerAddress.ts`)

When a message contains an Ethereum address, Discord processes it in this order:

1. **Zora Coin Check** (lines 54-277)
   - First checks if the address is a Zora creator coin or any Zora coin
   - Fetches coin data from Zora API
   - Shows Zora coin embed if found

2. **Clanker Token Check** (lines 200-277)
   - Checks if the address is a Clanker deployment
   - Fetches Clanker token data
   - Shows Clanker token embed if found

3. **Base Token Check** (lines 280-304)
   - **This is where Base tokens are detected**
   - Calls `fetchBaseTokenData(address)` from DexScreener API
   - If token data exists, shows Base token embed
   - Also fetches:
     - Factory information (if available)
     - **Contract creation info** (creator address)

4. **Farcaster User Check** (lines 307+)
   - If no token found, checks for Farcaster user by wallet
   - Shows wallet profile with Farcaster info if found

### 2. Base Token Detection Details

**Location**: `src/handlers/clankerAddress.ts` lines 280-304

```typescript
// Check for Base network tokens (Rainbow, ApeStore, Fey, etc.)
if (isEthAddress(address)) {
  const [baseTokenData, factory, contractCreation] = await Promise.all([
    fetchBaseTokenData(address),        // DexScreener API
    detectTokenFactory(address),         // Factory detection
    getContractCreation(address).catch(() => null),  // Creator address
  ]);

  if (baseTokenData) {
    const { embed, components } = await buildBaseTokenEmbed(
      address,
      null,
      null,
      baseTokenData,
      factory,
      contractCreation?.contractCreator ?? null,  // Creator address passed here
    );
    // ... send embed
  }
}
```

## How We Find the Contract Creator

### Method 1: Transaction List (Primary Method)

**Location**: `src/services/basescan.ts` lines 23-56

We use Basescan API to get the first transaction for the contract address:

```
GET https://api.basescan.org/api?module=account&action=txlist&address={contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc
```

**Logic**:
- Get the first transaction (sorted ascending by block number)
- If the transaction has an empty `to` field OR the `contractAddress` matches, it's a contract creation transaction
- The `from` field contains the creator's address

**Example**:
```json
{
  "status": "1",
  "result": [{
    "hash": "0x...",
    "from": "0xCreatorAddress...",  // This is the creator
    "to": "",                        // Empty = contract creation
    "contractAddress": "0x19BAa937eFaeEA559FfcE0fa489269415C64003A"
  }]
}
```

### Method 2: Contract Creation Endpoint (Fallback)

**Location**: `src/services/basescan.ts` lines 58-86

Tries the deprecated endpoint as a fallback:
```
GET https://api.basescan.org/api?module=contract&action=getcontractcreation&contractaddresses={contractAddress}
```

**Note**: This endpoint is deprecated but may still work for some contracts.

## Display in Embed

**Location**: `src/utils/baseTokenEmbeds.ts` lines 108-115

The creator address is displayed in the Base token embed:

```typescript
// Creator Address (if available)
if (creatorAddress) {
  embed.addFields({
    name: "Creator",
    value: `\`\`\`\n${creatorAddress}\n\`\`\``,
    inline: false,
  });
}
```

## Why Creator Might Not Show

1. **API Rate Limits**: Basescan API may have rate limits
2. **Transaction Not Found**: The contract might be very old or the transaction data might not be available
3. **API Error**: The Basescan API might be down or returning errors
4. **Contract Creation via Factory**: If created via a factory, the `from` address might be the factory, not the actual creator

## Testing

To test if creator detection is working:

```bash
# Test the Basescan API directly
curl "https://api.basescan.org/api?module=account&action=txlist&address=0x19BAa937eFaeEA559FfcE0fa489269415C64003A&startblock=0&endblock=99999999&page=1&offset=1&sort=asc"
```

Look for the first transaction's `from` field - that's the creator address.
















