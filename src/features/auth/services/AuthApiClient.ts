/**
 * CLI-025 — AuthApiClient
 *
 * Server-facing auth interfaces plus offline compatibility fallbacks.
 * These types mirror anticipated S06/S10 server DTOs.
 *
 * Server-backed WebAuthn registration is live. The legacy challenge methods
 * remain local fallbacks for the offline preview until passwordless session
 * refresh is implemented end to end.
 *
 * Coordination: S06/S07 (user/auth domain), S10/S11 (WebAuthn semantics),
 * S19 (observability/telemetry conventions).
 */

import type { PasskeyAuthResult, PasskeyCredentialInfo } from './types';
import { env } from '@/lib/env';

// ─── Request / Response DTOs ──────────────────────────────────────────────────

export interface RegisterChallengeRequest {
  /** Client-provided user display name */
  displayName: string;
}

export interface RegisterChallengeResponse {
  /** Base64url challenge to use in Passkey.create() */
  challenge: string;
  /** Relying party ID from the server */
  rpId: string;
  /** User ID assigned by server */
  userId: string;
  /** Challenge expiry (ISO timestamp) */
  expiresAt: string;
}

export interface RegisterVerifyRequest {
  credential: PasskeyCredentialInfo;
  /** Challenge used during registration */
  challenge: string;
}

export interface RegisterVerifyResponse {
  /** Server-assigned wallet public key (Stellar address) */
  publicKey: string;
  /** Server-issued session token (for future use) */
  sessionToken: string;
  /** Token expiry (ISO timestamp) */
  expiresAt: string;
}

export interface AuthChallengeRequest {
  /** Credential ID used to hint the server which key to expect */
  credentialId?: string;
}

export interface AuthChallengeResponse {
  challenge: string;
  rpId: string;
  expiresAt: string;
}

export interface AuthVerifyRequest {
  result: PasskeyAuthResult;
  challenge: string;
}

export interface AuthVerifyResponse {
  sessionToken: string;
  publicKey: string;
  expiresAt: string;
}

export interface RevokeTokenRequest {
  sessionToken: string;
}

export interface RevokeTokenResponse {
  revoked: boolean;
}

// ─── AuthApiClient ────────────────────────────────────────────────────────────

export const AuthApiClient = {
  async getServerRegistrationOptions(token: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${env.apiBaseUrl}/webauthn/register/options`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readApiError(body, response.status));
    return body as Record<string, unknown>;
  },

  async verifyServerRegistration(
    token: string,
    credential: PasskeyCredentialInfo,
    deviceName?: string
  ): Promise<{ verified: true; credentialId: string }> {
    const response = await fetch(`${env.apiBaseUrl}/webauthn/register/verify`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: credential.credentialId,
        rawId: credential.rawId ?? credential.credentialId,
        response: {
          clientDataJSON: credential.clientDataJSON,
          attestationObject: credential.attestationObject,
          transports: credential.transports,
        },
        type: 'public-key',
        ...(deviceName ? { deviceName } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readApiError(body, response.status));
    return body as { verified: true; credentialId: string };
  },

  /** Legacy offline preview fallback; production registration uses the live methods above. */
  async getRegisterChallenge(
    _request: RegisterChallengeRequest
  ): Promise<RegisterChallengeResponse> {
    // Keep the legacy preview path usable when Supabase is not configured.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const challenge = Buffer.from(bytes).toString('base64url');
    return {
      challenge,
      rpId: 'dingpayments.app',
      userId: `user_${Date.now()}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  },

  /** Legacy offline preview fallback; production registration uses the live method above. */
  async verifyRegistration(request: RegisterVerifyRequest): Promise<RegisterVerifyResponse> {
    // The offline preview has no server credential store.
    return {
      publicKey: request.credential.credentialId,
      sessionToken: `offline_preview_token_${Date.now()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  /** Legacy offline preview fallback for the local-only auth path. */
  async getAuthChallenge(_request: AuthChallengeRequest): Promise<AuthChallengeResponse> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const challenge = Buffer.from(bytes).toString('base64url');
    return {
      challenge,
      rpId: 'dingpayments.app',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  },

  /** Legacy offline preview fallback for the local-only auth path. */
  async verifyAuthentication(request: AuthVerifyRequest): Promise<AuthVerifyResponse> {
    return {
      sessionToken: `offline_preview_token_${Date.now()}`,
      publicKey: request.result.credentialId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  },

  /** Local compatibility fallback; server sessions are revoked by Supabase logout. */
  async revokeToken(_request: RevokeTokenRequest): Promise<RevokeTokenResponse> {
    return { revoked: true };
  },
};

function readApiError(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return `Vela API request failed (${status}).`;
}
