import { NFC_WRITER_TIMEOUT_MS } from '@/features/nfc/constants/nfcConstants';
import { encodePaymentRequest } from '@/features/nfc/services/NfcPayloadCodec';
import type { PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import { NfcError, toNfcError } from '@/features/nfc/services/NfcService.types';
import { nfcService } from '@/features/nfc/services/nfcServiceImpl';

export interface NfcWriterSession {
  cancel: () => Promise<void>;
}

export interface StartWriterSessionOptions {
  timeoutMs?: number;
  onWritten?: () => void;
  onError?: (error: NfcError) => void;
  alertMessage?: string;
}

export async function startWriterSession(
  request: PaymentRequest | Uint8Array,
  options: StartWriterSessionOptions = {}
): Promise<NfcWriterSession> {
  const timeoutMs = options.timeoutMs ?? NFC_WRITER_TIMEOUT_MS;
  let cancelled = false;
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

  const payload = request instanceof Uint8Array ? request : encodePaymentRequest(request);

  timeoutId = setTimeout(async () => {
    if (cancelled) {
      return;
    }

    cancelled = true;
    await cleanup();
    options.onError?.(new NfcError('SESSION_TIMEOUT', 'NFC writer session timed out'));
  }, timeoutMs);

  try {
    await nfcService.startWriterSession(payload, {
      alertMessage: options.alertMessage,
      onSuccess: () => {
        if (cancelled) {
          return;
        }

        cancelled = true;
        void cleanup();
        options.onWritten?.();
      },
      onError: (error) => {
        if (cancelled) {
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
      options.onError?.(new NfcError('SESSION_CANCELLED', 'NFC writer session cancelled'));
    },
  };
}
