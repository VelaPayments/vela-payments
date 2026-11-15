import { Platform } from 'react-native';
import NfcManager, { NfcEvents, NfcTech, Ndef, type TagEvent } from 'react-native-nfc-manager';

import { NFC_PAYMENT_MIME_TYPE } from '@/features/nfc/constants/nfcConstants';
import {
  NfcError,
  type NfcReaderSessionOptions,
  type NfcService,
  type NfcWriterSessionOptions,
  toNfcError,
} from '@/features/nfc/services/NfcService.types';

type AndroidNfcManager = typeof NfcManager & {
  setNdefPushMessage?: (bytes: number[] | null) => Promise<void>;
};

function getAndroidNfcManager(): AndroidNfcManager | undefined {
  return (NfcManager as AndroidNfcManager | null | undefined) ?? undefined;
}

let sessionKind: 'reader' | 'writer' | null = null;
let activeSessionId = 0;

function payloadFromTag(tag: TagEvent): Uint8Array | null {
  for (const record of tag.ndefMessage ?? []) {
    if (Ndef.isType(record, Ndef.TNF_MIME_MEDIA, NFC_PAYMENT_MIME_TYPE)) {
      return new Uint8Array(record.payload);
    }

    if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
      const text = Ndef.text.decodePayload(new Uint8Array(record.payload));
      return new TextEncoder().encode(text);
    }
  }

  return null;
}

function buildNdefMessage(payload: Uint8Array): number[] {
  const record = Ndef.record(Ndef.TNF_MIME_MEDIA, NFC_PAYMENT_MIME_TYPE, [], Array.from(payload));

  return Ndef.encodeMessage([record]);
}

async function cleanupSession(): Promise<void> {
  activeSessionId = 0;
  sessionKind = null;

  NfcManager?.setEventListener?.(NfcEvents.DiscoverTag, null);
  NfcManager?.setEventListener?.(NfcEvents.SessionClosed, null);

  await NfcManager?.unregisterTagEvent?.().catch(() => undefined);
  await NfcManager?.cancelTechnologyRequest?.({ throwOnError: false }).catch(() => undefined);

  const androidManager = getAndroidNfcManager();
  if (Platform.OS === 'android' && typeof androidManager?.setNdefPushMessage === 'function') {
    await androidManager.setNdefPushMessage(null).catch(() => undefined);
  }
}

export const nfcService: NfcService = {
  async isSupported() {
    try {
      return await NfcManager.isSupported();
    } catch {
      return false;
    }
  },

  async isEnabled() {
    try {
      return await NfcManager.isEnabled();
    } catch {
      return false;
    }
  },

  async start() {
    await NfcManager.start();
  },

  async stop() {
    await cleanupSession();
  },

  async cancelSession() {
    await cleanupSession();
  },

  async startReaderSession(options: NfcReaderSessionOptions) {
    if (sessionKind) {
      throw new NfcError('SESSION_ACTIVE', 'An NFC session is already active');
    }

    sessionKind = 'reader';
    await NfcManager.start();

    NfcManager.setEventListener(NfcEvents.DiscoverTag, async (tag: TagEvent) => {
      try {
        const payload = payloadFromTag(tag);
        if (!payload) {
          options.onError?.(new NfcError('EMPTY_NDEF', 'No payment payload found in NDEF message'));
          return;
        }

        options.onPayload(payload);
      } catch (error) {
        options.onError?.(toNfcError(error));
      }
    });

    await NfcManager.registerTagEvent({
      alertMessage: options.alertMessage ?? 'Hold your phone near the receiver device',
      invalidateAfterFirstRead: true,
      isReaderModeEnabled: Platform.OS === 'android',
    });
  },

  async startWriterSession(payload: Uint8Array, options: NfcWriterSessionOptions = {}) {
    if (sessionKind) {
      throw new NfcError('SESSION_ACTIVE', 'An NFC session is already active');
    }

    const transport = options.transport ?? (Platform.OS === 'android' ? 'peer' : 'tag');
    const androidManager = getAndroidNfcManager();

    if (Platform.OS === 'android' && transport === 'peer') {
      if (typeof androidManager?.setNdefPushMessage !== 'function') {
        throw new NfcError(
          'UNSUPPORTED',
          'Android phone-to-phone NFC push is unavailable on this device. Write to a writable NDEF tag or share the payment request another way.'
        );
      }
    } else if (
      typeof NfcManager?.registerTagEvent !== 'function' ||
      typeof NfcManager?.ndefHandler?.writeNdefMessage !== 'function'
    ) {
      throw new NfcError('UNSUPPORTED', 'NFC NDEF tag writing is unavailable on this device.');
    }

    const currentSessionId = Date.now() + Math.random();
    activeSessionId = currentSessionId;
    sessionKind = 'writer';

    try {
      await NfcManager.start();
      if (activeSessionId !== currentSessionId) {
        await cleanupSession();
        return;
      }

      const bytes = buildNdefMessage(payload);

      if (Platform.OS === 'android' && transport === 'peer') {
        const pushMessage = getAndroidNfcManager()?.setNdefPushMessage;
        if (typeof pushMessage !== 'function') {
          throw new NfcError(
            'UNSUPPORTED',
            'Android phone-to-phone NFC push is unavailable on this device. Write to a writable NDEF tag or share the payment request another way.'
          );
        }

        await pushMessage(bytes);
        if (activeSessionId !== currentSessionId) {
          await cleanupSession();
          return;
        }

        sessionKind = null;
        activeSessionId = 0;
        options.onSuccess?.();
        return;
      }

      NfcManager.setEventListener(NfcEvents.DiscoverTag, async () => {
        if (activeSessionId !== currentSessionId) {
          return;
        }

        try {
          await NfcManager.requestTechnology(NfcTech.Ndef, {
            alertMessage: options.alertMessage ?? 'Hold your phone near a writable NFC tag',
          });
          if (activeSessionId !== currentSessionId) {
            return;
          }

          await NfcManager.ndefHandler.writeNdefMessage(bytes);
          if (activeSessionId !== currentSessionId) {
            return;
          }

          await cleanupSession();
          options.onSuccess?.();
        } catch (error) {
          if (activeSessionId !== currentSessionId) {
            return;
          }

          await cleanupSession();
          options.onError?.(toNfcError(error));
        } finally {
          await NfcManager.cancelTechnologyRequest({ throwOnError: false }).catch(() => undefined);
        }
      });

      await NfcManager.registerTagEvent({
        alertMessage: options.alertMessage ?? 'Ready to write payment request to NFC tag',
        invalidateAfterFirstRead: false,
      });

      if (activeSessionId !== currentSessionId) {
        await cleanupSession();
      }
    } catch (error) {
      await cleanupSession();
      throw toNfcError(error);
    }
  },
};

export default nfcService;
