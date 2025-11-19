# Mini App Testing Guide

## ✅ Setup Complete!

Lovable has implemented:
- ✅ URL parameter reading
- ✅ Farcaster authentication (SDK)
- ✅ Backend connection

## Testing Steps

### 1. Test URL Parameters

Visit your Mini App with test parameters:
```
https://infobot.fun?userId=test123&platform=discord&backendUrl=https://infobot-production-f74e.up.railway.app
```

**Check:**
- Does the app read and display the parameters?
- Are they logged to console?

### 2. Test Farcaster Authentication

1. Open the Mini App in Warpcast (not regular browser)
2. Click "Connect with Farcaster" button
3. **On Mobile:** Should show QR code to scan
4. **On Desktop:** Should show direct login
5. Sign in with your Farcaster account

**Check:**
- Does the QR code appear (mobile)?
- Can you sign in successfully?
- Does it show your Farcaster username/FID after signing in?

### 3. Test Backend Connection

After signing in, the app should automatically:
1. Send data to: `POST https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect`
2. Show success message

**Check:**
- Does it show "✅ Successfully linked to bot!"?
- Check Railway logs for the API call
- Verify the connection was stored

### 4. Test Full Flow from Discord

1. Run `/connect` in Discord
2. Click the button (should open Mini App)
3. Sign in with Farcaster
4. Return to Discord
5. Run `/balance` or check connection status

**Expected Result:**
- Should show your Farcaster account is connected
- Should be able to use trading commands

## Troubleshooting

### Issue: "Failed to initialize SDK"
**Cause:** Mini App not opened in Warpcast
**Fix:** Must open in Warpcast, not regular browser

### Issue: "Failed to link to bot"
**Check:**
1. Is backend URL correct? (`https://infobot-production-f74e.up.railway.app`)
2. Check Railway logs for errors
3. Verify CORS is enabled on backend

### Issue: Parameters not reading
**Check:**
1. Are parameters in URL? (`?userId=...&platform=...`)
2. Check browser console for errors
3. Verify Lovable code is reading `window.location.search`

### Issue: Backend returns error
**Check Railway logs:**
```bash
# Look for:
POST /api/siwf/miniapp-connect
# Check for error messages
```

## Expected Backend Request

When working correctly, backend should receive:
```json
{
  "userId": "discord-user-id",
  "platform": "discord",
  "fid": 123,
  "username": "alice",
  "custodyAddress": "0x...",
  "verifiedAddresses": ["0x..."]
}
```

## Success Indicators

✅ **Mini App:**
- Shows "Connect with Farcaster" button
- QR code appears (mobile) or login works (desktop)
- Shows "✅ Successfully linked to bot!" after connection

✅ **Backend:**
- Receives POST request at `/api/siwf/miniapp-connect`
- Returns `{ success: true }`
- Stores connection in database

✅ **Discord:**
- `/connect` shows "Already Connected" after linking
- `/balance` works with connected account
- Trading commands work

## Next Steps After Testing

Once everything works:
1. ✅ Users can connect via Mini App
2. ✅ No more "Could not reach Farcaster" errors
3. ✅ QR code support for mobile users
4. ✅ Native Farcaster experience

## Quick Test Commands

**In Discord:**
```
/connect          # Should open Mini App
/balance          # Should work after connecting
/buy TOKEN 10     # Should work after connecting
```

**Check Connection:**
```
/connect          # Should show "Already Connected" if linked
```

## If Something Doesn't Work

1. **Check Railway logs** - Look for errors
2. **Check browser console** - Look for JavaScript errors
3. **Test backend endpoint directly:**
   ```bash
   curl -X POST https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect \
     -H "Content-Type: application/json" \
     -d '{"userId":"test","platform":"discord","fid":123,"username":"test","custodyAddress":"0x123"}'
   ```

Let me know what happens when you test it!

