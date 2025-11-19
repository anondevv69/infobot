import { initMiniAppSDK } from '@farcaster/miniapp-sdk';

// Initialize Farcaster Mini App SDK
let sdk: any = null;
let user: any = null;
let discordUser: any = null;

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId'); // From Discord bot (if coming from /connect command)
const platform = urlParams.get('platform') || 'discord';
const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';

// Discord OAuth configuration
// You'll need to set these in your Discord Developer Portal
const DISCORD_CLIENT_ID = 'YOUR_DISCORD_CLIENT_ID'; // TODO: Set this from environment or config
const DISCORD_REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const DISCORD_SCOPE = 'identify';

async function initSDK() {
  try {
    showStatus('info', '🔄 Initializing Farcaster SDK...');
    
    // Initialize the Mini App SDK
    sdk = await initMiniAppSDK();
    
    // Check if user is already authenticated
    try {
      user = await sdk.actions.signIn();
      if (user) {
        showUserInfo(user);
        showStatus('success', '✅ Connected to Farcaster!');
        document.getElementById('connectBtn')!.style.display = 'none';
        
        // Check if we can link accounts now
        checkCanLink();
      } else {
        // User not signed in - show connect button
        showStatus('info', '👆 Click "Connect with Farcaster" to sign in');
        document.getElementById('connectBtn')!.style.display = 'block';
      }
    } catch (error: any) {
      // User not signed in yet - this is normal
      console.log('[Mini App] User not signed in:', error?.message || error);
      showStatus('info', '👆 Click "Connect with Farcaster" to sign in');
      document.getElementById('connectBtn')!.style.display = 'block';
    }
  } catch (error: any) {
    console.error('[Mini App] Failed to initialize SDK:', error);
    showStatus('error', `Failed to initialize: ${error?.message || 'Make sure you\'re opening this in Warpcast'}`);
    document.getElementById('connectBtn')!.style.display = 'block';
  }
}

// Connect wallet function
(window as any).connectWallet = async function() {
  try {
    showStatus('info', '🔄 Connecting...');
    document.getElementById('connectBtn')!.disabled = true;
    
    // Sign in with Farcaster (this will show QR code on mobile)
    user = await sdk.actions.signIn();
    
    if (user) {
      showUserInfo(user);
      showStatus('success', '✅ Successfully connected to Farcaster!');
      document.getElementById('connectBtn')!.style.display = 'none';
      document.getElementById('linkBotBtn')!.style.display = 'block';
      
      // Automatically link to bot if userId is provided
      if (userId) {
        await linkToBot(user);
      }
    }
  } catch (error: any) {
    console.error('Connection error:', error);
    showStatus('error', `Connection failed: ${error.message || 'Unknown error'}`);
    document.getElementById('connectBtn')!.disabled = false;
  }
};

// Link to Discord/Telegram bot
(window as any).linkBot = async function() {
  if (!user) {
    showStatus('error', 'Please connect your Farcaster account first');
    return;
  }
  
  await linkToBot(user);
};

async function linkToBot(farcasterUser: any) {
  try {
    showStatus('info', '🔄 Linking to bot...');
    
    // Log the request for debugging
    console.log('[Mini App] Making request to:', `${backendUrl}/api/siwf/miniapp-connect`);
    console.log('[Mini App] Request data:', {
      userId,
      platform,
      fid: farcasterUser.fid,
      username: farcasterUser.username,
    });
    
    // Send connection data to backend
    const response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
      method: 'POST',
      mode: 'cors', // Explicitly enable CORS
      credentials: 'include', // Include credentials
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        userId,
        platform,
        fid: farcasterUser.fid,
        username: farcasterUser.username,
        custodyAddress: farcasterUser.custodyAddress,
        verifiedAddresses: farcasterUser.verifiedAddresses || [],
        // Include any signer info if available
        signerPrivateKey: farcasterUser.signerPrivateKey,
        signerPublicKey: farcasterUser.signerPublicKey,
      }),
    });
    
    console.log('[Mini App] Response status:', response.status);
    console.log('[Mini App] Response headers:', Object.fromEntries(response.headers.entries()));

    const result = await response.json();

    if (response.ok) {
      showStatus('success', '✅ Successfully linked to bot! You can now return to Discord/Telegram.');
      
      // Show success message with instructions
      setTimeout(() => {
        showStatus('info', '💡 Return to Discord/Telegram and use /balance or /buy to start trading!');
      }, 2000);
    } else {
      throw new Error(result.error || 'Failed to link to bot');
    }
  } catch (error: any) {
    console.error('[Mini App] Link error:', error);
    console.error('[Mini App] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // Show more detailed error message
    let errorMessage = 'Failed to link: ';
    if (error.message) {
      errorMessage += error.message;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage += 'Network error - check CORS configuration on backend';
    } else {
      errorMessage += 'Unknown error - check console for details';
    }
    
    showStatus('error', errorMessage);
  }
}

function showUserInfo(user: any) {
  const userInfoDiv = document.getElementById('userInfo')!;
  userInfoDiv.innerHTML = `
    <div class="user-info">
      <h3>👤 Connected Account</h3>
      <p><strong>Username:</strong> @${user.username || 'N/A'}</p>
      <p><strong>FID:</strong> ${user.fid}</p>
      <p><strong>Custody Address:</strong> ${user.custodyAddress?.slice(0, 10)}...${user.custodyAddress?.slice(-8)}</p>
    </div>
  `;
}

function showStatus(type: 'success' | 'error' | 'info', message: string) {
  const statusDiv = document.getElementById('status')!;
  statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// Connect Discord via OAuth
(window as any).connectDiscord = async function() {
  try {
    showStatus('info', '🔄 Redirecting to Discord...');
    
    // Check if we have a code from Discord OAuth callback
    const code = urlParams.get('code');
    if (code) {
      // Exchange code for access token
      await handleDiscordCallback(code);
      return;
    }
    
    // Start Discord OAuth flow
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${DISCORD_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${DISCORD_SCOPE}`;
    
    window.location.href = discordAuthUrl;
  } catch (error: any) {
    console.error('[Mini App] Discord OAuth error:', error);
    showStatus('error', `Discord connection failed: ${error.message || 'Unknown error'}`);
  }
};

// Handle Discord OAuth callback
async function handleDiscordCallback(code: string) {
  try {
    showStatus('info', '🔄 Verifying Discord connection...');
    
    // Exchange code for access token via backend (more secure)
    const response = await fetch(`${backendUrl}/api/discord/oauth`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        code,
        redirectUri: DISCORD_REDIRECT_URI,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to connect Discord');
    }
    
    const result = await response.json();
    discordUser = result.user;
    
    // Show Discord info
    showDiscordInfo(discordUser);
    showStatus('success', '✅ Discord connected!');
    
    // Check if we can link accounts now
    checkCanLink();
    
    // Remove code from URL
    const newUrl = window.location.href.split('?')[0] + 
      (userId ? `?userId=${userId}&platform=${platform}&backendUrl=${backendUrl}` : '');
    window.history.replaceState({}, '', newUrl);
  } catch (error: any) {
    console.error('[Mini App] Discord callback error:', error);
    showStatus('error', `Discord connection failed: ${error.message || 'Unknown error'}`);
  }
}

// Show Discord connection info
function showDiscordInfo(discordUser: any) {
  const discordInfoDiv = document.getElementById('discordInfo')!;
  const discordUsernameSpan = document.getElementById('discordUsername')!;
  const discordUserIdSpan = document.getElementById('discordUserId')!;
  
  discordInfoDiv.style.display = 'block';
  discordUsernameSpan.textContent = `${discordUser.username}#${discordUser.discriminator || ''}`;
  discordUserIdSpan.textContent = discordUser.id;
  
  // Hide connect button
  document.getElementById('connectDiscordBtn')!.style.display = 'none';
}

// Check if we can link accounts (both Discord and Farcaster connected)
function checkCanLink() {
  if (discordUser && user) {
    // Both connected - show link button
    document.getElementById('linkBotBtn')!.style.display = 'block';
    showStatus('success', '✅ Both accounts connected! Click "Link Accounts" to complete setup.');
  } else if (discordUser && !user) {
    showStatus('info', '💡 Now connect your Farcaster account to complete the setup.');
  } else if (!discordUser && user) {
    showStatus('info', '💡 Now connect your Discord account to complete the setup.');
  }
}

// Update linkToBot to use Discord user if available
async function linkToBot(farcasterUser: any) {
  try {
    showStatus('info', '🔄 Linking accounts...');
    
    // Use Discord user ID if available, otherwise use userId from URL params
    const finalUserId = discordUser?.id || userId;
    const finalPlatform = discordUser ? 'discord' : (platform || 'discord');
    
    if (!finalUserId) {
      throw new Error('No Discord account connected and no userId provided. Please connect Discord first or use /connect command in Discord.');
    }
    
    // Log the request for debugging
    console.log('[Mini App] Making request to:', `${backendUrl}/api/siwf/miniapp-connect`);
    console.log('[Mini App] Request data:', {
      userId: finalUserId,
      platform: finalPlatform,
      fid: farcasterUser.fid,
      username: farcasterUser.username,
      discordUser: discordUser ? `${discordUser.username}#${discordUser.discriminator}` : 'none',
    });
    
    // Send connection data to backend
    const response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        userId: finalUserId,
        platform: finalPlatform,
        fid: farcasterUser.fid,
        username: farcasterUser.username,
        custodyAddress: farcasterUser.custodyAddress,
        verifiedAddresses: farcasterUser.verifiedAddresses || [],
        // Include Discord info if available
        discordUsername: discordUser ? `${discordUser.username}#${discordUser.discriminator}` : undefined,
        discordId: discordUser?.id,
        // Include any signer info if available
        signerPrivateKey: farcasterUser.signerPrivateKey,
        signerPublicKey: farcasterUser.signerPublicKey,
      }),
    });
    
    console.log('[Mini App] Response status:', response.status);
    console.log('[Mini App] Response headers:', Object.fromEntries(response.headers.entries()));

    const result = await response.json();

    if (response.ok) {
      showStatus('success', '✅ Successfully linked! You can now use the bot in Discord.');
      
      // Show success message with instructions
      setTimeout(() => {
        showStatus('info', '💡 Go to Discord and use /balance or /buy to start trading!');
      }, 2000);
    } else {
      throw new Error(result.error || 'Failed to link accounts');
    }
  } catch (error: any) {
    console.error('[Mini App] Link error:', error);
    console.error('[Mini App] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // Show more detailed error message
    let errorMessage = 'Failed to link: ';
    if (error.message) {
      errorMessage += error.message;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage += 'Network error - check CORS configuration on backend';
    } else {
      errorMessage += 'Unknown error - check console for details';
    }
    
    showStatus('error', errorMessage);
  }
}

// Update connectWallet to check if we can link after Farcaster connection
(window as any).connectWallet = async function() {
  try {
    showStatus('info', '🔄 Connecting to Farcaster...');
    const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    
    // Sign in with Farcaster (this will show QR code on mobile)
    user = await sdk.actions.signIn();
    
    if (user) {
      showUserInfo(user);
      showStatus('success', '✅ Successfully connected to Farcaster!');
      if (connectBtn) {
        connectBtn.style.display = 'none';
      }
      
      // Check if we can link accounts now
      checkCanLink();
      
      // Automatically link if we have both Discord and userId
      if (discordUser || userId) {
        // Small delay to show success message
        setTimeout(() => {
          linkToBot(user);
        }, 1000);
      } else {
        // No Discord/userId - show message
        showStatus('info', '💡 Connect Discord or use /connect command in Discord/Telegram to link accounts');
      }
    } else {
      showStatus('error', 'Failed to get user info from Farcaster');
      if (connectBtn) {
        connectBtn.disabled = false;
      }
    }
  } catch (error: any) {
    console.error('[Mini App] Connection error:', error);
    showStatus('error', `Connection failed: ${error?.message || 'Unknown error'}. Try again or use the server-side flow from Discord/Telegram.`);
    const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
    if (connectBtn) {
      connectBtn.disabled = false;
    }
  }
};

// Update linkBot function
(window as any).linkBot = async function() {
  if (!user) {
    showStatus('error', 'Please connect your Farcaster account first');
    return;
  }
  
  if (!discordUser && !userId) {
    showStatus('error', 'Please connect your Discord account first or use /connect command in Discord');
    return;
  }
  
  await linkToBot(user);
};

// Show loading indicator on page load
document.addEventListener('DOMContentLoaded', () => {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const connectBtn = document.getElementById('connectBtn');
  if (loadingIndicator) {
    loadingIndicator.style.display = 'block';
  }
  if (connectBtn) {
    connectBtn.style.display = 'none';
  }
  
  // Show warning if no userId (direct visit)
  if (!userId) {
    const warning = document.getElementById('noUserIdWarning');
    if (warning) {
      warning.style.display = 'block';
    }
  }
  
  // Initialize SDK
  initSDK().then(() => {
    // Hide loading indicator after init
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }).catch((error) => {
    console.error('[Mini App] Init error:', error);
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    if (connectBtn) {
      connectBtn.style.display = 'block';
    }
  });
});

// Check if we have Discord OAuth code
const code = urlParams.get('code');
if (code) {
  handleDiscordCallback(code);
}

