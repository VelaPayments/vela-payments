import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { env } from '@/lib/env';
import { useWallet } from '@/features/wallet/hooks/useWallet';
import { FundWalletView } from './FundWalletView';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PaymentApiClient } from '@/features/payments/services/PaymentApiClient';

const READY_REDIRECT_DELAY_MS = 900;

export function WalletSetupView() {
  const router = useRouter();
  const theme = useTheme();
  const { status, publicKey, error, createWallet, checkFunding } = useWallet();
  const { state: authState } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [walletLinked, setWalletLinked] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkedWallet = useRef<string | null>(null);
  const isWalletLinked = !authState.sessionToken || walletLinked;

  const linkWallet = useCallback(async () => {
    if (!publicKey || !authState.sessionToken) {
      return;
    }
    setLinkError(null);
    try {
      await PaymentApiClient.linkWallet(
        authState.sessionToken,
        publicKey,
        env.stellarNetwork === 'testnet' ? 'TESTNET' : 'MAINNET'
      );
      linkedWallet.current = publicKey;
      setWalletLinked(true);
    } catch {
      linkedWallet.current = null;
      setWalletLinked(false);
      setLinkError(
        'No se pudo vincular la billetera con Vela. Verifica la conexión e inténtalo de nuevo.'
      );
    }
  }, [authState.sessionToken, publicKey]);

  useEffect(() => {
    if (status !== 'ready' || !publicKey) return;
    if (!authState.sessionToken) return;
    if (linkedWallet.current !== publicKey) void linkWallet();
  }, [authState.sessionToken, linkWallet, publicKey, status]);

  useEffect(() => {
    if (status !== 'ready' || !isWalletLinked) return;

    const timer = setTimeout(() => {
      router.replace('/(tabs)/receive');
    }, READY_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isWalletLinked, router, status]);

  const handleCreateWallet = useCallback(() => {
    void createWallet();
  }, [createWallet]);

  const handleCheckFunding = useCallback(async () => {
    setIsChecking(true);
    await checkFunding();
    setIsChecking(false);
  }, [checkFunding]);

  if (status === 'awaiting_funding' && publicKey) {
    return (
      <FundWalletView
        publicKey={publicKey}
        onCheckFunding={() => void handleCheckFunding()}
        isChecking={isChecking}
      />
    );
  }

  return (
    <Screen scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Configura tu billetera</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>
            Creamos una billetera Stellar en este dispositivo para que puedas recibir y enviar XLM y
            USDC.
          </ThemedText>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement }]}>
          <InfoRow icon="🔑" text="Tu llave privada nunca sale de este dispositivo" />
          <InfoRow
            icon="🌐"
            text={
              env.stellarNetwork === 'testnet'
                ? 'Se financiará automáticamente en la red de prueba'
                : 'Deberás depositar fondos para activarla'
            }
          />
          <InfoRow icon="💵" text="USDC se habilita automáticamente cuando hay fondos" />
        </View>

        {status === 'ready' && isWalletLinked && (
          <View style={[styles.successCard, { backgroundColor: theme.success + '20' }]}>
            <ThemedText type="smallBold" style={{ color: theme.success }}>
              ✓ Billetera lista
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Redirigiendo…
            </ThemedText>
          </View>
        )}

        {status === 'error' && error && (
          <View style={[styles.errorCard, { backgroundColor: theme.error + '20' }]}>
            <ThemedText type="small" style={{ color: theme.error }}>
              {error}
            </ThemedText>
          </View>
        )}

        {status === 'ready' && linkError && (
          <View style={[styles.errorCard, { backgroundColor: theme.error + '20' }]}>
            <ThemedText type="small" style={{ color: theme.error }}>
              {linkError}
            </ThemedText>
            <Button
              label="Vincular de nuevo"
              variant="secondary"
              onPress={() => void linkWallet()}
            />
          </View>
        )}

        {(status !== 'ready' || !isWalletLinked) && (
          <View style={styles.actions}>
            <Button
              label={
                status === 'creating'
                  ? 'Creando billetera…'
                  : status === 'ready'
                    ? linkError
                      ? 'Reintentar vinculación'
                      : 'Vinculando billetera…'
                    : status === 'error'
                      ? 'Intentar de nuevo'
                      : 'Crear billetera'
              }
              onPress={status === 'ready' ? () => void linkWallet() : handleCreateWallet}
              loading={
                status === 'creating' || (status === 'ready' && !isWalletLinked && !linkError)
              }
              disabled={status === 'creating' || (status === 'ready' && !linkError)}
              accessibilityLabel="Crear billetera Stellar"
              accessibilityHint="Genera una billetera y la activa en la red Stellar"
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.infoRow} accessibilityRole="text">
      <ThemedText style={styles.infoIcon} accessible={false}>
        {icon}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    gap: 12,
  },
  description: {
    lineHeight: 24,
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIcon: {
    fontSize: 18,
    lineHeight: 22,
    width: 24,
    textAlign: 'center',
  },
  infoText: {
    flex: 1,
    lineHeight: 20,
  },
  successCard: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  errorCard: {
    borderRadius: 12,
    padding: 14,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
});
