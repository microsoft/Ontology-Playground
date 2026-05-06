/**
 * MSAL authentication for Microsoft Fabric REST APIs.
 *
 * Supports popup login with redirect-based fallback.
 * Override the default app registration with VITE_FABRIC_CLIENT_ID env var.
 */

import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
  InteractionRequiredAuthError,
  BrowserAuthError,
} from '@azure/msal-browser';

// Client ID is supplied by the user via VITE_FABRIC_CLIENT_ID. There is no
// built-in default — callers should fall back to the existing access-token
// paste flow when this is empty (see isMsalConfigured()).
const CLIENT_ID = (import.meta.env.VITE_FABRIC_CLIENT_ID ?? '').trim();

const FABRIC_SCOPES = [
  'https://api.fabric.microsoft.com/Workspace.ReadWrite.All',
  'https://api.fabric.microsoft.com/Item.ReadWrite.All',
];

const ONELAKE_SCOPES = [
  'https://storage.azure.com/user_impersonation',
];

const DEPLOY_PENDING_KEY = 'fabric_deploy_pending';
const DEPLOY_HASH_KEY = 'fabric_deploy_hash';

let initPromise: Promise<PublicClientApplication> | null = null;
let redirectAuthResult: FabricAuthResult | null = null;

function getMsalConfig(): Configuration {
  return {
    auth: {
      clientId: CLIENT_ID,
      authority: 'https://login.microsoftonline.com/organizations',
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'sessionStorage',
    },
  };
}

/**
 * Initialize MSAL once. Processes any pending redirect response on first call.
 */
function getInstance(): Promise<PublicClientApplication> {
  if (!initPromise) {
    initPromise = (async () => {
      const instance = new PublicClientApplication(getMsalConfig());
      await instance.initialize();

      // Process redirect response (only fires once after redirect-based login)
      try {
        const response = await instance.handleRedirectPromise();
        if (response?.account) {
          instance.setActiveAccount(response.account);
          redirectAuthResult = {
            accessToken: response.accessToken,
            account: {
              name: response.account.name ?? 'Unknown',
              username: response.account.username ?? '',
            },
            expiresOn: response.expiresOn,
          };
        }
      } catch {
        // Redirect response unavailable or failed — that's fine
      }

      return instance;
    })();
  }
  return initPromise;
}

export interface FabricAuthResult {
  accessToken: string;
  account: {
    name: string;
    username: string;
  };
  expiresOn: Date | null;
}

/**
 * Returns true when a custom Fabric client ID has been configured.
 * When false, callers should hide the popup-login flow and fall back
 * to the existing access-token paste path.
 */
export function isMsalConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

/**
 * Returns true if running on localhost without an MSAL client ID configured.
 * In that case popup/redirect auth is disabled and the user must paste a token.
 */
export function isLocalhostWithDefaultClient(): boolean {
  return !isMsalConfigured() && window.location.hostname === 'localhost';
}

/**
 * Check if a redirect auth completed (call after MSAL init on page load).
 */
export async function consumeRedirectResult(): Promise<FabricAuthResult | null> {
  await getInstance();
  const result = redirectAuthResult;
  redirectAuthResult = null;
  return result;
}

/**
 * Check if there's a pending deploy intent (set before redirect login).
 */
export function hasPendingDeployIntent(): boolean {
  return sessionStorage.getItem(DEPLOY_PENDING_KEY) === 'true';
}

/**
 * Clear the pending deploy intent.
 */
export function clearDeployIntent(): void {
  const savedHash = sessionStorage.getItem(DEPLOY_HASH_KEY);
  sessionStorage.removeItem(DEPLOY_PENDING_KEY);
  sessionStorage.removeItem(DEPLOY_HASH_KEY);
  // Restore the hash route if it was saved before redirect
  if (savedHash && window.location.hash !== savedHash) {
    window.location.hash = savedHash;
  }
}

/**
 * Acquire a Fabric API token.
 * Tries silent first, falls back to redirect (not popup).
 */
export const MSAL_NOT_CONFIGURED_MESSAGE =
  'MSAL sign-in is not configured. Set VITE_FABRIC_CLIENT_ID in your .env (see DEPLOYMENT.md) or paste an access token to deploy.';

export async function acquireFabricToken(): Promise<FabricAuthResult> {
  if (!isMsalConfigured()) {
    throw new Error(MSAL_NOT_CONFIGURED_MESSAGE);
  }
  const instance = await getInstance();
  const active = instance.getActiveAccount();
  const accounts = active ? [active] : instance.getAllAccounts();

  let result: AuthenticationResult;

  if (accounts.length > 0) {
    try {
      result = await instance.acquireTokenSilent({
        scopes: FABRIC_SCOPES,
        account: accounts[0],
      });
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Redirect instead of popup — popup is unreliable
        await signInWithRedirect();
        throw new Error('Redirecting for re-authentication…');
      } else {
        throw err;
      }
    }
  } else {
    await signInWithRedirect();
    throw new Error('No signed-in account. Redirecting to sign in…');
  }

  if (result.account) {
    instance.setActiveAccount(result.account);
  }

  return {
    accessToken: result.accessToken,
    account: {
      name: result.account?.name ?? 'Unknown',
      username: result.account?.username ?? '',
    },
    expiresOn: result.expiresOn,
  };
}

/**
 * Acquire a OneLake DFS token (storage.azure.com audience).
 * Needed for uploading files to Lakehouse Files/ area.
 */
export async function acquireOneLakeToken(): Promise<FabricAuthResult> {
  if (!isMsalConfigured()) {
    throw new Error(MSAL_NOT_CONFIGURED_MESSAGE);
  }
  const instance = await getInstance();
  const active = instance.getActiveAccount();
  const accounts = active ? [active] : instance.getAllAccounts();

  let result: AuthenticationResult;

  if (accounts.length > 0) {
    try {
      result = await instance.acquireTokenSilent({
        scopes: ONELAKE_SCOPES,
        account: accounts[0],
      });
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Don't redirect mid-push — that would lose all push state.
        // The user needs to sign out and sign back in to consent to OneLake scope.
        throw new Error(
          'OneLake consent required. Please sign out and sign back in to grant storage permissions, then retry.',
        );
      }
      throw err;
    }
  } else {
    throw new Error('No signed-in account. Please sign in first.');
  }

  return {
    accessToken: result.accessToken,
    account: {
      name: result.account?.name ?? 'Unknown',
      username: result.account?.username ?? '',
    },
    expiresOn: result.expiresOn,
  };
}

/**
 * Initiate redirect-based login (navigates away from page).
 * Saves deploy intent + current hash route to sessionStorage.
 */
export async function signInWithRedirect(): Promise<void> {
  if (!isMsalConfigured()) {
    throw new Error(MSAL_NOT_CONFIGURED_MESSAGE);
  }
  sessionStorage.setItem(DEPLOY_PENDING_KEY, 'true');
  sessionStorage.setItem(DEPLOY_HASH_KEY, window.location.hash);
  const instance = await getInstance();
  await instance.acquireTokenRedirect({
    scopes: FABRIC_SCOPES,
    // Pre-consent OneLake scope so later acquireTokenSilent works without interaction
    extraScopesToConsent: ONELAKE_SCOPES,
  });
}

/**
 * Returns true if the given error is a popup timeout or blocked popup.
 */
export function isPopupError(err: unknown): boolean {
  if (err instanceof BrowserAuthError) {
    const code = (err as { errorCode?: string }).errorCode ?? '';
    return code === 'popup_window_error' || code === 'monitor_window_timeout'
      || code === 'empty_window_error' || code === 'user_cancelled';
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('timed_out') || msg.includes('popup') || msg.includes('blocked');
  }
  return false;
}

/**
 * Sign out and clear cached tokens.
 */
export async function signOut(): Promise<void> {
  const instance = await getInstance();
  const active = instance.getActiveAccount();
  const account = active ?? instance.getAllAccounts()[0];
  if (account) {
    await instance.logoutPopup({ account });
  }
  initPromise = null;
}

/**
 * Check if user is already signed in (has cached account).
 */
export async function getSignedInAccount(): Promise<FabricAuthResult['account'] | null> {
  try {
    const instance = await getInstance();
    const active = instance.getActiveAccount();
    const account = active ?? instance.getAllAccounts()[0];
    if (account) {
      return {
        name: account.name ?? 'Unknown',
        username: account.username ?? '',
      };
    }
  } catch {
    // MSAL not configured — that's fine
  }
  return null;
}
