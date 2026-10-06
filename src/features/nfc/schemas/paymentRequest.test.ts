import {
  createPaymentRequest,
  parsePaymentRequest,
  parsePaymentRequestFresh,
  validateExpiry,
} from '@/features/nfc/schemas/paymentRequest';

const VALID_RECIPIENT = 'GBBD47IF6LWK7P7MUGHC2XLYUUXV6ZLW75PN7CHLIW2NSIW74UZEST66';

describe('paymentRequest schema', () => {
  const basePayload = {
    type: 'payment_request' as const,
    recipient: VALID_RECIPIENT,
    asset: 'USDC' as const,
    amount: '25.00',
    timestamp: 1_740_000_000,
    expiresAt: 1_740_000_030,
  };

  it('accepts a valid payment request', () => {
    expect(parsePaymentRequest(basePayload)).toEqual(basePayload);
  });

  it('accepts a valid XLM payment request', () => {
    const request = { ...basePayload, asset: 'XLM', amount: '1000' };
    expect(parsePaymentRequest(request)).toEqual(request);
  });

  it('rejects invalid Stellar public keys', () => {
    expect(() => parsePaymentRequest({ ...basePayload, recipient: 'INVALID' })).toThrow();
  });

  it('rejects unsupported assets', () => {
    expect(() => parsePaymentRequest({ ...basePayload, asset: 'BTC' })).toThrow();
  });

  it('rejects non-decimal amount strings', () => {
    expect(() => parsePaymentRequest({ ...basePayload, amount: '25,00' })).toThrow();
  });

  it('rejects expiresAt before timestamp', () => {
    expect(() =>
      parsePaymentRequest({ ...basePayload, expiresAt: basePayload.timestamp })
    ).toThrow();
  });

  it('preserves supported optional contract fields and rejects unknown ones', () => {
    const optional = {
      ...basePayload,
      memo: 'Coffee',
      requestId: 'req_123',
      metadata: { table: 7 },
    };
    expect(parsePaymentRequest(optional)).toEqual(optional);
    expect(() => parsePaymentRequest({ ...basePayload, surprise: true })).toThrow();
  });

  it('validateExpiry returns false for past requests', () => {
    const request = createPaymentRequest({
      recipient: VALID_RECIPIENT,
      asset: 'USDC',
      amount: '1.00',
      timestamp: 1,
      expiresAt: 2,
    });

    expect(validateExpiry(request, 3_000)).toBe(false);
  });

  it('parsePaymentRequestFresh rejects expired payloads', () => {
    expect(() => parsePaymentRequestFresh(basePayload, basePayload.expiresAt * 1000 + 1)).toThrow(
      /expired/i
    );
  });
});
