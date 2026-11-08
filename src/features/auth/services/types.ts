/**
 * CLI-014 — PasskeyService types
 *
 * Typed contracts for register, authenticate, and revoke operations.
 * These types decouple UI and auth-state layers from native passkey APIs.
 */

import type { AuthError } from './authErrors';

// ─── Registration ─────────────────────────────────────────────────────────────

export interface PasskeyRegistrationOptions {
  /** Relying party ID — must match the app's associated domain or package */
  rpId: string;
  /** Human-readable app name shown in passkey dialog */
  rpName: string;
  /** Unique opaque user ID (not a private key — typically a wallet address or UUID) */
  userId: string;
  /** Display name shown in passkey dialog */
  displayName: string;
  /** Base64url challenge from the server (or locally generated for offline preview) */
  challenge: string;
}

export interface PasskeyCredentialInfo {
  /** Passkey credential ID — stable identifier returned after registration */
  credentialId: string;
  /** Raw credential ID, when returned by the native WebAuthn implementation. */
  rawId?: string;
  /** Client data JSON (base64) — for server verification when live */
  clientDataJSON: string;
  /** Attestation object (base64) — for server verification when live */
  attestationObject: string;
  /** Transport mechanisms reported by the authenticator */
  transports: string[];
  /** ISO timestamp of registration */
  registeredAt: string;
}

export type RegisterResult =
  | { success: true; credential: PasskeyCredentialInfo }
  | { success: false; error: AuthError };

// ─── Authentication ───────────────────────────────────────────────────────────

export interface PasskeyAuthOptions {
  /** Relying party ID — must match the rpId used during registration */
  rpId: string;
  /** Base64url challenge (server-issued in production; local only for offline preview) */
  challenge: string;
  /** Human-readable reason shown in the OS prompt */
  reason?: string;
}

export interface PasskeyAuthResult {
  /** Credential ID that was used */
  credentialId: string;
  /** Raw credential ID, when returned by the native WebAuthn implementation. */
  rawId?: string;
  /** Authenticator data (base64) */
  authenticatorData: string;
  /** Client data JSON (base64) */
  clientDataJSON: string;
  /** Signature (base64) */
  signature: string;
  /** User handle (base64), present if returned by device */
  userHandle?: string;
}

export type AuthenticateResult =
  | { success: true; result: PasskeyAuthResult }
  | { success: false; error: AuthError };

// ─── Revocation ───────────────────────────────────────────────────────────────

export type RevokeResult = { success: true } | { success: false; error: AuthError };

// ─── Support check ────────────────────────────────────────────────────────────

export interface PasskeySupportInfo {
  isSupported: boolean;
  /** Platform-level detail for diagnostics */
  platform: string;
}
