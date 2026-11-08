import { Platform } from 'react-native';

import { NFC_READER_TIMEOUT_MS } from '@/features/nfc/constants/nfcConstants';
import {
  decodePaymentRequest,
  encodePaymentRequest,
} from '@/features/nfc/services/NfcPayloadCodec';
import type { PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import { NfcError, toNfcError } from '@/features/nfc/services/NfcService.types';
import { nfcService } from '@/features/nfc/services/nfcServiceImpl';
import { startWriterSession } from '@/features/nfc/services/NfcWriter';

export function isNfcAvailable(): boolean {
  // Basic availability detection: web is not supported here; native platforms
  if (Platform.OS === 'web') return false;
  // For Android/iOS assume the app config and runtime provide NFC support.
  // Native runtime should be probed by a native module; keep this simple and
  // let actual session starts surface runtime errors.
  return true;
}

export class NfcReader {
  private cancelled = false;
  private session: NfcReaderSession | null = null;
  private pendingReject: ((reason?: unknown) => void) | null = null;

  async startRead(timeoutMs = NFC_READER_TIMEOUT_MS): Promise<PaymentRequest> {
    if (!isNfcAvailable()) {
      throw new NfcError('UNSUPPORTED', 'NFC is not supported on this device');
    }
    this.cancelled = false;

    return new Promise((resolve, reject) => {
      let completed = false;
      this.pendingReject = reject;
      void startReaderSession({
        timeoutMs,
        onRequest: (request) => {
          completed = true;
          this.pendingReject = null;
          this.session = null;
          resolve(request);
        },
        onError: (error) => {
          completed = true;
          this.pendingReject = null;
          this.session = null;
          reject(error);
        },
      })
        .then((session) => {
          if (completed || this.cancelled) {
            void session.cancel();
            return;
          }
          this.session = session;
        })
        .catch((error) => {
          if (completed) return;
          completed = true;
          this.pendingReject = null;
          reject(toNfcError(error));
        });
    });
  }

  async startWrite(
    payload: PaymentRequest | Uint8Array,
    timeoutMs = NFC_READER_TIMEOUT_MS
  ): Promise<void> {
    if (!isNfcAvailable()) {
      throw new NfcError('UNSUPPORTED', 'NFC is not supported on this device');
    }
    this.cancelled = false;
    const bytes = payload instanceof Uint8Array ? payload : encodePaymentRequest(payload);

    return new Promise((resolve, reject) => {
      let completed = false;
      this.pendingReject = reject;
      void startWriterSession(bytes, {
        timeoutMs,
        onWritten: () => {
          completed = true;
          this.pendingReject = null;
          this.session = null;
          resolve();
        },
        onError: (error) => {
          completed = true;
          this.pendingReject = null;
          this.session = null;
          reject(error);
        },
      })
        .then((session) => {
          if (completed || this.cancelled) {
            void session.cancel();
            return;
          }
          this.session = session;
        })
        .catch((error) => {
          if (completed) return;
          completed = true;
          this.pendingReject = null;
          reject(toNfcError(error));
        });
    });
  }

  cancel() {
    this.cancelled = true;
    const reject = this.pendingReject;
    const session = this.session;
    this.pendingReject = null;
    this.session = null;
    void session?.cancel();
    void nfcService.cancelSession().catch(() => undefined);
    reject?.(new NfcError('SESSION_CANCELLED', 'NFC session cancelled'));
  }
}

export default NfcReader;

export interface NfcReaderSession {
  cancel: () => Promise<void>;
}

export interface StartReaderSessionOptions {
  timeoutMs?: number;
  onRequest: (request: PaymentRequest) => void;
  onError?: (error: NfcError) => void;
  alertMessage?: string;
}

export async function startReaderSession(
  options: StartReaderSessionOptions
): Promise<NfcReaderSession> {
  const timeoutMs = options.timeoutMs ?? NFC_READER_TIMEOUT_MS;
  let cancelled = false;
  let delivered = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cleanup = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    await nfcService.cancelSession().catch(() => undefined);
  };

  const supported = await nfcService.isSupported();
  if (!supported) {
    throw new NfcError('UNSUPPORTED', 'NFC is not supported on this device');
  }

  const enabled = await nfcService.isEnabled();
  if (!enabled) {
    throw new NfcError('DISABLED', 'NFC is disabled. Enable it in system settings.');
  }

  timeoutId = setTimeout(async () => {
    if (cancelled || delivered) {
      return;
    }

    cancelled = true;
    await cleanup();
    options.onError?.(new NfcError('SESSION_TIMEOUT', 'NFC reader session timed out'));
  }, timeoutMs);

  try {
    await nfcService.startReaderSession({
      alertMessage: options.alertMessage,
      onPayload: (payload) => {
        if (cancelled || delivered) {
          return;
        }

        try {
          const request = decodePaymentRequest(payload, { rejectExpired: true });
          delivered = true;
          cancelled = true;
          void cleanup();
          options.onRequest(request);
        } catch (error) {
          if (delivered || cancelled) {
            return;
          }

          const nfcError = toNfcError(error);
          options.onError?.(nfcError);
        }
      },
      onError: (error) => {
        if (cancelled || delivered) {
          return;
        }

        cancelled = true;
        void cleanup();
        options.onError?.(error);
      },
    });
  } catch (error) {
    cancelled = true;
    await cleanup();
    throw toNfcError(error);
  }

  return {
    cancel: async () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      await cleanup();
      options.onError?.(new NfcError('SESSION_CANCELLED', 'NFC reader session cancelled'));
    },
  };
}
