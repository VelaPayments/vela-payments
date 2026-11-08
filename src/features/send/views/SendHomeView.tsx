import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PasskeyService } from '@/features/auth/services/PasskeyService';
import { useNfcReader } from '@/features/nfc/hooks/useNfcReader';
import {
  assertConfirmedPayment,
  PaymentApiClient,
} from '@/features/payments/services/PaymentApiClient';
import type { PaymentResponse } from '@/features/payments/services/PaymentApiClient';
import { useWallet } from '@/features/wallet/hooks/useWallet';
import { AccountService } from '@/features/wallet/services/AccountService';
import { BalanceService } from '@/features/wallet/services/BalanceService';
import { trustlineService } from '@/features/wallet/services/TrustlineService';
import { env } from '@/lib/env';
import { stellarTransactionUrl } from '@/lib/stellarExplorer';

type SendState = 'idle' | 'scanning' | 'review' | 'processing' | 'success' | 'error';

export const SendHomeView = () => {
  const { state: authState } = useAuth();
  const { publicKey } = useWallet();
  const { status: nfcStatus, error: nfcError, lastRequest, startReading, cancel } = useNfcReader();
  const [state, setState] = useState<SendState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentResponse | null>(null);

  useEffect(() => {
    // NFC callbacks update the workflow state after a scan completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastRequest) setState('review');
  }, [lastRequest]);

  useEffect(() => {
    if (nfcError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(nfcError.message);
      setState('error');
    }
  }, [nfcError]);

  const handleScan = useCallback(async () => {
    setError(null);
    setIntent(null);
    setTxHash(null);
    setState('scanning');
    await startReading();
  }, [startReading]);

  const handlePay = useCallback(async () => {
    if (!lastRequest?.requestId || !publicKey || !authState.sessionToken) {
      setError('Connect your Vela account and wallet before sending a payment.');
      setState('error');
      return;
    }

    setState('processing');
    setError(null);
    try {
      let currentIntent = intent;
      if (!currentIntent) {
        currentIntent = await PaymentApiClient.createPayment(authState.sessionToken, {
          requestId: lastRequest.requestId,
          senderPublicKey: publicKey,
        });
        setIntent(currentIntent);
      }

      const expectedNetwork = env.stellarNetwork === 'testnet' ? 'TESTNET' : 'MAINNET';
      if (currentIntent.network !== expectedNetwork) {
        throw new Error(`Payment intent network mismatch: expected ${expectedNetwork}.`);
      }

      AccountService.validatePaymentTransaction(currentIntent.unsignedXdr ?? '', {
        sourcePublicKey: publicKey,
        destination: currentIntent.recipient,
        asset: currentIntent.asset,
        amount: currentIntent.amount,
        memo: currentIntent.memo,
      });

      if (currentIntent.status === 'CREATED') {
        if (currentIntent.asset === 'USDC') {
          const { hasLine } = await trustlineService.checkUsdcTrustline(publicKey);
          if (!hasLine) {
            throw new Error('The payer wallet needs the configured USDC trustline before sending.');
          }
        }

        const balances = await BalanceService.fetchBalances(publicKey);
        if (
          !BalanceService.hasSufficientAssetBalance(
            balances,
            currentIntent.asset,
            currentIntent.amount
          )
        ) {
          throw new Error(
            `The payer wallet does not have enough ${currentIntent.asset} for this payment.`
          );
        }

        const options = await PaymentApiClient.getAuthenticationOptions(
          authState.sessionToken,
          currentIntent.id
        );
        const assertion = await PasskeyService.authenticateWithServerOptions(options);
        if (!assertion.success) throw new Error(assertion.error.message);

        await PaymentApiClient.authorizePayment(authState.sessionToken, currentIntent.id, {
          id: assertion.result.credentialId,
          rawId: assertion.result.rawId ?? assertion.result.credentialId,
          response: {
            authenticatorData: assertion.result.authenticatorData,
            clientDataJSON: assertion.result.clientDataJSON,
            signature: assertion.result.signature,
            userHandle: assertion.result.userHandle,
          },
          type: 'public-key',
        });
        currentIntent = { ...currentIntent, status: 'AUTHORIZED' };
        setIntent(currentIntent);
      }

      if (currentIntent.status !== 'AUTHORIZED') {
        throw new Error(`Payment intent is ${currentIntent.status} and cannot be submitted.`);
      }
      const signedXdr = await AccountService.signPaymentTransaction(
        currentIntent.unsignedXdr ?? ''
      );
      const submitted = await PaymentApiClient.submitPayment(
        authState.sessionToken,
        currentIntent.id,
        signedXdr
      );
      if (submitted.status === 'FAILED') {
        setIntent(submitted);
      }
      const confirmed = assertConfirmedPayment(submitted);
      setTxHash(confirmed.stellarTxHash);
      setState('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment could not be completed.');
      setState('error');
    }
  }, [authState.sessionToken, intent, lastRequest, publicKey]);

  const handleCancel = useCallback(async () => {
    await cancel();
    setState('idle');
  }, [cancel]);

  return (
    <Screen scrollable>
      <ThemedText type="subtitle">Send</ThemedText>
      <ThemedText themeColor="textSecondary">
        Scan a Vela payment request, review the destination, and approve the Stellar testnet
        payment.
      </ThemedText>

      {(state === 'idle' || (state === 'error' && !intent)) && (
        <Button label="Scan payment request" onPress={handleScan} style={styles.action} />
      )}

      {(state === 'scanning' || nfcStatus === 'scanning') && (
        <View style={styles.panel}>
          <ThemedText type="smallBold">Hold your phone near the receiver</ThemedText>
          <ThemedText themeColor="textSecondary">
            Waiting for a payment-request.v1 NFC payload.
          </ThemedText>
          <Button label="Cancel scan" variant="secondary" onPress={handleCancel} />
        </View>
      )}

      {lastRequest &&
        (state === 'review' || state === 'processing' || (state === 'error' && intent)) && (
          <View style={styles.panel}>
            <ThemedText type="smallBold">Review payment</ThemedText>
            <ThemedText>
              {lastRequest.amount} {lastRequest.asset}
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary">
              {lastRequest.recipient}
            </ThemedText>
            {lastRequest.memo ? (
              <ThemedText themeColor="textSecondary">Memo: {lastRequest.memo}</ThemedText>
            ) : null}
            {intent?.status === 'FAILED' ? (
              <>
                <ThemedText themeColor="error">
                  This payment was rejected by Stellar. Scan a new request to try again.
                </ThemedText>
                <Button label="Scan another request" onPress={handleScan} />
              </>
            ) : (
              <Button
                label={intent?.status === 'AUTHORIZED' ? 'Retry submission' : 'Approve and pay'}
                onPress={handlePay}
                loading={state === 'processing'}
              />
            )}
            <Button
              label="Cancel"
              variant="secondary"
              onPress={handleCancel}
              disabled={state === 'processing'}
            />
          </View>
        )}

      {state === 'success' && (
        <View style={styles.panel}>
          <ThemedText type="smallBold">Payment submitted</ThemedText>
          <ThemedText themeColor="textSecondary">
            The Stellar transaction was confirmed by the server.
          </ThemedText>
          {txHash ? <ThemedText type="code">{txHash}</ThemedText> : null}
          {txHash ? (
            <Button
              label="View on Stellar Expert"
              variant="secondary"
              onPress={() => void Linking.openURL(stellarTransactionUrl(txHash))}
            />
          ) : null}
          <Button label="Scan another request" onPress={() => setState('idle')} />
        </View>
      )}

      {(error || nfcError) && (
        <ThemedText themeColor="error" type="small">
          {error ?? nfcError?.message}
        </ThemedText>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  action: { marginTop: 24 },
  panel: { gap: 12, marginTop: 24 },
});
