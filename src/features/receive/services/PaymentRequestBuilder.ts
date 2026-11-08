/**
 * Builds NFC-broadcastable payment requests for the receive flow (CLI-063).
 *
 * @see src/features/nfc/schemas/paymentRequest.ts — canonical payment_request.v1 payload
 * @see docs/receive-flow.md — timeout model
 */
import { createPaymentRequest, type PaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import type { SupportedAssetCode } from '@/features/wallet/constants/assets';

export type { PaymentRequest };

/** Default time-to-live for a receive request before it expires (5 minutes). */
export const DEFAULT_EXPIRY_TTL_SECONDS = 5 * 60;

export interface BuildPaymentRequestInput {
  amount: string;
  asset: SupportedAssetCode;
  recipientPublicKey: string;
}

export class PaymentRequestBuilder {
  build({ amount, asset, recipientPublicKey }: BuildPaymentRequestInput): PaymentRequest {
    return createPaymentRequest({
      recipient: recipientPublicKey,
      asset,
      amount,
      requestId:
        globalThis.crypto?.randomUUID?.() ??
        `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ttlSeconds: DEFAULT_EXPIRY_TTL_SECONDS,
    });
  }
}

export const paymentRequestBuilder = new PaymentRequestBuilder();
