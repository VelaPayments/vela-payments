import {
  DEFAULT_EXPIRY_TTL_SECONDS,
  PaymentRequestBuilder,
} from '@/features/receive/services/PaymentRequestBuilder';

const VALID_RECIPIENT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('PaymentRequestBuilder', () => {
  it('returns a valid PaymentRequest shape', () => {
    const builder = new PaymentRequestBuilder();

    const request = builder.build({
      amount: '25.50',
      asset: 'USDC',
      recipientPublicKey: VALID_RECIPIENT,
    });

    expect(request).toMatchObject({
      type: 'payment_request',
      recipient: VALID_RECIPIENT,
      asset: 'USDC',
      amount: '25.50',
    });
    expect(typeof request.timestamp).toBe('number');
    expect(typeof request.expiresAt).toBe('number');
  });

  it('sets expiresAt to timestamp + DEFAULT_EXPIRY_TTL_SECONDS', () => {
    const builder = new PaymentRequestBuilder();

    const request = builder.build({
      amount: '10',
      asset: 'XLM',
      recipientPublicKey: VALID_RECIPIENT,
    });

    expect(request.expiresAt - request.timestamp).toBe(DEFAULT_EXPIRY_TTL_SECONDS);
    expect(DEFAULT_EXPIRY_TTL_SECONDS).toBe(5 * 60);
  });

  it('builds a request with the minimum valid amount', () => {
    const request = new PaymentRequestBuilder().build({
      amount: '0.0000001',
      asset: 'XLM',
      recipientPublicKey: VALID_RECIPIENT,
    });

    expect(request.amount).toBe('0.0000001');
  });

  it('produces correct type/recipient/asset/amount across repeated calls', () => {
    const builder = new PaymentRequestBuilder();

    const first = builder.build({
      amount: '1',
      asset: 'XLM',
      recipientPublicKey: VALID_RECIPIENT,
    });
    const second = builder.build({
      amount: '1',
      asset: 'XLM',
      recipientPublicKey: VALID_RECIPIENT,
    });

    // createPaymentRequest derives its timestamp from Date.now(), not a uuid,
    // so two calls within the same second may be identical — what must hold
    // is that every field is internally consistent and well-formed.
    for (const request of [first, second]) {
      expect(request.type).toBe('payment_request');
      expect(request.recipient).toBe(VALID_RECIPIENT);
      expect(request.asset).toBe('XLM');
      expect(request.amount).toBe('1');
      expect(request.expiresAt).toBeGreaterThan(request.timestamp);
    }
  });
});
