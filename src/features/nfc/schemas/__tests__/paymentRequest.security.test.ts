import { assertNoSecrets, parsePaymentRequest } from '../paymentRequest';

describe('paymentRequest security guard', () => {
  it('throws when forbidden keys present', () => {
    const bad = { id: '1', secret: 'no', amount: 10 };
    expect(() => assertNoSecrets(bad)).toThrow(/forbidden fields/);
  });

  it('allows normal payloads', () => {
    const ok = { id: '1', amount: 10, currency: 'USD' };
    expect(() => assertNoSecrets(ok)).not.toThrow();
  });

  it('rejects a payment request containing a constructor key', () => {
    const payload = {
      type: 'payment_request',
      recipient: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      asset: 'USDC',
      amount: '1.00',
      timestamp: 1_740_000_000,
      expiresAt: 1_740_000_030,
      constructor: { prototype: { compromised: true } },
    };

    expect(() => parsePaymentRequest(payload)).toThrow();
  });
});
