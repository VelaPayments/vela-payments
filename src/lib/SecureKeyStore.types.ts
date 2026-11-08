/**
 * CLI-017 — SecureKeyStore types
 *
 * Defines the typed key contract for expo-secure-store access.
 * All keys that touch sensitive data require biometric authentication.
 */

// ─── Secure key names ─────────────────────────────────────────────────────────

export const SECURE_KEYS = {
  /** The passkey credential ID returned after registration */
  PASSKEY_CREDENTIAL_ID: 'ding.passkey.credentialId',
  /** The wallet's public key (Stellar address) — not a secret, but stored securely */
  WALLET_PUBLIC_KEY: 'ding.wallet.publicKey',
  /** Serialized auth state for persistence across cold starts */
  AUTH_STATE: 'ding.auth.state',
  /** Supabase access token used for authenticated Vela API requests */
  SUPABASE_ACCESS_TOKEN: 'ding.auth.supabase.accessToken',
  /** Supabase refresh token used to renew the API session */
  SUPABASE_REFRESH_TOKEN: 'ding.auth.supabase.refreshToken',
  /** Session timestamp of last authenticated activity */
  SESSION_LAST_ACTIVE: 'ding.session.lastActive',
  /** Stellar account public key (StrKey G...) generated for the on-chain wallet */
  WALLET_STELLAR_PUBLIC_KEY: 'ding.wallet.stellar.publicKey',
  /** Stellar account secret key (StrKey S...) — never read outside signing operations */
  WALLET_STELLAR_SECRET_KEY: 'ding.wallet.stellar.secretKey',
} as const;

export type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SecureStoreSetOptions {
  /**
   * Require biometric/device authentication before the value can be read.
   * Defaults to true for sensitive keys.
   */
  requireAuthentication?: boolean;
  /**
   * Custom prompt shown during biometric authentication.
   */
  authenticationPrompt?: string;
}
