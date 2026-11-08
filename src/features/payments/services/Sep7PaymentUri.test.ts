import { buildSep7PaymentUri, parseSep7PaymentUri } from './Sep7PaymentUri';

const DESTINATION = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const OTHER_ISSUER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('SEP-0007 payment URI adapter', () => {
  it('round-trips a native XLM payment', () => {
    const uri = buildSep7PaymentUri({
      destination: DESTINATION,
      amount: '2.50',
      memo: 'Coffee',
    });
    expect(parseSep7PaymentUri(uri)).toMatchObject({
      destination: DESTINATION,
      amount: '2.50',
      memo: 'Coffee',
    });
  });

  it('rejects unsupported assets', () => {
    expect(() =>
      parseSep7PaymentUri(`web+stellar:pay?destination=${DESTINATION}&asset_code=BTC`)
    ).toThrow();
  });

  it('round-trips USDC only with the configured issuer', () => {
    const uri = buildSep7PaymentUri({
      destination: DESTINATION,
      assetCode: 'USDC',
      assetIssuer: TESTNET_USDC_ISSUER,
      amount: '3.00',
    });

    expect(parseSep7PaymentUri(uri)).toMatchObject({
      assetCode: 'USDC',
      assetIssuer: TESTNET_USDC_ISSUER,
    });
  });

  it('rejects a same-code asset from another issuer', () => {
    expect(() =>
      parseSep7PaymentUri(
        `web+stellar:pay?destination=${DESTINATION}&asset_code=USDC&asset_issuer=${OTHER_ISSUER}`
      )
    ).toThrow('does not match the configured USDC issuer');
  });
});
