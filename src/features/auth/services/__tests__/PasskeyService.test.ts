/**
 * CLI-023 — PasskeyService unit tests
 *
 * Mock-native Jest suite covering:
 * - Registration success and error paths
 * - Authentication success and error paths
 * - Revocation
 * - Auth error mapping
 * - Session state transitions via authReducer
 */

import { Buffer } from 'buffer';

import { SecureKeyStore } from '@/lib/SecureKeyStore';
import { Passkey } from 'react-native-passkey';

import { authReducer, INITIAL_AUTH_STATE } from '../../state/authStore';
import {
  AuthErrorCode,
  createAuthError,
  mapNativePasskeyError,
  sanitizeAuthError,
} from '../authErrors';
import { PasskeyService } from '../PasskeyService';

jest.mock('react-native-passkey', () => jest.requireActual('../__mocks__/passkeyNative'));
jest.mock('@/lib/SecureKeyStore', () => ({
  SecureKeyStore: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockReturnValue(true),
  },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

// Polyfill crypto.getRandomValues for tests
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
  },
});

global.Buffer = Buffer;

// ─── authErrors.ts ────────────────────────────────────────────────────────────

describe('authErrors', () => {
  describe('createAuthError', () => {
    it('creates an error with the correct code and English message', () => {
      const err = createAuthError(AuthErrorCode.USER_CANCELLED);
      expect(err.code).toBe('USER_CANCELLED');
      expect(err.message).toMatch(/cancelled/i);
    });

    it('attaches cause when provided', () => {
      const cause = new Error('native');
      const err = createAuthError(AuthErrorCode.UNKNOWN, cause);
      expect(err.cause).toBe(cause);
    });
  });

  describe('mapNativePasskeyError', () => {
    it('maps UserCancelled to USER_CANCELLED', () => {
      const err = mapNativePasskeyError({ error: 'UserCancelled', message: 'cancelled' });
      expect(err.code).toBe(AuthErrorCode.USER_CANCELLED);
    });

    it('maps a native timeout to a safe passkey error', () => {
      const err = mapNativePasskeyError({
        error: 'TimeoutError',
        message: 'native timeout details',
      });

      expect(err.code).toBe(AuthErrorCode.TIMEOUT);
      expect(err.message).not.toContain('native timeout details');
    });

    it('maps NoCredentials to NO_CREDENTIAL', () => {
      const err = mapNativePasskeyError({ error: 'NoCredentials', message: 'no creds' });
      expect(err.code).toBe(AuthErrorCode.NO_CREDENTIAL);
    });

    it('maps unknown errors to UNKNOWN', () => {
      const err = mapNativePasskeyError({ error: 'SomethingNew', message: 'mystery' });
      expect(err.code).toBe(AuthErrorCode.UNKNOWN);
    });

    it('handles an empty native error message', () => {
      const err = mapNativePasskeyError({ error: 'SomethingNew', message: '' });

      expect(err.code).toBe(AuthErrorCode.UNKNOWN);
      expect(err.message).toBeTruthy();
    });

    it('handles non-object errors gracefully', () => {
      const err = mapNativePasskeyError('just a string');
      expect(err.code).toBe(AuthErrorCode.UNKNOWN);
    });

    it('handles null gracefully', () => {
      const err = mapNativePasskeyError(null);
      expect(err.code).toBe(AuthErrorCode.UNKNOWN);
    });
  });

  describe('sanitizeAuthError', () => {
    it('strips cause from the error', () => {
      const raw = createAuthError(AuthErrorCode.LOCKOUT, new Error('private info'));
      const safe = sanitizeAuthError(raw);
      expect(safe).not.toHaveProperty('cause');
      expect(safe.code).toBe(AuthErrorCode.LOCKOUT);
      expect(typeof safe.message).toBe('string');
    });
  });
});

// ─── authReducer ─────────────────────────────────────────────────────────────

describe('authReducer', () => {
  it('starts in LOADING state', () => {
    expect(INITIAL_AUTH_STATE.status).toBe('LOADING');
  });

  it('REHYDRATE with no credential → UNAUTHENTICATED', () => {
    const next = authReducer(INITIAL_AUTH_STATE, { type: 'REHYDRATE', payload: {} });
    expect(next.status).toBe('UNAUTHENTICATED');
  });

  it('REHYDRATE with credential → LOCKED', () => {
    const next = authReducer(INITIAL_AUTH_STATE, {
      type: 'REHYDRATE',
      payload: { credentialId: 'abc123', publicKey: 'G...' },
    });
    expect(next.status).toBe('LOCKED');
    expect(next.credentialId).toBe('abc123');
  });

  it('PASSKEY_REGISTERED → READY', () => {
    const locked = authReducer(INITIAL_AUTH_STATE, {
      type: 'REHYDRATE',
      payload: {},
    });
    const ready = authReducer(locked, {
      type: 'PASSKEY_REGISTERED',
      credentialId: 'cred1',
      publicKey: 'G123',
    });
    expect(ready.status).toBe('READY');
    expect(ready.credentialId).toBe('cred1');
    expect(ready.publicKey).toBe('G123');
    expect(ready.lastAuthAt).not.toBeNull();
  });

  it('AUTHENTICATED from LOCKED → READY', () => {
    const locked = { ...INITIAL_AUTH_STATE, status: 'LOCKED' as const, credentialId: 'cred1' };
    const ready = authReducer(locked, { type: 'AUTHENTICATED', credentialId: 'cred1' });
    expect(ready.status).toBe('READY');
  });

  it('AUTHENTICATED from non-LOCKED → no change', () => {
    const unauthenticated = { ...INITIAL_AUTH_STATE, status: 'UNAUTHENTICATED' as const };
    const next = authReducer(unauthenticated, { type: 'AUTHENTICATED', credentialId: 'cred1' });
    expect(next.status).toBe('UNAUTHENTICATED');
  });

  it('LOCK from READY → LOCKED', () => {
    const ready = { ...INITIAL_AUTH_STATE, status: 'READY' as const };
    const locked = authReducer(ready, { type: 'LOCK' });
    expect(locked.status).toBe('LOCKED');
  });

  it('LOCK from non-READY → no change', () => {
    const unauthenticated = { ...INITIAL_AUTH_STATE, status: 'UNAUTHENTICATED' as const };
    const next = authReducer(unauthenticated, { type: 'LOCK' });
    expect(next.status).toBe('UNAUTHENTICATED');
  });

  it('LOGOUT → UNAUTHENTICATED with cleared state', () => {
    const ready = {
      ...INITIAL_AUTH_STATE,
      status: 'READY' as const,
      credentialId: 'cred1',
      publicKey: 'G123',
    };
    const after = authReducer(ready, { type: 'LOGOUT' });
    expect(after.status).toBe('UNAUTHENTICATED');
    expect(after.credentialId).toBeNull();
    expect(after.publicKey).toBeNull();
  });

  it('SET_ERROR updates lastError', () => {
    const next = authReducer(INITIAL_AUTH_STATE, {
      type: 'SET_ERROR',
      error: 'Algo salió mal',
    });
    expect(next.lastError).toBe('Algo salió mal');
  });
});

// ─── PasskeyService ───────────────────────────────────────────────────────────

describe('PasskeyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Passkey.isSupported as jest.Mock).mockReturnValue(true);
    (SecureKeyStore.get as jest.Mock).mockResolvedValue(null);
    (SecureKeyStore.set as jest.Mock).mockResolvedValue(undefined);
    (SecureKeyStore.delete as jest.Mock).mockResolvedValue(undefined);
  });

  describe('getSupportInfo', () => {
    it('returns isSupported=true when native module is available', () => {
      const info = PasskeyService.getSupportInfo();
      expect(info.isSupported).toBe(true);
      expect(info.platform).toBe('ios');
    });

    it('returns isSupported=false when native module unavailable', () => {
      (Passkey.isSupported as jest.Mock).mockReturnValue(false);
      const info = PasskeyService.getSupportInfo();
      expect(info.isSupported).toBe(false);
    });
  });

  describe('register', () => {
    it('returns success with credential info on happy path', async () => {
      const result = await PasskeyService.register({
        rpId: 'dingpayments.app',
        rpName: 'Vela',
        userId: 'user_abc',
        displayName: 'Test User',
        challenge: 'dGVzdENoYWxsZW5nZQ==',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.credential.credentialId).toBe('mock-credential-id-abc123');
        expect(result.credential.transports).toContain('internal');
      }
    });

    it('persists credential ID to secure store', async () => {
      await PasskeyService.register({
        rpId: 'dingpayments.app',
        rpName: 'Vela',
        userId: 'user_abc',
        displayName: 'Test User',
        challenge: 'dGVzdA==',
      });

      expect(SecureKeyStore.set).toHaveBeenCalledWith(
        'ding.passkey.credentialId',
        'mock-credential-id-abc123'
      );
    });

    it('returns a safe error when secure storage fails during registration', async () => {
      (SecureKeyStore.set as jest.Mock).mockRejectedValueOnce(new Error('secure store locked'));

      const result = await PasskeyService.register({
        rpId: 'dingpayments.app',
        rpName: 'Vela',
        userId: 'user_abc',
        displayName: 'Test User',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.UNKNOWN);
        expect(result.error.message).not.toContain('secure store locked');
      }
    });

    it('returns NOT_SUPPORTED when passkeys unavailable', async () => {
      (Passkey.isSupported as jest.Mock).mockReturnValue(false);
      const result = await PasskeyService.register({
        rpId: 'dingpayments.app',
        rpName: 'Vela',
        userId: 'user_abc',
        displayName: 'Test User',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.NOT_SUPPORTED);
      }
    });

    it('maps native UserCancelled to USER_CANCELLED error', async () => {
      (Passkey.create as jest.Mock).mockRejectedValueOnce({
        error: 'UserCancelled',
        message: 'User cancelled',
      });

      const result = await PasskeyService.register({
        rpId: 'dingpayments.app',
        rpName: 'Vela',
        userId: 'user_abc',
        displayName: 'Test User',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.USER_CANCELLED);
        // Message must be in English
        expect(result.error.message).toMatch(/cancelled/i);
      }
    });
  });

  describe('authenticate', () => {
    it('returns success with assertion result on happy path', async () => {
      const result = await PasskeyService.authenticate({
        rpId: 'dingpayments.app',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.credentialId).toBe('mock-credential-id-abc123');
        expect(result.result.signature).toBeTruthy();
      }
    });

    it('includes allowCredentials when credentialId is stored', async () => {
      (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce('stored-cred-id');

      await PasskeyService.authenticate({
        rpId: 'dingpayments.app',
        challenge: 'dGVzdA==',
      });

      expect(Passkey.get).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: [{ type: 'public-key', id: 'stored-cred-id' }],
        })
      );
    });

    it('maps NoCredentials to NO_CREDENTIAL error', async () => {
      (Passkey.get as jest.Mock).mockRejectedValueOnce({
        error: 'NoCredentials',
        message: 'No credentials found',
      });

      const result = await PasskeyService.authenticate({
        rpId: 'dingpayments.app',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.NO_CREDENTIAL);
      }
    });

    it('returns a safe error when the native passkey prompt fails', async () => {
      (Passkey.get as jest.Mock).mockRejectedValueOnce({
        error: 'RequestFailed',
        message: 'native prompt internals',
      });

      const result = await PasskeyService.authenticate({
        rpId: 'dingpayments.app',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.UNKNOWN);
        expect(result.error.message).not.toContain('native prompt internals');
      }
    });

    it('returns NOT_SUPPORTED when passkeys unavailable', async () => {
      (Passkey.isSupported as jest.Mock).mockReturnValue(false);
      const result = await PasskeyService.authenticate({
        rpId: 'dingpayments.app',
        challenge: 'dGVzdA==',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.NOT_SUPPORTED);
      }
    });
  });

  describe('revoke', () => {
    it('clears all secure store keys and returns success', async () => {
      const result = await PasskeyService.revoke();

      expect(result.success).toBe(true);
      expect(SecureKeyStore.delete).toHaveBeenCalledTimes(3);
    });

    it('deletes the stored credential ID after logout', async () => {
      await PasskeyService.revoke();

      expect(SecureKeyStore.delete).toHaveBeenCalledWith('ding.passkey.credentialId');
    });

    it('returns STORE_ERROR if delete fails', async () => {
      (SecureKeyStore.delete as jest.Mock).mockRejectedValueOnce(new Error('store locked'));

      const result = await PasskeyService.revoke();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(AuthErrorCode.STORE_ERROR);
      }
    });
  });
});
