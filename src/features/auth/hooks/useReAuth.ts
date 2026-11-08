/**
 * CLI-020 — useReAuth hook
 *
 * Gate for sensitive actions requiring re-authentication.
 * Returns a function that gates any async action behind passkey auth.
 *
 * Usage:
 *   const { withReAuth, isAuthenticating } = useReAuth();
 *   await withReAuth(async () => { ... sensitive action ... });
 */

import { useCallback, useState } from 'react';

import { useAuth } from './useAuth';
import { AuthErrorCode } from '../services/authErrors';
import { PasskeyService } from '../services/PasskeyService';
import { toast } from '@/lib/toast';
import { env } from '@/lib/env';

export interface UseReAuthResult {
  /** Wrap a sensitive async action behind passkey re-authentication */
  withReAuth: <T>(action: () => Promise<T>) => Promise<T | null>;
  /** True while passkey authentication is in progress */
  isAuthenticating: boolean;
}

export function useReAuth(): UseReAuthResult {
  const { state } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const withReAuth = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      // If already authenticated and not locked, run the action directly
      if (state.status === 'READY') {
        return action();
      }

      setIsAuthenticating(true);
      try {
        const result = await PasskeyService.authenticate({
          rpId: env.webauthnRpId,
          challenge: '',
          reason: 'Confirma tu identidad para completar esta acción',
        });

        if (!result.success) {
          if (result.error.code !== AuthErrorCode.USER_CANCELLED) {
            toast.error(result.error.message);
          }
          return null;
        }

        return await action();
      } finally {
        setIsAuthenticating(false);
      }
    },
    [state.status]
  );

  return { withReAuth, isAuthenticating };
}
