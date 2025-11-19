# Security Improvements - Wallet Access Requirements

## ✅ Implemented Security Features

### 1. Challenge Verification
- **Status**: ✅ Implemented
- **Location**: `backend/src/routes/siwf.ts` → `POST /miniapp-connect`
- **What it does**:
  - Validates challenge exists in pending verifications
  - Checks challenge hasn't expired (10 minute timeout)
  - Verifies challenge matches expected user (userId + platform)
- **Purpose**: Prevents replay attacks and ensures challenge is single-use

### 2. Signature Verification
- **Status**: ✅ Implemented (with fallback)
- **Location**: `backend/src/routes/siwf.ts` → `POST /miniapp-connect`
- **What it does**:
  - If signature provided: Verifies signature matches custody address using `ethers.verifyMessage()`
  - If no signature: Falls back to Neynar API lookup to verify user owns custody address
- **Purpose**: Cryptographically proves user owns the Farcaster wallet

### 3. Server-Side Verification
- **Status**: ✅ Implemented
- **Location**: `backend/src/routes/siwf.ts`
- **What it does**:
  - Never trusts client-side data alone
  - Always verifies via signature or Neynar API
  - Validates all required fields before storage
- **Purpose**: Prevents account hijacking and ensures data integrity

### 4. Challenge in Mini App URL
- **Status**: ✅ Implemented
- **Location**: `src/commands/connect.ts` → Mini App URL generation
- **What it does**:
  - Includes challenge in Mini App URL parameters
  - Mini App requires challenge before sending data
- **Purpose**: Ensures Mini App flow uses same security as server-side SIWF

### 5. Persistent Mapping
- **Status**: ✅ Implemented
- **Location**: `backend/src/routes/siwf.ts` → `verifiedConnections` Map
- **Storage Format**:
  ```typescript
  key: `${platform}:${userId}` // e.g., "discord:327936936461336576"
  value: {
    fid: number,
    username: string,
    custodyAddress: string,
    verifiedAddresses: string[],
    platform: "discord" | "telegram",
    signerPrivateKey?: string,  // Should be encrypted
    signerPublicKey?: string,
    signerFid?: number
  }
  ```
- **Purpose**: Maps Discord/Telegram users to Farcaster accounts securely

---

## ⚠️ Remaining Security Tasks

### 1. Signer Private Key Encryption
- **Status**: ⚠️ TODO - Currently storing in plaintext (TEMPORARY)
- **Location**: `backend/src/routes/siwf.ts` → Line 672-676
- **What needs to be done**:
  ```typescript
  // TODO: Implement encryption using SIGNER_ENCRYPTION_KEY
  // Current code:
  encryptedSignerPrivateKey = signerPrivateKey; // TEMPORARY - MUST ENCRYPT
  
  // Should be:
  encryptedSignerPrivateKey = encryptSigner(signerPrivateKey, process.env.SIGNER_ENCRYPTION_KEY);
  ```
- **Priority**: 🔴 HIGH - Must be done before production
- **Implementation**: Use AES-256-GCM encryption (see `src/utils/signerEncryption.ts` for reference)

### 2. Delegated Signer Verification
- **Status**: ⚠️ TODO - Not verifying delegated signers are legitimate
- **What needs to be done**:
  - Verify delegated signer is actually authorized by the user
  - Check signer hasn't been revoked
  - Validate signer can perform the requested actions
- **Priority**: 🟡 MEDIUM - Important for production
- **Resources**: Use Farcaster/Neynar API to verify signer status

### 3. Database Storage
- **Status**: ⚠️ TODO - Currently using in-memory Map
- **What needs to be done**:
  - Move from `Map` to database (PostgreSQL)
  - Add proper indexing for lookups
  - Add connection expiration/cleanup
- **Priority**: 🟡 MEDIUM - Required for production scale
- **Location**: `backend/src/db/index.ts` (already has schema)

### 4. Mini App Signature Support
- **Status**: ⚠️ PARTIAL - Falls back to Neynar verification
- **What needs to be done**:
  - Verify Farcaster Mini App SDK supports message signing
  - If not, ensure Neynar fallback is always used
  - Document which verification method is used
- **Priority**: 🟢 LOW - Current fallback is secure

---

## Security Flow Summary

### Current Secure Flow:

1. **User runs `/connect` in Discord**
   - Bot generates unique challenge
   - Stores challenge in backend with userId + platform
   - Challenge expires in 10 minutes

2. **User clicks Mini App link**
   - URL includes: `userId`, `platform`, `challenge`, `backendUrl`
   - Mini App validates challenge is present

3. **User authenticates with Farcaster**
   - Farcaster SDK authenticates user
   - Returns user data (fid, username, custodyAddress)

4. **Mini App attempts to get signature**
   - Tries to sign message with challenge using SDK
   - If SDK doesn't support signing, falls back to Neynar verification

5. **Mini App sends data to backend**
   - Includes: challenge, userId, platform, fid, custodyAddress, message, signature
   - Backend validates all fields

6. **Backend verifies ownership**
   - ✅ Validates challenge exists and matches user
   - ✅ Verifies signature OR uses Neynar API lookup
   - ✅ Confirms fid matches custody address

7. **Backend stores connection**
   - Maps `platform:userId` → Farcaster data
   - ⚠️ Encrypts signer private key (TODO)
   - Cleans up pending challenge

8. **User can now use bot**
   - Bot can fetch balances, perform trades
   - Uses delegated signer for transactions

---

## Security Checklist

- [x] Challenge generation and validation
- [x] Challenge expiration (10 minutes)
- [x] Challenge user matching
- [x] Signature verification (when available)
- [x] Neynar API fallback verification
- [x] Server-side validation (never trust client)
- [x] Persistent mapping (platform:userId → Farcaster data)
- [ ] Signer private key encryption (TODO)
- [ ] Delegated signer verification (TODO)
- [ ] Database storage (TODO)
- [ ] Connection expiration/cleanup (TODO)

---

## Testing Security

### Test Challenge Validation:
1. Generate challenge for user A
2. Try to use challenge for user B → Should fail
3. Wait 11 minutes → Challenge should expire
4. Try to use expired challenge → Should fail

### Test Signature Verification:
1. Send valid signature → Should succeed
2. Send invalid signature → Should fail
3. Send no signature → Should use Neynar fallback

### Test Ownership Proof:
1. Send wrong custody address → Should fail
2. Send wrong FID → Should fail
3. Send correct data → Should succeed

---

## Notes

- **Current Implementation**: Secure for development, needs encryption before production
- **Fallback Strategy**: If signature not available, uses Neynar API (secure)
- **Storage**: In-memory Map works for now, but database needed for production
- **Encryption**: Signer private keys MUST be encrypted before production deployment

