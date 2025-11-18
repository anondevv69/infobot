# Trading Feature Setup Guide

## Overview

The bot now supports **Farcaster wallet integration for trading**! Users can connect their Farcaster accounts and trade tokens directly through Telegram and Discord.

## Features

✅ **Sign In with Farcaster (SIWF)** - Connect Farcaster accounts  
✅ **Multi-chain Support** - Trade on Base, Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Fantom  
✅ **DEX Integration** - Uses 1inch aggregator for best swap rates  
✅ **Balance Checking** - Check token balances across chains  
✅ **Buy/Sell/Swap** - Full trading functionality  

## Commands

### Discord Commands

- `/connect` - Connect your Farcaster account
- `/disconnect` - Disconnect your Farcaster account
- `/balance [token] [chain]` - Check wallet balance
- `/buy <token> <amount> [chain]` - Buy tokens with ETH
- `/sell <token> <amount> [chain]` - Sell tokens for ETH
- `/swap <from> <to> <amount> [chain]` - Swap between tokens

### Telegram Commands

- `/connect` - Connect your Farcaster account
- `/disconnect` - Disconnect your Farcaster account
- `/balance [token] [chain]` - Check wallet balance
- `/buy <token> <amount> [chain]` - Buy tokens with ETH
- `/sell <token> <amount> [chain]` - Sell tokens for ETH
- `/swap <from> <to> <amount> [chain]` - Swap between tokens

## Setup

### Required Environment Variables

```bash
# Required (already set)
DISCORD_TOKEN=your-discord-token
DISCORD_CLIENT_ID=your-discord-client-id
NEYNAR_API_KEY=your-neynar-api-key
ZORA_API_KEY=your-zora-api-key

# Optional (for better performance)
ONEINCH_API_KEY=your-1inch-api-key  # Get from https://portal.1inch.dev/
QUICKNODE_API_KEY=your-quicknode-api-key  # For premium RPC endpoints
```

### Getting a 1inch API Key (Optional but Recommended)

1. Go to https://portal.1inch.dev/
2. Sign up for a free account
3. Create a new API key
4. Add it to your `.env` file as `ONEINCH_API_KEY`

**Note:** Without an API key, the bot will use public endpoints which have rate limits.

## How It Works

### 1. User Connection Flow

1. User runs `/connect` command
2. Bot generates a SIWF challenge and QR code/link
3. User scans QR code or clicks link in Warpcast
4. User approves the connection
5. Bot verifies the signature and stores the session
6. User can now trade using their Farcaster custody wallet

### 2. Trading Flow

1. User runs a trading command (`/buy`, `/sell`, `/swap`)
2. Bot checks if user is connected
3. Bot fetches token information
4. Bot checks user's balance
5. Bot gets swap quote from 1inch
6. Bot prepares transaction data
7. **User must sign the transaction with their wallet** (bot provides the data)

### 3. Transaction Signing

⚠️ **Important:** The bot **cannot** execute transactions on behalf of users for security reasons. Users must:

1. Copy the transaction data provided by the bot
2. Sign it using:
   - MetaMask or other wallet browser extension
   - WalletConnect
   - Warpcast (if they have custody wallet access)
   - Any other wallet interface

## Supported Chains

- **Base** (Chain ID: 8453) - Default
- **Ethereum** (Chain ID: 1)
- **BSC** (Chain ID: 56)
- **Polygon** (Chain ID: 137)
- **Arbitrum** (Chain ID: 42161)
- **Optimism** (Chain ID: 10)
- **Avalanche** (Chain ID: 43114)
- **Fantom** (Chain ID: 250)

## Examples

### Check Balance
```
/balance
/balance native 8453
/balance 0x1234... 8453
```

### Buy Tokens
```
/buy 0x1234... 0.1
/buy 0x1234... 0.1 8453
```

### Sell Tokens
```
/sell 0x1234... 100
/sell 0x1234... 100 8453
```

### Swap Tokens
```
/swap native 0x1234... 0.1
/swap 0x1234... 0x5678... 100 8453
```

## Security Notes

1. **No Private Keys Stored** - The bot never stores or has access to private keys
2. **Session Management** - Sessions are stored in memory (use Redis/database in production)
3. **Signature Verification** - All SIWF signatures are verified via Neynar API
4. **Transaction Signing** - Users must sign transactions themselves
5. **Rate Limiting** - Consider adding rate limits for trading commands

## Production Considerations

### 1. Session Storage

Currently, sessions are stored in memory. For production:

- Use Redis for session storage
- Add session expiration
- Implement proper cleanup

### 2. Transaction Signing

For a better UX, consider:

- Integrating WalletConnect for in-bot signing
- Using account abstraction for gasless transactions
- Building a web interface for transaction signing

### 3. Error Handling

- Add retry logic for API calls
- Implement proper error messages
- Add transaction status tracking

### 4. Rate Limiting

- Add rate limits per user
- Implement cooldowns for trading commands
- Monitor API usage

## Troubleshooting

### "Not Connected" Error

- User needs to run `/connect` first
- Check if SIWF challenge expired (5 minutes)
- Verify Neynar API key is valid

### "Insufficient Balance" Error

- User doesn't have enough tokens
- Check the correct chain
- Verify token address is correct

### "Could not get swap quote" Error

- 1inch API might be down
- Token pair might not be available
- Check if 1inch API key is set (optional but recommended)

### Transaction Signing Issues

- User must sign transactions manually
- Provide clear instructions
- Consider adding a web interface for easier signing

## Next Steps

1. **Test the connection flow** - Try `/connect` and verify it works
2. **Test balance checking** - Use `/balance` to check wallet balances
3. **Test trading commands** - Try `/buy`, `/sell`, `/swap` with small amounts
4. **Add transaction signing UI** - Build a web interface for easier signing
5. **Add session persistence** - Use Redis/database for production
6. **Add rate limiting** - Protect against abuse
7. **Add transaction tracking** - Track pending/completed transactions

## Support

For issues or questions:
- Check the logs for error messages
- Verify all environment variables are set
- Test with small amounts first
- Use testnet for initial testing

---

**Built with ❤️ for the Farcaster community**

