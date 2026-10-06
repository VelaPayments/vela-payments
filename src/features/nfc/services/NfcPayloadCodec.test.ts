import { MAX_NDEF_PAYLOAD_BYTES } from '@/features/nfc/constants/nfcConstants';
import { createPaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import {
  decodePaymentRequest,
  encodePaymentRequest,
} from '@/features/nfc/services/NfcPayloadCodec';
import { NfcError } from '@/features/nfc/services/NfcService.types';

const VALID_RECIPIENT = 'GBBD47IF6LWK7P7MUGHC2XLYUUXV6ZLW75PN7CHLIW2NSIW74UZEST66';

describe('NfcPayloadCodec', () => {
  const sampleRequest = createPaymentRequest({
    recipient: VALID_RECIPIENT,
    asset: 'USDC',
    amount: '10.50',
    timestamp: 1_740_000_000,
    expiresAt: 1_740_000_060,
  });

  it('roundtrips valid payment requests', () => {
    const encoded = encodePaymentRequest(sampleRequest);
    const decoded = decodePaymentRequest(encoded);

    expect(decoded).toEqual(sampleRequest);
  });

  it('uses the shared server payment-request.v1 wire format', () => {
    const fixture = require('../fixtures/payment-request.v1.json');
    const bytes = new TextEncoder().encode(JSON.stringify(fixture));
    const fixtureRequest = createPaymentRequest({
      recipient: fixture.recipient,
      asset: fixture.asset,
      amount: fixture.amount,
      timestamp: Date.parse(fixture.timestamp) / 1000,
      expiresAt: Date.parse(fixture.expiresAt) / 1000,
    });
    expect(decodePaymentRequest(bytes)).toEqual(fixtureRequest);
    expect(JSON.parse(new TextDecoder().decode(encodePaymentRequest(fixtureRequest)))).toEqual(
      fixture
    );
    const precise = {
      ...fixture,
      timestamp: '2026-05-29T12:00:00.123Z',
      expiresAt: '2026-05-29T12:15:00.456Z',
    };
    const decoded = decodePaymentRequest(new TextEncoder().encode(JSON.stringify(precise)));
    expect(JSON.parse(new TextDecoder().decode(encodePaymentRequest(decoded)))).toEqual(precise);
    for (const malformed of [
      { ...fixture, amount: '01.00' },
      { ...fixture, timestamp: '2026-02-30T12:00:00.000Z' },
      { ...fixture, memo: 'x'.repeat(281) },
      { ...fixture, requestId: '' },
    ]) {
      expect(() =>
        decodePaymentRequest(new TextEncoder().encode(JSON.stringify(malformed)))
      ).toThrow(NfcError);
    }
  });

  it('rejects invalid ISO timestamps and expired v1 requests', () => {
    const invalid = {
      type: 'payment-request',
      version: 1,
      recipient: VALID_RECIPIENT,
      asset: 'USDC',
      amount: '10',
      timestamp: 'not-a-date',
      expiresAt: '2025-02-01T00:00:00.000Z',
    };
    expect(() => decodePaymentRequest(new TextEncoder().encode(JSON.stringify(invalid)))).toThrow(
      NfcError
    );
    const fresh = {
      ...invalid,
      timestamp: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:15:00.000Z',
    };
    expect(() =>
      decodePaymentRequest(new TextEncoder().encode(JSON.stringify(fresh)), {
        rejectExpired: true,
        nowMs: Date.parse('2025-01-01T00:05:00.001Z'),
      })
    ).toThrow(/5 minutes/i);
    expect(() =>
      decodePaymentRequest(
        new TextEncoder().encode(
          JSON.stringify({ ...fresh, expiresAt: '2025-01-02T00:00:00.001Z' })
        )
      )
    ).toThrow(/24 hours/i);
    const expired = {
      ...invalid,
      timestamp: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:01:00.000Z',
    };
    expect(() =>
      decodePaymentRequest(new TextEncoder().encode(JSON.stringify(expired)), {
        rejectExpired: true,
        nowMs: Date.parse('2025-01-01T00:01:00.000Z'),
      })
    ).toThrow(/expired/i);
  });

  it('rejects malformed JSON payloads', () => {
    const bytes = new TextEncoder().encode('{not-json');

    expect(() => decodePaymentRequest(bytes)).toThrow(NfcError);
    expect(() => decodePaymentRequest(bytes)).toThrow(/valid JSON/i);
  });

  it('rejects oversize payloads', () => {
    const oversized = new Uint8Array(MAX_NDEF_PAYLOAD_BYTES + 1);

    expect(() => decodePaymentRequest(oversized)).toThrow(NfcError);
    expect(() => decodePaymentRequest(oversized)).toThrow(/exceeds/i);
  });

  it('rejects expired payloads when rejectExpired is enabled', () => {
    const encoded = encodePaymentRequest(sampleRequest);

    expect(() =>
      decodePaymentRequest(encoded, {
        rejectExpired: true,
        nowMs: sampleRequest.expiresAt * 1000 + 1,
      })
    ).toThrow(/expired/i);
  });
});
