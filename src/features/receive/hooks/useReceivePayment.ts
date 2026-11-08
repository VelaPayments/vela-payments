/**
 * Receive payment FSM orchestrator (CLI-065).
 *
 * States: idle -> preparing -> broadcasting -> waiting -> success | failed | cancelled.
 *
 * NFC delivery success (the writer session completing) is not the same as
 * payment success — it only means the request payload reached the payer's
 * device. That is why `broadcasting` moves to `waiting` automatically once
 * the NFC writer reports success, and a separate `confirmSuccess` /
 * `confirmFailure` call is what actually resolves the flow once the payment
 * (or its absence) has been confirmed.
 *
 * @see docs/receive-flow.md — state diagram, timeout model, error matrix
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AnalyticsEvents, type AmountBucket } from '@/constants/analytics-events';
import { useNfcWriter } from '@/features/nfc/hooks/useNfcWriter';
import type { PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import { paymentRequestBuilder } from '@/features/receive/services/PaymentRequestBuilder';
import { receiveSession } from '@/features/receive/services/receiveSession';
import { trustlineService } from '@/features/wallet/services/TrustlineService';
import type { SupportedAssetCode } from '@/features/wallet/constants/assets';
import { trackEvent } from '@/lib/analytics';
import { PaymentApiClient } from '@/features/payments/services/PaymentApiClient';
import { useOptionalAuth } from '@/features/auth/hooks/useAuth';
import { env } from '@/lib/env';

export type ReceiveState =
  | 'idle'
  | 'preparing'
  | 'broadcasting'
  | 'waiting'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface UseReceivePaymentResult {
  state: ReceiveState;
  paymentRequest: PaymentRequest | null;
  error: string | null;
  txHash: string | null;
  nfcStatus: ReturnType<typeof useNfcWriter>['status'];
  prepare: (amount: string, asset: SupportedAssetCode, recipientPublicKey: string) => Promise<void>;
  startBroadcast: () => Promise<void>;
  cancel: () => Promise<void>;
  confirmSuccess: (txHash?: string) => void;
  confirmFailure: (reason: string) => void;
  reset: () => void;
}

/** Buckets a raw amount into a non-identifying range for analytics. Never log the raw amount. */
function amountBucket(amount: string): AmountBucket {
  const value = parseFloat(amount);
  if (value < 1) return '<1';
  if (value < 10) return '1-10';
  if (value < 100) return '10-100';
  return '>100';
}

export function useReceivePayment(): UseReceivePaymentResult {
  // `phase` never includes 'waiting' — that's derived below rather than
  // stored, so the transition doesn't require calling setState from inside
  // an Effect (see https://react.dev/learn/you-might-not-need-an-effect).
  const [phase, setPhase] = useState<Exclude<ReceiveState, 'waiting'>>('idle');
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const auth = useOptionalAuth();
  const sessionToken = auth?.state.sessionToken ?? null;

  // Internal-only bookkeeping that is never read during render (only from
  // event handlers/effects), so it's safe to keep as a ref.
  const assetRef = useRef<string>('XLM');
  const cancelExpiryRef = useRef<(() => void) | null>(null);
  const waitingEmittedRef = useRef(false);

  const nfcWriter = useNfcWriter();

  // NFC delivery success only means the request payload reached the payer's
  // device — the receiver still has to wait for the on-chain payment, hence
  // deriving 'waiting' instead of the NFC writer's 'success' bleeding through.
  const state: ReceiveState =
    phase === 'broadcasting' && nfcWriter.status === 'success' ? 'waiting' : phase;

  const cancelExpiryTimer = useCallback(() => {
    cancelExpiryRef.current?.();
    cancelExpiryRef.current = null;
  }, []);

  const confirmFailure = useCallback(
    (reason: string) => {
      cancelExpiryTimer();
      setError(reason);
      setPhase('failed');
      trackEvent(AnalyticsEvents.RECEIVE_FAILED, {
        amount_bucket: paymentRequest
          ? amountBucket(paymentRequest.amount)
          : ('<1' as AmountBucket),
        asset: assetRef.current,
        reason,
      });
    },
    [cancelExpiryTimer, paymentRequest]
  );

  const confirmSuccess = useCallback(
    (txHashArg?: string) => {
      cancelExpiryTimer();
      setError(null);
      setTxHash(txHashArg ?? null);
      setPhase('success');
      trackEvent(AnalyticsEvents.RECEIVE_COMPLETED, {
        amount_bucket: paymentRequest
          ? amountBucket(paymentRequest.amount)
          : ('<1' as AmountBucket),
        asset: assetRef.current,
      });
    },
    [cancelExpiryTimer, paymentRequest]
  );

  const cancel = useCallback(async () => {
    cancelExpiryTimer();
    receiveSession.cancelAll();
    await nfcWriter.cancel();
    setPhase('cancelled');
    trackEvent(AnalyticsEvents.RECEIVE_CANCELLED, {
      amount_bucket: paymentRequest ? amountBucket(paymentRequest.amount) : ('<1' as AmountBucket),
      asset: assetRef.current,
    });
  }, [cancelExpiryTimer, nfcWriter, paymentRequest]);

  const prepare = useCallback(
    async (amount: string, asset: SupportedAssetCode, recipientPublicKey: string) => {
      setError(null);
      assetRef.current = asset;
      setPhase('preparing');
      trackEvent(AnalyticsEvents.RECEIVE_STARTED, {
        amount_bucket: amountBucket(amount),
        asset,
      });

      try {
        if (asset === 'USDC') {
          const { hasLine } = await trustlineService.checkUsdcTrustline(recipientPublicKey);
          if (!hasLine) {
            throw new Error('trustline_missing');
          }
        }

        const request = paymentRequestBuilder.build({ amount, asset, recipientPublicKey });
        if (sessionToken) {
          const requestId = request.requestId;
          if (!requestId) throw new Error('Payment request ID is missing.');
          const persisted = await PaymentApiClient.createPaymentRequest(sessionToken, {
            ...request,
            requestId,
          });
          const expectedNetwork = env.stellarNetwork === 'testnet' ? 'TESTNET' : 'MAINNET';
          if (persisted.network !== expectedNetwork) {
            throw new Error(`Server network mismatch: expected ${expectedNetwork}.`);
          }
        }
        setPaymentRequest(request);
        setPhase('preparing');
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown';
        confirmFailure(reason);
        throw err;
      }
    },
    [confirmFailure, sessionToken]
  );

  const startBroadcast = useCallback(async () => {
    if (!paymentRequest) {
      throw new Error('Cannot start broadcast before prepare() has built a payment request');
    }

    setPhase('broadcasting');
    trackEvent(AnalyticsEvents.RECEIVE_BROADCAST, {
      amount_bucket: amountBucket(paymentRequest.amount),
      asset: assetRef.current,
    });

    cancelExpiryTimer();
    cancelExpiryRef.current = receiveSession.startRequestExpiry(paymentRequest.expiresAt, () => {
      void cancel();
    });

    await nfcWriter.startWriting(paymentRequest);
  }, [cancel, cancelExpiryTimer, nfcWriter, paymentRequest]);

  const reset = useCallback(() => {
    cancelExpiryTimer();
    receiveSession.cancelAll();
    void nfcWriter.cancel();
    setPaymentRequest(null);
    setError(null);
    setTxHash(null);
    setPhase('idle');
  }, [cancelExpiryTimer, nfcWriter]);

  // Emits RECEIVE_WAITING exactly once per transition into the derived
  // 'waiting' state. This only performs a side effect (analytics) — it never
  // calls a state setter, so it doesn't trigger cascading renders.
  useEffect(() => {
    if (state === 'waiting') {
      if (!waitingEmittedRef.current) {
        waitingEmittedRef.current = true;
        trackEvent(AnalyticsEvents.RECEIVE_WAITING, {
          amount_bucket: paymentRequest
            ? amountBucket(paymentRequest.amount)
            : ('<1' as AmountBucket),
          asset: assetRef.current,
        });
      }
    } else {
      waitingEmittedRef.current = false;
    }
  }, [state, paymentRequest]);

  useEffect(() => {
    return () => {
      cancelExpiryTimer();
    };
  }, [cancelExpiryTimer]);

  return {
    state,
    paymentRequest,
    error,
    txHash,
    nfcStatus: nfcWriter.status,
    prepare,
    startBroadcast,
    cancel,
    confirmSuccess,
    confirmFailure,
    reset,
  };
}

// ─── Shared instance across route navigations ──────────────────────────────
//
// Expo Router unmounts/remounts each screen on navigation, so the receive
// flow spans multiple screens (home -> listening -> waiting -> success/failed)
// that each need to see the *same* orchestrator state. ReceivePaymentProvider
// calls useReceivePayment() exactly once and shares it via context; mount it
// above every route that participates in the receive flow (see
// src/app/_layout.tsx). Call useReceivePaymentContext() from views instead of
// calling useReceivePayment() directly.

const ReceivePaymentContext = createContext<UseReceivePaymentResult | null>(null);

export function ReceivePaymentProvider({ children }: { children: ReactNode }) {
  const value = useReceivePayment();
  return createElement(ReceivePaymentContext.Provider, { value }, children);
}

export function useReceivePaymentContext(): UseReceivePaymentResult {
  const context = useContext(ReceivePaymentContext);
  if (!context) {
    throw new Error('useReceivePaymentContext must be used within a ReceivePaymentProvider');
  }
  return context;
}
