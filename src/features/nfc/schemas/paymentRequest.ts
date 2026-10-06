/**
 * Canonical payment-request payload for NFC transport (payment_request.v1).
 *
 * @see docs/vela-overview.md — Proposed Payment Payload Structure
 * @see docs/adr-nfc-library.md — payload size and encoding constraints
 */

import { z } from 'zod';

import { isSupportedAssetCode } from '@/features/wallet/constants/assets';

/** Forbidden fields helper (keep as utility) */
export const forbiddenKeyPatterns = [
  /secret/i,
  /private/i,
  /seed/i,
  /token/i,
  /passphrase/i,
  /password/i,
  /privKey/i,
  /keyPair/i,
];

export function assertNoSecrets(obj: Record<string, any>) {
  const keys = Object.keys(obj);
  const matches = keys.filter((k) => forbiddenKeyPatterns.some((r) => r.test(k)));
  if (matches.length > 0) {
    throw new Error(`Payload contains forbidden fields: ${matches.join(', ')}`);
  }
}

/** Stellar StrKey public key (G + 55 base32 chars). */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/** Decimal amount string (up to 7 fractional digits). */
const AMOUNT_REGEX = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/;

export const paymentRequestSchema = z
  .object({
    type: z.literal('payment_request'),
    recipient: z.string().regex(STELLAR_PUBLIC_KEY_REGEX, 'Invalid Stellar public key'),
    asset: z.string().refine(isSupportedAssetCode, 'Unsupported asset code'),
    amount: z
      .string()
      .regex(AMOUNT_REGEX, 'Amount must be a positive decimal string')
      .refine(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
        'Amount must be finite and greater than zero'
      ),
    timestamp: z.number().positive().max(8_640_000_000_000),
    expiresAt: z.number().positive().max(8_640_000_000_000),
    memo: z.string().max(280).optional(),
    requestId: z.string().min(1).max(128).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((data) => data.expiresAt > data.timestamp, {
    message: 'expiresAt must be after timestamp',
    path: ['expiresAt'],
  })
  .refine((data) => data.expiresAt - data.timestamp <= 24 * 60 * 60, {
    message: 'expiresAt must be no more than 24 hours after timestamp',
    path: ['expiresAt'],
  });

export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export class PaymentRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRequestValidationError';
  }
}

export function parsePaymentRequest(input: unknown): PaymentRequest {
  const result = paymentRequestSchema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new PaymentRequestValidationError(message);
  }

  return result.data;
}

/** Returns true when the request is still valid at `nowMs` (defaults to Date.now()). */
export function validateExpiry(request: PaymentRequest, nowMs = Date.now()): boolean {
  return request.expiresAt * 1000 > nowMs;
}

/** Parses and rejects expired requests. */
export function parsePaymentRequestFresh(input: unknown, nowMs = Date.now()): PaymentRequest {
  const request = parsePaymentRequest(input);

  if (!validateExpiry(request, nowMs)) {
    throw new PaymentRequestValidationError('Payment request has expired');
  }

  if (Math.abs(request.timestamp * 1000 - nowMs) > 5 * 60 * 1000) {
    throw new PaymentRequestValidationError('timestamp must be within 5 minutes of current time');
  }

  return request;
}

export function createPaymentRequest(
  partial: Omit<PaymentRequest, 'type' | 'timestamp' | 'expiresAt'> & {
    timestamp?: number;
    expiresAt?: number;
    ttlSeconds?: number;
  }
): PaymentRequest {
  const timestamp = partial.timestamp ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = partial.ttlSeconds ?? 30;
  const expiresAt = partial.expiresAt ?? timestamp + ttlSeconds;

  return parsePaymentRequest({
    type: 'payment_request',
    recipient: partial.recipient,
    asset: partial.asset,
    amount: partial.amount,
    timestamp,
    expiresAt,
    ...(partial.memo === undefined ? {} : { memo: partial.memo }),
    ...(partial.requestId === undefined ? {} : { requestId: partial.requestId }),
    ...(partial.metadata === undefined ? {} : { metadata: partial.metadata }),
  });
}
