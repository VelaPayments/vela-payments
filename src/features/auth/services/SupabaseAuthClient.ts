import { env } from '@/lib/env';

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string };
}

export class SupabaseAuthError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SupabaseAuthError';
  }
}

async function call(path: string, body: Record<string, string>): Promise<SupabaseSession> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new SupabaseAuthError('Supabase Auth is not configured for this build.', 0);
  }

  const response = await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    user?: { id: string; email?: string };
    msg?: string;
    error_description?: string;
    message?: string;
  };

  if (!response.ok || !payload.access_token || !payload.refresh_token || !payload.user) {
    throw new SupabaseAuthError(
      payload.error_description ??
        payload.msg ??
        payload.message ??
        `Supabase Auth failed (${response.status}).`,
      response.status
    );
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in ?? 3600,
    token_type: payload.token_type ?? 'bearer',
    user: payload.user,
  };
}

export const SupabaseAuthClient = {
  signUp(email: string, password: string) {
    return call('/signup', { email, password });
  },

  signIn(email: string, password: string) {
    return call('/token?grant_type=password', { email, password });
  },
};
