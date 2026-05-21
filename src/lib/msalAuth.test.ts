import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MSAL module before any imports
const mockInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
  handleRedirectPromise: vi.fn().mockResolvedValue(null),
  getActiveAccount: vi.fn().mockReturnValue(null),
  getAllAccounts: vi.fn().mockReturnValue([]),
  setActiveAccount: vi.fn(),
  acquireTokenSilent: vi.fn(),
  acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
  logoutPopup: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: vi.fn(function MockPCA() {
    return mockInstance;
  }),
  InteractionRequiredAuthError: class extends Error {
    name = 'InteractionRequiredAuthError';
  },
  BrowserAuthError: class extends Error {
    errorCode: string;
    constructor(code: string) {
      super(code);
      this.errorCode = code;
      this.name = 'BrowserAuthError';
    }
  },
}));

// Mock import.meta.env for VITE_FABRIC_CLIENT_ID (Vitest)
// Tests that exercise sign-in code paths require a configured client ID.
vi.stubEnv('VITE_FABRIC_CLIENT_ID', 'test-client-id');

// Mock window.location
const originalLocation = window.location;
delete (window as any).location;
window.location = {
  ...originalLocation,
  hostname: 'localhost',
  origin: 'http://localhost:5173',
  hash: '',
} as any;

describe('msalAuth', () => {
  let msalAuth: typeof import('./msalAuth');

  beforeEach(async () => {
    vi.resetModules();
    
    // Reset all mock state
    Object.values(mockInstance).forEach((m) => {
      if (typeof m === 'object' && m !== null && 'mockClear' in m) {
        m.mockClear?.();
      }
    });

    // Reset mock return values to defaults
    mockInstance.initialize.mockResolvedValue(undefined);
    mockInstance.handleRedirectPromise.mockResolvedValue(null);
    mockInstance.getActiveAccount.mockReturnValue(null);
    mockInstance.getAllAccounts.mockReturnValue([]);
    mockInstance.acquireTokenSilent.mockClear();
    mockInstance.acquireTokenRedirect.mockResolvedValue(undefined);
    mockInstance.logoutPopup.mockResolvedValue(undefined);

    // Clear sessionStorage between tests
    sessionStorage.clear();

    // Reset window.location.hash
    window.location.hash = '';

    // Dynamically import the module
    msalAuth = await import('./msalAuth');
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('isMsalConfigured / isLocalhostWithDefaultClient', () => {
    it('isMsalConfigured returns true when VITE_FABRIC_CLIENT_ID is set', () => {
      expect(msalAuth.isMsalConfigured()).toBe(true);
    });

    it('isMsalConfigured returns false when VITE_FABRIC_CLIENT_ID is empty', async () => {
      vi.stubEnv('VITE_FABRIC_CLIENT_ID', '');
      vi.resetModules();
      const reloaded = await import('./msalAuth');
      expect(reloaded.isMsalConfigured()).toBe(false);
      vi.stubEnv('VITE_FABRIC_CLIENT_ID', 'test-client-id');
    });

    it('isLocalhostWithDefaultClient returns false on localhost when MSAL is configured', () => {
      const result = msalAuth.isLocalhostWithDefaultClient();
      expect(result).toBe(false);
    });

    it('returns false on non-localhost', async () => {
      window.location.hostname = 'example.com';
      vi.resetModules();
      msalAuth = await import('./msalAuth');
      const result = msalAuth.isLocalhostWithDefaultClient();
      expect(result).toBe(false);
    });
  });

  describe('consumeRedirectResult', () => {
    it('returns null when no redirect happened', async () => {
      mockInstance.handleRedirectPromise.mockResolvedValue(null);
      const result = await msalAuth.consumeRedirectResult();
      expect(result).toBeNull();
    });

    it('returns auth result when redirect completed, then null on second call', async () => {
      const mockAuthResult = {
        accessToken: 'mock-token',
        account: {
          name: 'Test User',
          username: 'test@example.com',
          homeAccountId: 'home-id',
          environment: 'login.microsoftonline.com',
          tenantId: 'tenant-id',
          localAccountId: 'local-id',
        },
        expiresOn: new Date(),
        scopes: [],
        tokenType: 'Bearer',
      };

      mockInstance.handleRedirectPromise.mockResolvedValue(mockAuthResult);

      // First call should return the result
      const firstResult = await msalAuth.consumeRedirectResult();
      expect(firstResult).not.toBeNull();
      expect(firstResult?.accessToken).toBe('mock-token');
      expect(firstResult?.account.name).toBe('Test User');
      expect(firstResult?.account.username).toBe('test@example.com');

      // Second call should return null (result was consumed)
      const secondResult = await msalAuth.consumeRedirectResult();
      expect(secondResult).toBeNull();
    });
  });

  describe('hasPendingDeployIntent', () => {
    it('returns false when deploy intent not set', () => {
      const result = msalAuth.hasPendingDeployIntent();
      expect(result).toBe(false);
    });

    it('returns true when deploy intent is set', () => {
      sessionStorage.setItem('fabric_deploy_pending', 'true');
      const result = msalAuth.hasPendingDeployIntent();
      expect(result).toBe(true);
    });

    it('returns false when deploy intent is not "true"', () => {
      sessionStorage.setItem('fabric_deploy_pending', 'false');
      const result = msalAuth.hasPendingDeployIntent();
      expect(result).toBe(false);
    });
  });

  describe('clearDeployIntent', () => {
    it('clears deploy intent and restores hash route', () => {
      sessionStorage.setItem('fabric_deploy_pending', 'true');
      sessionStorage.setItem('fabric_deploy_hash', '#/workspace/123');
      window.location.hash = '';

      msalAuth.clearDeployIntent();

      expect(sessionStorage.getItem('fabric_deploy_pending')).toBeNull();
      expect(sessionStorage.getItem('fabric_deploy_hash')).toBeNull();
      expect(window.location.hash).toBe('#/workspace/123');
    });

    it('clears deploy intent without changing hash if it matches', () => {
      sessionStorage.setItem('fabric_deploy_pending', 'true');
      sessionStorage.setItem('fabric_deploy_hash', '#/workspace/123');
      window.location.hash = '#/workspace/123';

      msalAuth.clearDeployIntent();

      expect(sessionStorage.getItem('fabric_deploy_pending')).toBeNull();
      expect(sessionStorage.getItem('fabric_deploy_hash')).toBeNull();
      expect(window.location.hash).toBe('#/workspace/123');
    });

    it('clears deploy intent even if hash is not set', () => {
      sessionStorage.setItem('fabric_deploy_pending', 'true');

      msalAuth.clearDeployIntent();

      expect(sessionStorage.getItem('fabric_deploy_pending')).toBeNull();
      expect(sessionStorage.getItem('fabric_deploy_hash')).toBeNull();
    });
  });

  describe('acquireFabricToken', () => {
    it('returns token from silent acquisition when accounts exist', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      const mockAuthResult = {
        accessToken: 'fabric-token',
        account: mockAccount,
        expiresOn: new Date(),
        scopes: [],
        tokenType: 'Bearer',
      };

      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);
      mockInstance.acquireTokenSilent.mockResolvedValue(mockAuthResult);

      const result = await msalAuth.acquireFabricToken();

      expect(result.accessToken).toBe('fabric-token');
      expect(result.account.name).toBe('Test User');
      expect(result.account.username).toBe('test@example.com');
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [
            'https://api.fabric.microsoft.com/Workspace.ReadWrite.All',
            'https://api.fabric.microsoft.com/Item.ReadWrite.All',
          ],
          account: mockAccount,
        })
      );
    });

    it('throws when no accounts exist and calls signInWithRedirect', async () => {
      mockInstance.getAllAccounts.mockReturnValue([]);

      await expect(msalAuth.acquireFabricToken()).rejects.toThrow(
        'No signed-in account. Redirecting to sign in…'
      );

      expect(mockInstance.acquireTokenRedirect).toHaveBeenCalled();
    });

    it('throws and redirects when InteractionRequiredAuthError is caught', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);

      // Dynamically import InteractionRequiredAuthError from the mock
      const { InteractionRequiredAuthError } = await import('@azure/msal-browser');
      mockInstance.acquireTokenSilent.mockRejectedValue(
        new InteractionRequiredAuthError('interaction_required', 'Interaction required')
      );

      await expect(msalAuth.acquireFabricToken()).rejects.toThrow(
        'Redirecting for re-authentication…'
      );

      expect(mockInstance.acquireTokenRedirect).toHaveBeenCalled();
    });

    it('sets active account after successful token acquisition', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      const mockAuthResult = {
        accessToken: 'fabric-token',
        account: mockAccount,
        expiresOn: new Date(),
        scopes: [],
        tokenType: 'Bearer',
      };

      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);
      mockInstance.acquireTokenSilent.mockResolvedValue(mockAuthResult);

      await msalAuth.acquireFabricToken();

      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    });
  });

  describe('acquireOneLakeToken', () => {
    it('returns token from silent acquisition when accounts exist', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      const mockAuthResult = {
        accessToken: 'onelake-token',
        account: mockAccount,
        expiresOn: new Date(),
        scopes: [],
        tokenType: 'Bearer',
      };

      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);
      mockInstance.acquireTokenSilent.mockResolvedValue(mockAuthResult);

      const result = await msalAuth.acquireOneLakeToken();

      expect(result.accessToken).toBe('onelake-token');
      expect(result.account.name).toBe('Test User');
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['https://storage.azure.com/user_impersonation'],
          account: mockAccount,
        })
      );
    });

    it('throws with consent message on InteractionRequiredAuthError (does NOT redirect)', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);

      const { InteractionRequiredAuthError } = await import('@azure/msal-browser');
      mockInstance.acquireTokenSilent.mockRejectedValue(
        new InteractionRequiredAuthError('interaction_required', 'Interaction required')
      );

      await expect(msalAuth.acquireOneLakeToken()).rejects.toThrow(
        'OneLake consent required. Please sign out and sign back in to grant storage permissions, then retry.'
      );

      // Verify that redirects were NOT called
      expect(mockInstance.acquireTokenRedirect).not.toHaveBeenCalled();
    });

    it('throws when no accounts exist', async () => {
      mockInstance.getAllAccounts.mockReturnValue([]);

      await expect(msalAuth.acquireOneLakeToken()).rejects.toThrow(
        'No signed-in account. Please sign in first.'
      );
    });

    it('rethrows other errors', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);
      const customError = new Error('Network error');
      mockInstance.acquireTokenSilent.mockRejectedValue(customError);

      await expect(msalAuth.acquireOneLakeToken()).rejects.toThrow('Network error');
    });
  });

  describe('isPopupError', () => {
    it('identifies popup_window_error as popup error', async () => {
      const { BrowserAuthError } = await import('@azure/msal-browser');
      const err = new BrowserAuthError('popup_window_error');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('identifies monitor_window_timeout as popup error', async () => {
      const { BrowserAuthError } = await import('@azure/msal-browser');
      const err = new BrowserAuthError('monitor_window_timeout');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('identifies empty_window_error as popup error', async () => {
      const { BrowserAuthError } = await import('@azure/msal-browser');
      const err = new BrowserAuthError('empty_window_error');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('identifies user_cancelled as popup error', async () => {
      const { BrowserAuthError } = await import('@azure/msal-browser');
      const err = new BrowserAuthError('user_cancelled');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('returns false for non-popup BrowserAuthError', async () => {
      const { BrowserAuthError } = await import('@azure/msal-browser');
      const err = new BrowserAuthError('some_other_error');
      expect(msalAuth.isPopupError(err)).toBe(false);
    });

    it('identifies Error with "timed_out" message as popup error', () => {
      const err = new Error('Request timed_out');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('identifies Error with "popup" message as popup error', () => {
      const err = new Error('Popup blocked');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('identifies Error with "blocked" message as popup error', () => {
      const err = new Error('Window blocked');
      expect(msalAuth.isPopupError(err)).toBe(true);
    });

    it('returns false for non-popup Error', () => {
      const err = new Error('Some other error');
      expect(msalAuth.isPopupError(err)).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(msalAuth.isPopupError('string error')).toBe(false);
      expect(msalAuth.isPopupError(null)).toBe(false);
      expect(msalAuth.isPopupError(undefined)).toBe(false);
    });
  });

  describe('signOut', () => {
    it('calls logoutPopup with active account', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      await msalAuth.signOut();

      expect(mockInstance.logoutPopup).toHaveBeenCalledWith({
        account: mockAccount,
      });
    });

    it('calls logoutPopup with first account if no active account', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);

      await msalAuth.signOut();

      expect(mockInstance.logoutPopup).toHaveBeenCalledWith({
        account: mockAccount,
      });
    });

    it('does not call logoutPopup if no accounts exist', async () => {
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.getAllAccounts.mockReturnValue([]);

      await msalAuth.signOut();

      expect(mockInstance.logoutPopup).not.toHaveBeenCalled();
    });

    it('resets initPromise after logout', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      // First call should initialize
      await msalAuth.signOut();

      // Reset mocks to track the next initialization
      mockInstance.initialize.mockClear();

      // Call getInstance again - should reinitialize
      // We need to trigger this through another function that uses getInstance
      mockInstance.getAllAccounts.mockReturnValue([]);
      try {
        await msalAuth.acquireFabricToken();
      } catch {
        // Expected to throw
      }

      // Verify initialize was called again
      expect(mockInstance.initialize).toHaveBeenCalled();
    });
  });

  describe('signInWithRedirect', () => {
    it('sets deploy intent and hash, then calls acquireTokenRedirect', async () => {
      window.location.hash = '#/workspace/123';

      await msalAuth.signInWithRedirect();

      expect(sessionStorage.getItem('fabric_deploy_pending')).toBe('true');
      expect(sessionStorage.getItem('fabric_deploy_hash')).toBe('#/workspace/123');
      expect(mockInstance.acquireTokenRedirect).toHaveBeenCalledWith({
        scopes: [
          'https://api.fabric.microsoft.com/Workspace.ReadWrite.All',
          'https://api.fabric.microsoft.com/Item.ReadWrite.All',
        ],
        extraScopesToConsent: ['https://storage.azure.com/user_impersonation'],
      });
    });

    it('saves empty hash if no hash route', async () => {
      window.location.hash = '';

      await msalAuth.signInWithRedirect();

      expect(sessionStorage.getItem('fabric_deploy_pending')).toBe('true');
      expect(sessionStorage.getItem('fabric_deploy_hash')).toBe('');
    });
  });

  describe('getSignedInAccount', () => {
    it('returns active account if signed in', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      const result = await msalAuth.getSignedInAccount();

      expect(result).toEqual({
        name: 'Test User',
        username: 'test@example.com',
      });
    });

    it('returns first account if no active account', async () => {
      const mockAccount = {
        name: 'Test User',
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.getAllAccounts.mockReturnValue([mockAccount]);

      const result = await msalAuth.getSignedInAccount();

      expect(result).toEqual({
        name: 'Test User',
        username: 'test@example.com',
      });
    });

    it('returns null if no accounts', async () => {
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.getAllAccounts.mockReturnValue([]);

      const result = await msalAuth.getSignedInAccount();

      expect(result).toBeNull();
    });

    it('returns null if initialization fails', async () => {
      mockInstance.initialize.mockRejectedValue(new Error('Init failed'));

      const result = await msalAuth.getSignedInAccount();

      expect(result).toBeNull();
    });

    it('handles account with missing name', async () => {
      const mockAccount = {
        name: null,
        username: 'test@example.com',
        homeAccountId: 'home-id',
        environment: 'login.microsoftonline.com',
        tenantId: 'tenant-id',
        localAccountId: 'local-id',
      };

      mockInstance.getActiveAccount.mockReturnValue(mockAccount as any);

      const result = await msalAuth.getSignedInAccount();

      expect(result).toEqual({
        name: 'Unknown',
        username: 'test@example.com',
      });
    });
  });
});
