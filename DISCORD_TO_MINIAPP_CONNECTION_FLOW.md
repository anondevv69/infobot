# Complete Discord to Farcaster Mini App Connection Flow

## Overview
This document explains how a Discord user connects their Farcaster account to the bot through the Mini App, including all data communication and verification steps.

---

## Flow Diagram

```
Discord User
    │
    ├─> Runs /connect command
    │
    ├─> Bot generates connection URL (with userId & platform)
    │
    ├─> User clicks link → Opens Mini App or SIWF flow
    │
    ├─> User authenticates with Farcaster (QR code or sign-in)
    │
    ├─> Mini App sends Farcaster data to Backend
    │
    ├─> Backend stores connection (userId + Farcaster FID)
    │
    └─> User can now use trading commands in Discord
```

---

## Step-by-Step Flow

### Step 1: Discord User Initiates Connection

**Location**: `src/commands/connect.ts`

**User Action**: Runs `/connect` command in Discord

**Bot Process**:
1. Gets Discord user ID: `interaction.user.id`
2. Checks if user is already connected: `getSIWFSession(userId, "discord", backendUrl)`
3. If not connected, generates a challenge and connection URL

**Code**:
```typescript
const userId = interaction.user.id; // Discord user ID
const challenge = generateSIWFChallenge(userId, "discord");
const siwfUrl = generateSIWFUrl(challenge, userId, "discord", backendUrl, referralCode);
```

**Data Generated**:
- `challenge`: Random 32-byte hex string (cryptographic challenge)
- `userId`: Discord user ID (e.g., "327936936461336576")
- `platform`: "discord"
- `backendUrl`: "https://infobot-production-f74e.up.railway.app"

---

### Step 2: Bot Stores Pending Verification

**Location**: `src/services/siwf.ts` → `storePendingVerificationInBackend()`

**Process**:
- Bot sends challenge to backend for later verification
- Backend stores: `{ challenge, userId, platform, timestamp }`

**API Call**:
```typescript
POST ${backendUrl}/api/siwf/pending
Body: {
  challenge: "abc123...",
  userId: "327936936461336576",
  platform: "discord"
}
```

**Purpose**: Backend can verify the challenge when user completes authentication

---

### Step 3: Bot Generates Connection URL

**Location**: `src/services/siwf.ts` → `generateSIWFUrl()`

**Two Options**:

#### Option A: Server-Side SIWF Flow (Default, Recommended)
**URL Format**:
```
https://warpcast.com/~/signin?challenge={challenge}&redirect_uri={callbackUrl}&ref={referralCode}
```

**Callback URL**:
```
https://infobot-production-f74e.up.railway.app/api/siwf/callback?challenge={challenge}&userId={userId}&platform=discord
```

**Flow**:
1. User clicks link → Opens Warpcast
2. User signs in to Farcaster
3. Warpcast redirects to callback URL with signed message
4. Backend verifies signature and stores connection

#### Option B: Mini App Flow (Optional, Better UX)
**URL Format**:
```
https://farcaster.xyz/miniapps/J68v-h9yA2J3/infobot?userId={userId}&platform=discord&backendUrl={backendUrl}
```

**Flow**:
1. User clicks link → Opens Mini App in Farcaster/Warpcast
2. Mini App authenticates user with Farcaster SDK
3. Mini App sends user data directly to backend
4. Backend stores connection

---

### Step 4: Mini App Initialization

**Location**: `miniapp/src/main.ts`

**Process**:
1. Mini App reads URL parameters:
   - `userId`: Discord user ID
   - `platform`: "discord"
   - `backendUrl`: Backend API URL

2. Initializes Farcaster Mini App SDK:
```typescript
sdk = await initMiniAppSDK();
```

3. Checks if user is already authenticated:
```typescript
user = await sdk.actions.signIn();
```

**If Not Authenticated**:
- Shows "Connect with Farcaster" button
- User clicks → Shows QR code (on mobile) or sign-in flow
- User authenticates with Farcaster

**If Authenticated**:
- Displays user info (username, FID, custody address)
- Proceeds to link accounts

---

### Step 5: Farcaster Authentication

**Location**: `miniapp/src/main.ts` → `connectWallet()`

**Process**:
1. User clicks "Connect with Farcaster" button
2. Mini App calls: `sdk.actions.signIn()`
3. Farcaster SDK shows authentication flow:
   - **Mobile**: QR code for scanning with Warpcast app
   - **Desktop**: Redirect to Warpcast web
4. User approves connection in Warpcast
5. SDK returns authenticated user object

**User Object Structure**:
```typescript
{
  fid: 408711,                    // Farcaster ID
  username: "rayblanco.eth",      // Farcaster username
  custodyAddress: "0x...",        // User's custody wallet
  verifiedAddresses: ["0x..."],   // Verified Ethereum addresses
  // Optional signer info (for trading):
  signerPrivateKey: "...",        // Delegated signer private key
  signerPublicKey: "...",         // Delegated signer public key
}
```

---

### Step 6: Mini App Sends Data to Backend

**Location**: `miniapp/src/main.ts` → `linkToBot()`

**Process**:
1. Mini App collects all necessary data
2. Makes POST request to backend

**API Endpoint**: `POST ${backendUrl}/api/siwf/miniapp-connect`

**Request Headers**:
```typescript
{
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Origin': 'https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com'
}
```

**Request Body**:
```typescript
{
  userId: "327936936461336576",        // Discord user ID
  platform: "discord",                 // Platform identifier
  fid: 408711,                         // Farcaster ID
  username: "rayblanco.eth",           // Farcaster username
  custodyAddress: "0x...",             // Custody wallet address
  verifiedAddresses: ["0x..."],        // Verified Ethereum addresses
  signerPrivateKey: "...",             // Optional: Delegated signer private key
  signerPublicKey: "...",              // Optional: Delegated signer public key
  // Optional Discord OAuth info:
  discordUsername: "username#1234",   // If Discord OAuth was used
  discordId: "327936936461336576"      // Discord user ID (from OAuth)
}
```

**CORS Configuration**:
- Backend must allow origin: `https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com`
- Headers: `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`
- Methods: `POST, OPTIONS`

---

### Step 7: Backend Receives and Validates Data

**Location**: `backend/src/routes/siwf.ts` → `POST /miniapp-connect`

**Process**:
1. **CORS Headers Set First** (before any processing):
   ```typescript
   setCORSHeaders(req, res); // Sets exact origin, credentials, methods, headers
   ```

2. **Validates Required Fields**:
   - `userId`: Must be present
   - `platform`: Must be "discord" or "telegram"
   - `fid`: Must be a valid Farcaster ID

3. **Stores Connection**:
   ```typescript
   const key = `${platform}:${userId}`; // e.g., "discord:327936936461336576"
   verifiedConnections.set(key, {
     fid: 408711,
     username: "rayblanco.eth",
     custodyAddress: "0x...",
     verifiedAddresses: [...],
     platform: "discord",
     signerPrivateKey: "...",  // Optional
     signerPublicKey: "...",    // Optional
   });
   ```

4. **Returns Success Response**:
   ```typescript
   {
     success: true,
     message: "Successfully connected to bot",
     connection: {
       fid: 408711,
       username: "rayblanco.eth",
       custodyAddress: "0x..."
     }
   }
   ```

---

### Step 8: Backend Storage

**Location**: `backend/src/routes/siwf.ts`

**Storage Method**: In-memory Map (in production, use database)

**Storage Key Format**: `${platform}:${userId}`
- Example: `"discord:327936936461336576"`

**Stored Data**:
```typescript
{
  fid: number,                    // Farcaster ID
  username: string,                // Farcaster username
  custodyAddress: string,          // Custody wallet
  verifiedAddresses: string[],     // Verified Ethereum addresses
  platform: "discord" | "telegram", // Platform
  signerPrivateKey?: string,       // Optional: For trading
  signerPublicKey?: string,        // Optional: For trading
  signerFid?: number               // Optional: Signer FID
}
```

---

### Step 9: Verification in Discord

**Location**: `src/commands/connect.ts`

**User Action**: Runs `/connect` command again (or bot checks automatically)

**Bot Process**:
1. Checks backend for connection:
   ```typescript
   GET ${backendUrl}/api/siwf/connection?userId={userId}&platform=discord
   ```

2. If connection exists, displays:
   ```
   ✅ Already Connected
   Farcaster ID: 408711
   Username: @rayblanco.eth
   Custody Wallet: 0x...
   Trading Signer: Connected / Not connected
   ```

3. User can now use trading commands:
   - `/balance` - Check token balance
   - `/buy` - Buy tokens
   - `/sell` - Sell tokens
   - `/swap` - Swap tokens

---

## Data Communication Summary

### What Discord Bot Sends to Backend:
1. **Pending Verification** (Step 2):
   - `challenge`: Cryptographic challenge
   - `userId`: Discord user ID
   - `platform`: "discord"

### What Mini App Sends to Backend:
1. **Connection Data** (Step 6):
   - `userId`: Discord user ID
   - `platform`: "discord"
   - `fid`: Farcaster ID
   - `username`: Farcaster username
   - `custodyAddress`: Custody wallet address
   - `verifiedAddresses`: Verified Ethereum addresses
   - `signerPrivateKey`: Optional delegated signer
   - `signerPublicKey`: Optional delegated signer public key

### What Backend Returns:
1. **Success Response**:
   - `success: true`
   - `message`: "Successfully connected to bot"
   - `connection`: { fid, username, custodyAddress }

2. **Error Response**:
   - `error`: Error message
   - `message`: Detailed error description

### What Discord Bot Retrieves:
1. **Connection Status**:
   - `fid`: Farcaster ID
   - `username`: Farcaster username
   - `custodyAddress`: Custody wallet
   - `verifiedAddresses`: Verified addresses
   - `signerAddress`: Trading signer address (if connected)

---

## Security Considerations

### 1. Challenge Verification
- **Purpose**: Prevents replay attacks
- **Method**: Random 32-byte challenge stored in backend
- **Expiration**: 5 minutes
- **Verification**: Backend checks challenge exists and hasn't expired

### 2. Signature Verification (Server-Side SIWF)
- **Purpose**: Cryptographically verify user owns the Farcaster account
- **Method**: Verify signed message against custody address
- **Location**: `backend/src/routes/siwf.ts` → `/callback` endpoint

### 3. CORS Protection
- **Purpose**: Prevent unauthorized origins from accessing backend
- **Method**: Exact origin matching (required when `credentials: true`)
- **Allowed Origins**:
  - `https://infobot.fun`
  - `https://warpcast.com`
  - `https://client.farcaster.xyz`
  - `https://3286b522-a4bf-4197-843e-64faa1e5aa3d.lovableproject.com`
  - Any Lovable subdomain matching pattern

### 4. User ID Validation
- **Purpose**: Ensure only the correct Discord user can link their account
- **Method**: Backend stores connection with `platform:userId` key
- **Verification**: Bot checks connection using same `userId` from Discord interaction

---

## Error Handling

### Mini App Errors:
1. **CORS Error**: Falls back to server-side SIWF flow
2. **Network Error**: Shows error message, suggests server-side flow
3. **Authentication Error**: Shows error, allows retry

### Backend Errors:
1. **Missing Fields**: Returns 400 with specific missing field
2. **Invalid Data**: Returns 400 with validation error
3. **Server Error**: Returns 500 with error message (CORS headers still set)

### Discord Bot Errors:
1. **Connection Not Found**: Shows "Not connected" message
2. **Backend Unavailable**: Logs error, shows generic message
3. **Invalid Response**: Handles gracefully, shows error

---

## Testing the Flow

### Test Server-Side SIWF Flow:
1. Run `/connect` in Discord
2. Click "Connect with Farcaster (Recommended)" button
3. Sign in to Warpcast
4. Verify callback redirects correctly
5. Run `/connect` again to verify connection

### Test Mini App Flow:
1. Run `/connect` in Discord
2. Click "Use Mini App (Better UX)" button
3. Authenticate with Farcaster (QR code or sign-in)
4. Verify data is sent to backend
5. Check backend logs for connection storage
6. Run `/connect` again to verify connection

### Debug Endpoints:
- `GET /debug/cors-test` - Test CORS configuration
- `GET /api/siwf/connection?userId={userId}&platform=discord` - Check connection
- `GET /api/siwf/pending` - View pending verifications
- `GET /api/siwf/connections` - View all connections

---

## Current Issues & Solutions

### Issue 1: CORS Errors
**Symptom**: "Failed to fetch" error in Mini App
**Cause**: Backend CORS configuration not allowing Mini App origin
**Solution**: Ensure exact origin matching in `setCORSHeaders()` function

### Issue 2: Application Failed to Respond
**Symptom**: Railway shows "Application failed to respond"
**Cause**: Backend crashing on startup (missing env vars or database connection)
**Solution**: Made env vars optional, added error handling for database

### Issue 3: SIWF URL Not Working
**Symptom**: "Could not reach Farcaster" error
**Cause**: Direct SIWF URLs are unreliable
**Solution**: Use Mini App flow instead (more reliable)

---

## Questions for ChatGPT

1. **Is the CORS configuration correct?**
   - Are we setting headers in the right order?
   - Is exact origin matching required when `credentials: true`?
   - Should we use `*` for origin or always exact match?

2. **Is the data flow secure?**
   - Should we verify the Farcaster signature in Mini App before sending?
   - Should we encrypt signer private keys before storing?
   - Is the challenge verification sufficient?

3. **Is the Mini App implementation correct?**
   - Are we using the Farcaster SDK correctly?
   - Should we handle authentication errors differently?
   - Is the fallback to server-side SIWF appropriate?

4. **Is the backend storage correct?**
   - Should we use a database instead of in-memory Map?
   - Should we add expiration for connections?
   - Should we verify the Discord user ID matches the OAuth user?

5. **Is the error handling comprehensive?**
   - Are we handling all edge cases?
   - Should we add retry logic?
   - Are error messages user-friendly?

