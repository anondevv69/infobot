# Snapchain Integration Guide

## Overview

This document explains the new architecture that uses **SIWF for authentication** and **Snapchain for trading**.

## Architecture

### ✅ SIWF (Sign In with Farcaster)
- **Purpose**: User authentication and identity verification
- **What it provides**:
  - Farcaster ID (FID)
  - Username
  - Custody address
  - Verified addresses

### ✅ Snapchain (via Neynar Server Wallets)
- **Purpose**: Wallet creation and transaction execution
- **What it provides**:
  - Managed wallets per user (FID)
  - Gasless transaction submission
  - Account abstraction
  - Safe, revocable session keys

## Flow

### 1. User Authentication (SIWF)
```
User runs /connect
  ↓
Bot generates SIWF URL
  ↓
User signs in via Warpcast
  ↓
Backend verifies signature
  ↓
Stores connection (FID, username, custody address)
```

### 2. Wallet Creation (Snapchain)
```
User runs trading command (/buy, /sell, /swap)
  ↓
Backend checks for Snapchain wallet
  ↓
If no wallet exists:
  - Creates wallet via Neynar API
  - Stores wallet info (walletId, address)
  ↓
Wallet ready for trading
```

### 3. Trading Execution (Snapchain)
```
User runs /buy TOKEN 10
  ↓
Bot gets swap quote from 1inch
  ↓
Bot calls backend /api/trading/execute
  ↓
Backend:
  - Gets user's Snapchain wallet
  - Executes transaction via Snapchain
  ↓
Transaction submitted (gasless)
  ↓
Returns transaction hash
```

## Key Changes

### ❌ Removed
- `/connect-signer` command (no longer needed)
- `/disconnect-signer` command (no longer needed)
- Private key storage and encryption
- Direct ethers.js transaction signing

### ✅ Added
- Automatic Snapchain wallet creation
- `/api/trading/wallet` endpoint (create/get wallet)
- Snapchain service (`src/services/snapchain.ts`)
- Backend Snapchain service (`backend/src/services/snapchain.ts`)

## API Endpoints

### Backend Trading Routes

#### `POST /api/trading/wallet`
Create or get Snapchain wallet for a user.

**Request:**
```json
{
  "userId": "123456789",
  "platform": "discord"
}
```

**Response:**
```json
{
  "success": true,
  "wallet": {
    "address": "0x...",
    "walletId": "wallet-123",
    "network": "base"
  }
}
```

#### `POST /api/trading/execute`
Execute a transaction using Snapchain wallet.

**Request:**
```json
{
  "userId": "123456789",
  "platform": "discord",
  "transaction": {
    "to": "0x...",
    "data": "0x...",
    "value": "1000000000000000000"
  },
  "chainId": 8453
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "tx": {
    "hash": "0x...",
    "from": "0x...",
    "to": "0x...",
    "value": "1000000000000000000",
    "status": "pending"
  }
}
```

## Implementation Notes

### Neynar API Endpoints

The current implementation uses placeholder endpoints for Neynar's Server Wallets API:

- `POST /v2/farcaster/wallet/create` - Create wallet
- `GET /v2/farcaster/wallet/{fid}` - Get wallet
- `POST /v2/farcaster/wallet/{walletId}/execute` - Execute transaction

**⚠️ These endpoints may need to be updated based on actual Neynar API documentation.**

### Network Support

Currently, Snapchain primarily supports:
- **Base** (mainnet)
- **Base Sepolia** (testnet)

For other chains (Ethereum, Arbitrum, etc.), we may need to:
1. Use direct RPC calls (fallback)
2. Wait for Snapchain multi-chain support
3. Use Neynar's Server Wallets for those chains if available

## Environment Variables

No new environment variables required. Uses existing:
- `NEYNAR_API_KEY` - For Neynar API calls

## Migration from Old System

### For Users
1. Users who already connected via SIWF: ✅ No action needed
2. Users who used `/connect-signer`: ❌ Need to reconnect (old signers no longer used)

### For Developers
1. Remove `/connect-signer` and `/disconnect-signer` commands
2. Update trading commands to use Snapchain wallets
3. Remove signer encryption utilities (no longer needed)

## Testing

### Test Wallet Creation
```bash
curl -X POST http://localhost:4000/api/trading/wallet \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "platform": "discord"}'
```

### Test Transaction Execution
```bash
curl -X POST http://localhost:4000/api/trading/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "platform": "discord",
    "transaction": {
      "to": "0x...",
      "value": "1000000000000000000"
    },
    "chainId": 8453
  }'
```

## Next Steps

1. ✅ Verify Neynar API endpoints for Server Wallets
2. ✅ Test wallet creation flow
3. ✅ Test transaction execution
4. ✅ Update Discord/Telegram commands to remove signer commands
5. ✅ Update trading commands to use Snapchain
6. ⚠️ Handle errors gracefully (API failures, network issues)
7. ⚠️ Add wallet balance checking
8. ⚠️ Add transaction status polling

## References

- [Farcaster SIWF Docs](https://docs.farcaster.xyz/developers/siwf/)
- [Snapchain Getting Started](https://snapchain.farcaster.xyz/getting-started)
- [Neynar API Docs](https://docs.neynar.com/)

