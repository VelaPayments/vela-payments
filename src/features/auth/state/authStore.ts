/**
 * CLI-018 — Auth state machine
 *
 * Defines the explicit state transitions for authentication:
 *
 *   LOADING → UNAUTHENTICATED → ONBOARDING → READY
 *             ↑                              ↓
 *             └──────── LOCKED ←────────────┘
 *
 * States:
 * - LOADING       : App is rehydrating auth state from secure store
 * - UNAUTHENTICATED: No wallet/passkey registered yet
 * - ONBOARDING    : Wallet exists but passkey not yet created (transitional)
 * - READY         : User is authenticated and can access the app
 * - LOCKED        : Session timed out — passkey re-auth required
 */

export type AuthStatus = 'LOADING' | 'UNAUTHENTICATED' | 'ONBOARDING' | 'READY' | 'LOCKED';

export interface AuthState {
  status: AuthStatus;
  /** Wallet public key (Stellar address) — null until wallet is created */
  publicKey: string | null;
  /** Passkey credential ID — null until passkey is registered */
  credentialId: string | null;
  /** ISO timestamp of the last successful authentication */
  lastAuthAt: string | null;
  /** Supabase access token for server-backed operations */
  sessionToken: string | null;
  /** Error from the most recent auth attempt, if any */
  lastError: string | null;
}

export const INITIAL_AUTH_STATE: AuthState = {
  status: 'LOADING',
  publicKey: null,
  credentialId: null,
  lastAuthAt: null,
  sessionToken: null,
  lastError: null,
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type AuthAction =
  | { type: 'REHYDRATE'; payload: Partial<AuthState> }
  | { type: 'PASSKEY_REGISTERED'; credentialId: string; publicKey: string | null }
  | { type: 'SESSION_ESTABLISHED'; accessToken: string }
  | { type: 'AUTHENTICATED'; credentialId: string }
  | { type: 'LOCK' }
  | { type: 'LOGOUT' }
  | { type: 'SET_ERROR'; error: string | null };

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'REHYDRATE': {
      const merged = { ...state, ...action.payload };
      // Derive status from persisted data
      if (!merged.credentialId) {
        return { ...merged, status: 'UNAUTHENTICATED', lastError: null };
      }
      // Credential exists but session must be re-established on cold start
      return { ...merged, status: 'LOCKED', lastError: null };
    }

    case 'PASSKEY_REGISTERED':
      return {
        ...state,
        status: 'READY',
        credentialId: action.credentialId,
        publicKey: action.publicKey,
        lastAuthAt: new Date().toISOString(),
        lastError: null,
      };

    case 'SESSION_ESTABLISHED':
      return { ...state, sessionToken: action.accessToken, lastError: null };

    case 'AUTHENTICATED':
      if (state.status !== 'LOCKED' && state.status !== 'ONBOARDING') {
        return state;
      }
      return {
        ...state,
        status: 'READY',
        credentialId: action.credentialId,
        lastAuthAt: new Date().toISOString(),
        lastError: null,
      };

    case 'LOCK':
      if (state.status !== 'READY') return state;
      return { ...state, status: 'LOCKED', lastAuthAt: state.lastAuthAt };

    case 'LOGOUT':
      return {
        ...INITIAL_AUTH_STATE,
        status: 'UNAUTHENTICATED',
      };

    case 'SET_ERROR':
      return { ...state, lastError: action.error };

    default:
      return state;
  }
}
