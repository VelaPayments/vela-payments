/**
 * Receive success screen (CLI-067).
 *
 * RECEIVE_COMPLETED is emitted by the orchestrator's confirmSuccess() at the
 * moment of the state transition — this view only renders the result, it
 * does not re-emit the event (that would double-count the funnel step).
 *
 * @see docs/receive-flow.md
 */
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useReceivePaymentContext } from '@/features/receive/hooks/useReceivePayment';
import { stellarTransactionUrl } from '@/lib/stellarExplorer';

function truncateHash(hash: string): string {
  if (hash.length <= 12) {
    return hash;
  }
  return `${hash.slice(0, 6)}…${hash.slice(-6)}`;
}

export const ReceiveSuccessView = () => {
  const router = useRouter();
  const { paymentRequest, txHash, reset } = useReceivePaymentContext();

  const handleReceiveAnother = () => {
    reset();
    router.replace('/(tabs)/receive');
  };

  const handleDone = () => {
    router.replace('/(tabs)/receive');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <ThemedText type="title">✓</ThemedText>
        <ThemedText type="subtitle">Payment received</ThemedText>
        {paymentRequest ? (
          <ThemedText themeColor="textSecondary">
            {paymentRequest.amount} {paymentRequest.asset}
          </ThemedText>
        ) : null}
        {txHash ? (
          <ThemedText type="code" themeColor="textSecondary">
            {truncateHash(txHash)}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.actions}>
        {txHash ? (
          <Button
            label="View on Stellar Expert"
            variant="secondary"
            onPress={() => void Linking.openURL(stellarTransactionUrl(txHash))}
          />
        ) : null}
        <Button label="Receive Another" onPress={handleReceiveAnother} />
        <Button label="Done" variant="secondary" onPress={handleDone} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
});
