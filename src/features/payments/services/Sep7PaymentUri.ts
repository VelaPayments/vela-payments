import { isSupportedAssetCode, type SupportedAssetCode } from '@/features/wallet/constants/assets';
import { env } from '@/lib/env';

const SEP7_SCHEME = 'web+stellar:pay';
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const AMOUNT_REGEX = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/;

function validateIssuedAsset(assetCode: string | undefined, issuer: string | undefined): void {
  if (!assetCode || assetCode === 'XLM') return;
  if (!issuer) {
    throw new Error('SEP-0007 asset_issuer is required for non-native assets.');
  }
  if (!STELLAR_PUBLIC_KEY_REGEX.test(issuer)) {
    throw new Error('SEP-0007 asset_issuer is invalid.');
  }
  if (assetCode === 'USDC' && issuer !== env.usdcIssuer) {
    throw new Error('SEP-0007 asset_issuer does not match the configured USDC issuer.');
  }
}

export interface Sep7PaymentRequest {
  destination: string;
  amount?: string;
  assetCode?: SupportedAssetCode;
  assetIssuer?: string;
  memo?: string;
  memoType?: 'MEMO_TEXT' | 'MEMO_ID' | 'MEMO_HASH' | 'MEMO_RETURN';
  message?: string;
}

/** Encode a Stellar SEP-0007 payment URI for wallets, QR codes, and links. */
export function buildSep7PaymentUri(request: Sep7PaymentRequest): string {
  if (!STELLAR_PUBLIC_KEY_REGEX.test(request.destination)) {
    throw new Error('SEP-0007 destination is invalid.');
  }
  if (request.amount && (!AMOUNT_REGEX.test(request.amount) || Number(request.amount) <= 0)) {
    throw new Error('SEP-0007 amount is invalid.');
  }
  validateIssuedAsset(request.assetCode, request.assetIssuer);
  const params = new URLSearchParams();
  if (request.amount) params.set('amount', request.amount);
  if (request.assetCode && request.assetCode !== 'XLM') {
    params.set('asset_code', request.assetCode);
    if (request.assetIssuer) params.set('asset_issuer', request.assetIssuer);
  }
  if (request.memo) params.set('memo', request.memo);
  if (request.memoType) params.set('memo_type', request.memoType);
  if (request.message) params.set('msg', request.message);
  const query = params.toString();
  return `${SEP7_SCHEME}?destination=${encodeURIComponent(request.destination)}${
    query ? `&${query}` : ''
  }`;
}

/** Parse and validate the payment parameters supported by Vela. */
export function parseSep7PaymentUri(uri: string): Sep7PaymentRequest {
  if (!uri.startsWith(`${SEP7_SCHEME}?`)) throw new Error('Unsupported Stellar payment URI.');
  const query = new URLSearchParams(uri.slice(`${SEP7_SCHEME}?`.length));
  const destination = query.get('destination');
  if (!destination || !/^G[A-Z2-7]{55}$/.test(destination)) {
    throw new Error('SEP-0007 destination is invalid.');
  }
  const rawAssetCode = query.get('asset_code') ?? undefined;
  if (rawAssetCode && !isSupportedAssetCode(rawAssetCode)) {
    throw new Error('SEP-0007 asset is not supported.');
  }
  const assetCode = rawAssetCode as SupportedAssetCode | undefined;
  const amount = query.get('amount') ?? undefined;
  if (amount && (!AMOUNT_REGEX.test(amount) || Number(amount) <= 0)) {
    throw new Error('SEP-0007 amount is invalid.');
  }
  const assetIssuer = query.get('asset_issuer') ?? undefined;
  validateIssuedAsset(assetCode, assetIssuer);
  const memoType = query.get('memo_type') as Sep7PaymentRequest['memoType'];
  if (memoType && !['MEMO_TEXT', 'MEMO_ID', 'MEMO_HASH', 'MEMO_RETURN'].includes(memoType)) {
    throw new Error('SEP-0007 memo_type is invalid.');
  }
  return {
    destination,
    amount,
    assetCode,
    assetIssuer,
    memo: query.get('memo') ?? undefined,
    memoType: memoType || undefined,
    message: query.get('msg') ?? undefined,
  };
}
