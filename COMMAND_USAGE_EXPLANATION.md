# Command Usage Explanation

## Overview

This document explains when and why these three commands would be used:

1. `/debug` - Development/debugging tool
2. `/connect-signer` - Trading feature (partially implemented)
3. `/disconnect-signer` - Trading feature (partially implemented)

---

## 1. `/debug` Command

### **When it's used:**
- **Development/Testing**: When debugging SIWF (Sign In with Farcaster) URL generation issues
- **Troubleshooting**: When users report problems connecting their Farcaster account
- **Deployment verification**: After deploying to check if SIWF URLs are generating correctly

### **What it does:**
- Generates a test SIWF URL using the same logic as `/connect`
- Checks if the URL contains the correct domain (`farcaster.xyz`) vs wrong domain (`warpcast.com`)
- Fetches backend debug info (deployment status, health checks)
- Shows configuration (backend URL, referral code, user ID)
- Provides recommendations if issues are detected

### **Why it exists:**
SIWF URLs can be unreliable and often fail with "Could not reach Farcaster" errors. This command helps diagnose:
- Is the URL format correct?
- Is the backend accessible?
- Are environment variables set correctly?
- Is the latest code deployed?

### **Current Status:**
✅ **Fully implemented** - Works in Discord only (not in Telegram)

### **Recommendation:**
- **Keep it** - Useful for debugging SIWF issues
- **Low priority** - Only used during development/troubleshooting
- **Low bottleneck risk** - Only runs when explicitly called

---

## 2. `/connect-signer` Command

### **When it's used:**
- **Trading setup**: When a user wants to enable automated trading
- **After SIWF connection**: User must first run `/connect` to link Farcaster account, then `/connect-signer` to add trading capability

### **What it does:**
1. Checks if user is connected via SIWF (requires `/connect` first)
2. Validates the private key format (64 hex characters)
3. Tests the signer (validates it works by deriving address)
4. Encrypts the private key
5. Stores encrypted signer in backend database
6. Links signer to user's Farcaster account (FID)

### **Why it exists:**
**SIWF alone is NOT enough for trading.**

- SIWF provides: FID, username, custody address (authentication)
- SIWF does NOT provide: Signer private key for executing transactions
- Trading requires: A signer that can sign blockchain transactions on behalf of the user

### **Security:**
- Private key is encrypted before storage
- Stored in backend database (not in bot memory)
- Linked to user's Farcaster identity (FID)

### **Current Status:**
⚠️ **Partially implemented** - Code exists but trading commands are NOT registered

**Issues:**
- `/connect-signer` command exists and works
- `/disconnect-signer` command exists and works
- **BUT** trading commands (`/buy`, `/sell`, `/swap`) are:
  - Registered in `register-global-commands.ts` (not in main `src/registerCommands.ts`)
  - **NOT handled** in `src/index.ts` command handler
  - Code exists in `src/commands/trade.ts` but is never called

**Result:** Users can connect signers, but cannot actually trade because trading commands don't work.

### **Recommendation:**
- **Option 1: Remove entirely** if trading is not a priority
  - Removes security risk (storing private keys)
  - Removes unused code
  - Reduces complexity
  
- **Option 2: Complete the implementation** if trading is desired
  - Register `/buy`, `/sell`, `/swap` in main command handler
  - Add handlers in `src/index.ts`
  - Test end-to-end trading flow

### **Bottleneck Risk:**
- **Medium** - Requires private key encryption/decryption
- **Security risk** - Storing encrypted private keys in database
- **Complexity** - Adds significant code complexity

---

## 3. `/disconnect-signer` Command

### **When it's used:**
- **Security**: When user wants to remove their trading signer
- **Revocation**: When user no longer wants automated trading
- **Account cleanup**: When disconnecting Farcaster account

### **What it does:**
1. Checks if user is connected via SIWF
2. Removes signer from backend database
3. Disables trading commands for that user

### **Why it exists:**
- Allows users to revoke trading access
- Security best practice (users should be able to disconnect)
- Required for account cleanup

### **Current Status:**
⚠️ **Partially implemented** - Works but trading commands don't work anyway

### **Recommendation:**
- Same as `/connect-signer` - either remove or complete implementation

---

## Trading Feature Status Summary

### What Works:
✅ `/connect` - Connects Farcaster account via SIWF
✅ `/connect-signer` - Stores encrypted trading signer
✅ `/disconnect-signer` - Removes trading signer
✅ `/balance` - Check wallet balance (if implemented)

### What Doesn't Work:
❌ `/buy` - Not registered in main handler
❌ `/sell` - Not registered in main handler
❌ `/swap` - Not registered in main handler

### The Problem:
Users can set up trading (connect signer), but **cannot actually trade** because the trading commands are not connected to the bot.

---

## Recommendations

### If Trading is NOT a Priority:
1. **Remove trading features entirely:**
   - Delete `/connect-signer` command
   - Delete `/disconnect-signer` command
   - Delete `/buy`, `/sell`, `/swap` from `register-global-commands.ts`
   - Delete `src/commands/trade.ts`
   - Delete `src/commands/connectSigner.ts`
   - Delete `src/commands/disconnectSigner.ts`
   - Remove signer storage from backend

   **Benefits:**
   - Removes security risk (no private key storage)
   - Reduces code complexity
   - Removes unused features
   - Reduces memory/database usage

### If Trading IS a Priority:
1. **Complete the implementation:**
   - Add `/buy`, `/sell`, `/swap` to `src/registerCommands.ts`
   - Add handlers in `src/index.ts` switch statement
   - Test end-to-end trading flow
   - Add error handling and user feedback

   **Benefits:**
   - Enables actual trading functionality
   - Makes signer connection useful
   - Provides value to users

### Keep `/debug`:
- Useful for troubleshooting SIWF issues
- Low overhead (only runs when called)
- Helps with deployment verification

---

## Current Code Locations

### Trading Commands (Not Working):
- `register-global-commands.ts` - Has `/buy`, `/sell`, `/swap` registered
- `src/commands/trade.ts` - Has implementation code
- `src/index.ts` - **Missing handlers** (not in switch statement)

### Signer Commands (Working but Useless):
- `src/commands/connectSigner.ts` - Works
- `src/commands/disconnectSigner.ts` - Works
- `src/registerCommands.ts` - Registered
- `src/index.ts` - Handlers exist

### Debug Command (Working):
- `src/commands/debug.ts` - Works
- `src/registerCommands.ts` - Registered
- `src/index.ts` - Handler exists

---

## Conclusion

**These commands are for a trading feature that is incomplete.**

- `/debug` - **Keep** (useful debugging tool)
- `/connect-signer` - **Remove or complete** (currently useless without working trading commands)
- `/disconnect-signer` - **Remove or complete** (currently useless without working trading commands)

**Recommendation:** If trading is not actively being developed, **remove all trading-related code** to reduce complexity and security risk.

