import { assertConfirmedPayment, type PaymentResponse } from './PaymentApiClient';

const payment = (
  status: PaymentResponse['status'],
  failureCode: string | null = null
): PaymentResponse => ({
  id: 'payment-id',
  status,
  paymentRequestId: 'request-id',
  recipient: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  senderPublicKey: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  asset: 'XLM',
  network: 'TESTNET',
  amount: '1',
  memo: null,
  expiresAt: null,
  stellarTxHash: status === 'CONFIRMED' ? 'a'.repeat(64) : null,
  failureCode,
});

describe('assertConfirmedPayment', () => {
  it('returns confirmed payments for the success UI', () => {
    expect(assertConfirmedPayment(payment('CONFIRMED')).status).toBe('CONFIRMED');
  });

  it('rejects failed responses even when the HTTP request succeeded', () => {
    expect(() => assertConfirmedPayment(payment('FAILED', 'STELLAR_TX_FAILED'))).toThrow(
      'Payment was not confirmed: FAILED (STELLAR_TX_FAILED).'
    );
  });

  it('rejects an unresolved submitted response', () => {
    expect(() => assertConfirmedPayment(payment('SUBMITTED'))).toThrow(
      'Payment was not confirmed: SUBMITTED.'
    );
  });
});
