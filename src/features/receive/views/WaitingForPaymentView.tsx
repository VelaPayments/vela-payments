/**
 * Waiting for the payer's on-chain payment to settle (CLI-066).
 *
 * The receiver polls the server's registered request for a confirmed payment;
 * the timeout remains authoritative when the device is offline or the payer
 * never completes the transfer.
 *
 * @see docs/receive-flow.md
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, LoadingSpinner, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useReceivePaymentContext } from '@/features/receive/hooks/useReceivePayment';
import { receiveSession } from '@/features/receive/services/receiveSession';
import { useOptionalAuth } from '@/features/auth/hooks/useAuth';
import { PaymentApiClient } from '@/features/payments/services/PaymentApiClient';
import { env } from '@/lib/env';

const WAIT_TIMEOUT_MS = 60_000;

export const WaitingForPaymentView = () => {
  const router = useRouter();
  const { state, paymentRequest, cancel, confirmSuccess, confirmFailure } =
    useReceivePaymentContext();
  const auth = useOptionalAuth();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timeoutStartedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeoutStartedRef.current) {
      return;
    }
    timeoutStartedRef.current = true;

    const cancelTimeout = receiveSession.startWaitTimeout(WAIT_TIMEOUT_MS, () => {
      confirmFailure('timeout');
    });

    return cancelTimeout;
  }, [confirmFailure]);

  useEffect(() => {
    const token = auth?.state.sessionToken;
    const requestId = paymentRequest?.requestId;
    if (state !== 'waiting' || !token || !requestId) return;

    let stopped = false;
    const poll = async () => {
      try {
        const request = await PaymentApiClient.getPaymentRequest(token, requestId);
        if (stopped) return;
        const expectedNetwork = env.stellarNetwork === 'testnet' ? 'TESTNET' : 'MAINNET';
        if (request.network !== expectedNetwork) {
          confirmFailure(`Payment request belongs to ${request.network}, not ${expectedNetwork}.`);
          return;
        }
        if (request.paymentStatus === 'CONFIRMED') {
          confirmSuccess(request.stellarTxHash ?? undefined);
        } else if (request.paymentStatus === 'FAILED') {
          confirmFailure('Payment failed on Stellar.');
        }
      } catch {
        // A transient API failure should not end the receive session; the wait timeout remains authoritative.
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 3_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [auth?.state.sessionToken, confirmFailure, confirmSuccess, paymentRequest?.requestId, state]);

  useEffect(() => {
    if (state === 'success') {
      router.replace('/receive/success');
    } else if (state === 'failed') {
      router.replace('/receive/failed');
    } else if (state === 'cancelled') {
      router.replace('/(tabs)/receive');
    }
  }, [state, router]);

  const handleCancel = async () => {
    await cancel();
    router.replace('/(tabs)/receive');
  };

  return (
    <Screen>
      <ThemedText type="subtitle">Waiting for payment…</ThemedText>

      <View style={styles.body}>
        <LoadingSpinner />
        <ThemedText themeColor="textSecondary">{elapsedSeconds}s elapsed</ThemedText>
      </View>

      <Button label="Cancel" variant="secondary" onPress={handleCancel} style={styles.cancel} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  cancel: {
    marginBottom: Spacing.four,
  },
});
