import { MAX_NDEF_PAYLOAD_BYTES } from '@/features/nfc/constants/nfcConstants';
import {
  parsePaymentRequest,
  parsePaymentRequestFresh,
  type PaymentRequest,
  PaymentRequestValidationError,
} from '@/features/nfc/schemas/paymentRequest';
import { NfcError } from '@/features/nfc/services/NfcService.types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function encodePaymentRequest(request: PaymentRequest): Uint8Array {
  const validated = parsePaymentRequest(request);
  const json = JSON.stringify({
    ...validated,
    type: 'payment-request',
    version: 1,
    timestamp: new Date(Math.round(validated.timestamp * 1000)).toISOString(),
    expiresAt: new Date(Math.round(validated.expiresAt * 1000)).toISOString(),
  });
  const bytes = textEncoder.encode(json);

  assertMaxPayloadSize(bytes);
  return bytes;
}

export function decodePaymentRequest(
  bytes: Uint8Array,
  options?: { rejectExpired?: boolean; nowMs?: number }
): PaymentRequest {
  assertMaxPayloadSize(bytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw new NfcError('PAYLOAD_MALFORMED', 'NFC payload is not valid JSON');
  }

  try {
    parsed = fromPaymentRequestV1(parsed);
    if (options?.rejectExpired) {
      return parsePaymentRequestFresh(parsed, options.nowMs);
    }

    return parsePaymentRequest(parsed);
  } catch (error) {
    if (error instanceof PaymentRequestValidationError) {
      const code = error.message.includes('expired') ? 'PAYLOAD_EXPIRED' : 'PAYLOAD_INVALID';
      throw new NfcError(code, error.message);
    }

    throw error;
  }
}

function fromPaymentRequestV1(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const payload = input as Record<string, unknown>;
  if (payload.type !== 'payment-request' || payload.version !== 1) return input;
  if (
    typeof payload.timestamp !== 'string' ||
    typeof payload.expiresAt !== 'string' ||
    !ISO_UTC_PATTERN.test(payload.timestamp) ||
    !ISO_UTC_PATTERN.test(payload.expiresAt)
  )
    return input;
  const timestampMs = Date.parse(payload.timestamp);
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(expiresAtMs)) return input;
  const canonical = (value: string) => (value.includes('.') ? value : value.replace('Z', '.000Z'));
  if (
    new Date(timestampMs).toISOString() !== canonical(payload.timestamp) ||
    new Date(expiresAtMs).toISOString() !== canonical(payload.expiresAt)
  )
    return input;
  const { version: _version, ...request } = payload;
  return {
    ...request,
    type: 'payment_request',
    timestamp: timestampMs / 1000,
    expiresAt: expiresAtMs / 1000,
  };
}

export function assertMaxPayloadSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_NDEF_PAYLOAD_BYTES) {
    throw new NfcError(
      'PAYLOAD_OVERSIZE',
      `NFC payload exceeds ${MAX_NDEF_PAYLOAD_BYTES} byte limit (${bytes.byteLength} bytes)`
    );
  }
}

export const nfcPayloadCodec = {
  encode: encodePaymentRequest,
  decode: decodePaymentRequest,
  assertMaxPayloadSize,
};
