import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { useOptionalAuth } from '@/features/auth/hooks/useAuth';
import { PaymentApiClient } from '@/features/payments/services/PaymentApiClient';
import { useWallet } from '@/features/wallet/hooks/useWallet';
import { HistoryService, markServerIndexed, type HistoryItem } from '../services/HistoryService';

export const HistoryHomeView = () => {
  const { publicKey } = useWallet();
  const auth = useOptionalAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverIndexWarning, setServerIndexWarning] = useState(false);
  const sessionToken = auth?.state.sessionToken;

  const load = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    setServerIndexWarning(false);
    try {
      const horizonItems = await HistoryService.list(publicKey);
      let indexedHashes = new Set<string>();
      if (sessionToken) {
        try {
          const serverHistory = await PaymentApiClient.getTransactionHistory(sessionToken, {
            page: 1,
            limit: 100,
          });
          indexedHashes = new Set(
            serverHistory.data.map((transaction) => transaction.stellarTxHash)
          );
        } catch {
          setServerIndexWarning(true);
        }
      }
      setItems(markServerIndexed(horizonItems, indexedHashes));
    } catch {
      setError('Unable to load Stellar history. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [publicKey, sessionToken]);

  useEffect(() => {
    // This effect intentionally refreshes external history when its inputs change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <Screen scrollable>
      <ThemedText type="subtitle">History</ThemedText>
      <ThemedText themeColor="textSecondary">
        Verified payment activity from Stellar Horizon.
      </ThemedText>
      <Button
        label="Refresh"
        variant="secondary"
        onPress={() => void load()}
        loading={loading}
        style={styles.refresh}
      />
      {serverIndexWarning ? (
        <ThemedText themeColor="error" type="small">
          Horizon history is available, but the Vela confirmation index could not be checked.
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText themeColor="error" type="small">
          {error}
        </ThemedText>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          No Stellar payments yet.
        </ThemedText>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={styles.item}>
          <View style={styles.row}>
            <ThemedText type="smallBold">
              {item.direction === 'sent' ? 'Sent' : 'Received'} {item.asset}
            </ThemedText>
            <ThemedText type="smallBold">{item.amount}</ThemedText>
          </View>
          <ThemedText type="code" themeColor="textSecondary">
            {item.counterparty}
          </ThemedText>
          <ThemedText type="small" themeColor={item.verifiedAsset ? 'textSecondary' : 'error'}>
            {item.verifiedAsset
              ? 'Verified asset issuer'
              : `Unverified issuer: ${item.assetIssuer ?? 'unknown'}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {item.serverIndexed ? 'Indexed by Vela' : 'Horizon record'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ledger {item.ledger} · {new Date(item.createdAt).toLocaleString()}
          </ThemedText>
          <Button
            label="View on Stellar Expert"
            variant="secondary"
            onPress={() => void Linking.openURL(item.explorerUrl)}
          />
        </View>
      ))}
    </Screen>
  );
};

const styles = StyleSheet.create({
  refresh: { marginTop: 20 },
  empty: { marginTop: 28 },
  item: { gap: 8, marginTop: 20, padding: 16, borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
