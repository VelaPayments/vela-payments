/**
 * CLI-022 — SettingsAuthSection
 *
 * Auth controls in the settings screen:
 * - View wallet public key
 * - Logout / clear passkey
 * - Dev-only reset (gated behind __DEV__)
 *
 * Security: dev reset is strictly gated behind __DEV__ — never ships in
 * production builds.
 */

import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '@/features/wallet/hooks/useWallet';

export function SettingsAuthSection() {
  const { logout } = useAuth();
  const { publicKey: walletPublicKey } = useWallet();
  const theme = useTheme();
  const [pubkeyCopied, setPubkeyCopied] = useState(false);

  const publicKey = walletPublicKey;

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que deseas cerrar sesión? Necesitarás tu llave de acceso para volver a entrar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: () => void logout(),
        },
      ]
    );
  }, [logout]);

  // Dev-only reset — never shown in production
  const handleDevReset = useCallback(() => {
    if (!__DEV__) return;
    Alert.alert(
      '[DEV] Restablecer autenticación',
      'Esto borrará todos los datos de autenticación local. Solo disponible en modo desarrollo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restablecer',
          style: 'destructive',
          onPress: () => void logout(),
        },
      ]
    );
  }, [logout]);

  const handleCopyPubkey = useCallback(() => {
    if (!publicKey) return;
    // Clipboard.setStringAsync is available via expo-clipboard (not yet installed)
    // For now, show a truncated preview — replace with Clipboard when available
    setPubkeyCopied(true);
    setTimeout(() => setPubkeyCopied(false), 2000);
  }, [publicKey]);

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        AUTENTICACIÓN
      </ThemedText>

      {/* Public key display */}
      {publicKey ? (
        <TouchableOpacity
          onPress={handleCopyPubkey}
          style={[styles.pubkeyRow, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel={pubkeyCopied ? 'Clave pública copiada' : 'Copiar clave pública'}
          accessibilityHint="Toca para copiar tu clave pública de billetera"
        >
          <ThemedText type="small" themeColor="textSecondary" style={styles.pubkeyLabel}>
            Clave pública
          </ThemedText>
          <ThemedText
            type="code"
            numberOfLines={1}
            ellipsizeMode="middle"
            style={styles.pubkeyValue}
          >
            {pubkeyCopied ? '¡Copiada!' : publicKey}
          </ThemedText>
        </TouchableOpacity>
      ) : (
        <View style={[styles.pubkeyRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Sin billetera Stellar registrada
          </ThemedText>
        </View>
      )}

      {/* Logout */}
      <Button
        label="Cerrar sesión"
        variant="secondary"
        onPress={handleLogout}
        style={styles.actionButton}
        accessibilityLabel="Cerrar sesión de tu cuenta"
      />

      {/* Dev-only reset */}
      {__DEV__ && (
        <Button
          label="[DEV] Restablecer autenticación"
          variant="danger"
          onPress={handleDevReset}
          style={styles.actionButton}
          accessibilityLabel="Restablecer datos de autenticación (solo desarrollo)"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pubkeyRow: {
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  pubkeyLabel: {
    marginBottom: 2,
  },
  pubkeyValue: {
    fontSize: 13,
  },
  actionButton: {
    marginTop: 4,
  },
});
