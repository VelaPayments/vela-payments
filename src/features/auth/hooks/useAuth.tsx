/**
 * CLI-018 — useAuth hook + AuthProvider
 *
 * Provides the auth state machine via React Context.
 * Handles cold-start rehydration from SecureKeyStore.
 *
 * Usage:
 *   Wrap the app in <AuthProvider> at the root layout.
 *   Access auth state and actions via useAuth() in any component.
 */

import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';

import { SecureKeyStore } from '@/lib/SecureKeyStore';
import { SECURE_KEYS } from '@/lib/SecureKeyStore.types';
import { toast } from '@/lib/toast';
import { AuthErrorCode, sanitizeAuthError } from '../services/authErrors';
import { PasskeyService } from '../services/PasskeyService';
import { AuthApiClient } from '../services/AuthApiClient';
import { SupabaseAuthClient } from '../services/SupabaseAuthClient';
import { INITIAL_AUTH_STATE, authReducer } from '../state/authStore';
import { SESSION } from '@/constants/session';
import { env } from '@/lib/env';
import type { AuthState } from '../state/authStore';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  state: AuthState;
  /** Register a new passkey during onboarding */
  registerPasskey: (displayName: string) => Promise<boolean>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  /** Re-authenticate using an existing passkey */
  unlockWithPasskey: () => Promise<boolean>;
  /** Lock the session (called by session policy or manually) */
  lock: () => void;
  /** Log out and clear all auth artifacts */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, INITIAL_AUTH_STATE);

  // ── Cold-start rehydration ──────────────────────────────────────────────────
  useEffect(() => {
    async function rehydrate() {
      try {
        const [credentialId, sessionToken, lastActive] = await Promise.all([
          SecureKeyStore.get(SECURE_KEYS.PASSKEY_CREDENTIAL_ID).catch(() => null),
          SecureKeyStore.get(SECURE_KEYS.SUPABASE_ACCESS_TOKEN, {
            requireAuthentication: false,
          }).catch(() => null),
          SecureKeyStore.get(SECURE_KEYS.SESSION_LAST_ACTIVE).catch(() => null),
        ]);

        dispatch({
          type: 'REHYDRATE',
          payload: {
            credentialId: credentialId ?? null,
            sessionToken: sessionToken ?? null,
            lastAuthAt: lastActive ?? null,
          },
        });
      } catch {
        // If rehydration fails entirely, start fresh as unauthenticated
        dispatch({
          type: 'REHYDRATE',
          payload: {},
        });
      }
    }

    void rehydrate();
  }, []);

  // ── Register ────────────────────────────────────────────────────────────────
  const registerPasskey = useCallback(
    async (displayName: string): Promise<boolean> => {
      dispatch({ type: 'SET_ERROR', error: null });

      // Read the store as well as React state so sign-in immediately followed by
      // passkey registration uses the newly-issued token in the same event turn.
      const sessionToken =
        state.sessionToken ??
        (await SecureKeyStore.get(SECURE_KEYS.SUPABASE_ACCESS_TOKEN, {
          requireAuthentication: false,
        }).catch(() => null));

      const result = sessionToken
        ? await (async () => {
            const options = await AuthApiClient.getServerRegistrationOptions(sessionToken);
            return PasskeyService.registerWithServerOptions(options);
          })()
        : await PasskeyService.register({
            rpId: env.webauthnRpId,
            rpName: SESSION.RP_NAME,
            userId: displayName,
            displayName,
            challenge: '',
          });

      if (!result.success) {
        const safe = sanitizeAuthError(result.error);
        dispatch({ type: 'SET_ERROR', error: safe.message });
        toast.error(result.error.message);
        return false;
      }

      if (sessionToken) {
        try {
          await AuthApiClient.verifyServerRegistration(
            sessionToken,
            result.credential,
            displayName
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Server passkey verification failed.';
          dispatch({ type: 'SET_ERROR', error: message });
          toast.error(message);
          return false;
        }
      }

      dispatch({
        type: 'PASSKEY_REGISTERED',
        credentialId: result.credential.credentialId,
        publicKey: null,
      });

      // Persist session timestamp
      await SecureKeyStore.set(SECURE_KEYS.SESSION_LAST_ACTIVE, new Date().toISOString(), {
        requireAuthentication: false,
      }).catch(() => null);

      return true;
    },
    [state.sessionToken]
  );

  const establishSupabaseSession = useCallback(
    async (operation: 'signIn' | 'signUp', email: string, password: string) => {
      dispatch({ type: 'SET_ERROR', error: null });
      try {
        const session =
          operation === 'signIn'
            ? await SupabaseAuthClient.signIn(email.trim(), password)
            : await SupabaseAuthClient.signUp(email.trim(), password);
        await SecureKeyStore.set(SECURE_KEYS.SUPABASE_ACCESS_TOKEN, session.access_token, {
          requireAuthentication: false,
        });
        await SecureKeyStore.set(SECURE_KEYS.SUPABASE_REFRESH_TOKEN, session.refresh_token, {
          requireAuthentication: false,
        });
        dispatch({ type: 'SESSION_ESTABLISHED', accessToken: session.access_token });
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to establish a server session.';
        dispatch({ type: 'SET_ERROR', error: message });
        toast.error(message);
        return false;
      }
    },
    []
  );

  const signInWithPassword = useCallback(
    (email: string, password: string) => establishSupabaseSession('signIn', email, password),
    [establishSupabaseSession]
  );
  const signUpWithPassword = useCallback(
    (email: string, password: string) => establishSupabaseSession('signUp', email, password),
    [establishSupabaseSession]
  );

  // ── Unlock ──────────────────────────────────────────────────────────────────
  const unlockWithPasskey = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'SET_ERROR', error: null });

    const result = await PasskeyService.authenticate({
      rpId: env.webauthnRpId,
      challenge: '',
    });

    if (!result.success) {
      // Don't show toast for user-cancelled — silent UX
      if (result.error.code !== AuthErrorCode.USER_CANCELLED) {
        toast.error(result.error.message);
      }
      dispatch({ type: 'SET_ERROR', error: result.error.message });
      return false;
    }

    dispatch({
      type: 'AUTHENTICATED',
      credentialId: result.result.credentialId,
    });

    await SecureKeyStore.set(SECURE_KEYS.SESSION_LAST_ACTIVE, new Date().toISOString(), {
      requireAuthentication: false,
    }).catch(() => null);

    return true;
  }, []);

  // ── Lock ────────────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    dispatch({ type: 'LOCK' });
  }, []);

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await PasskeyService.revoke();
    await SecureKeyStore.delete(SECURE_KEYS.SUPABASE_ACCESS_TOKEN).catch(() => null);
    await SecureKeyStore.delete(SECURE_KEYS.SUPABASE_REFRESH_TOKEN).catch(() => null);
    dispatch({ type: 'LOGOUT' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        state,
        registerPasskey,
        signInWithPassword,
        signUpWithPassword,
        unlockWithPasskey,
        lock,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}

/** Read auth when a feature can also run in the standalone/offline preview. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
