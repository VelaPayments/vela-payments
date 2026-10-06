import { Horizon } from '@stellar/stellar-sdk';

import { fetchBalances, parseBalances } from './BalanceService';

jest.mock('@stellar/stellar-sdk', () => {
  const horizonServerInstance = {
    loadAccount: jest.fn(),
  };

  return {
    Horizon: {
      Server: jest.fn(() => horizonServerInstance),
    },
    Networks: {
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      TESTNET: 'Test SDF Network ; September 2015',
    },
  };
});

const USDC_ISSUER = 'GBBD47IF6LWK7P7MUGHC2XLYUUXV6ZLW75PN7CHLIW2NSIW74UZEST66';
const server = new Horizon.Server('https://horizon-testnet.stellar.org') as unknown as {
  loadAccount: jest.Mock;
};

describe('parseBalances', () => {
  it('extracts the native XLM balance', () => {
    const result = parseBalances({
      balances: [{ asset_type: 'native', balance: '123.4567890' } as never],
    });

    expect(result.xlm).toBe('123.4567890');
    expect(result.usdc).toBeNull();
    expect(result.hasUsdcTrustline).toBe(false);
  });

  it('extracts the USDC balance when it matches the configured issuer', () => {
    const result = parseBalances({
      balances: [
        { asset_type: 'native', balance: '50.0000000' } as never,
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: USDC_ISSUER,
          balance: '10.0000000',
        } as never,
      ],
    });

    expect(result.usdc).toBe('10.0000000');
    expect(result.hasUsdcTrustline).toBe(true);
  });

  it('ignores credit lines from an issuer other than the configured USDC issuer', () => {
    const result = parseBalances({
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GDIFFERENTISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          balance: '5.0000000',
        } as never,
      ],
    });

    expect(result.usdc).toBeNull();
    expect(result.hasUsdcTrustline).toBe(false);
  });

  it('defaults the XLM balance to 0 when no native line is present', () => {
    const result = parseBalances({ balances: [] });
    expect(result.xlm).toBe('0');
  });

  it('returns zero balances when the account has no balance entries', () => {
    expect(parseBalances({ balances: [] })).toEqual({
      xlm: '0',
      usdc: null,
      hasUsdcTrustline: false,
    });
  });

  it('does not treat an issued XLM credit asset as native XLM', () => {
    const result = parseBalances({
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'XLM',
          asset_issuer: USDC_ISSUER,
          balance: '9.0000000',
          limit: '1000.0000000',
          buying_liabilities: '0.0000000',
          selling_liabilities: '0.0000000',
          last_modified_ledger: 1,
          is_authorized: true,
          is_authorized_to_maintain_liabilities: true,
          is_clawback_enabled: false,
        },
      ],
    });

    expect(result.xlm).toBe('0');
  });
});

describe('fetchBalances', () => {
  beforeEach(() => {
    server.loadAccount.mockReset();
  });

  it('loads the account from Horizon and parses its balances', async () => {
    server.loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '5.0000000' }],
    });

    const result = await fetchBalances('GPUBLICKEY');

    expect(server.loadAccount).toHaveBeenCalledWith('GPUBLICKEY');
    expect(result.xlm).toBe('5.0000000');
  });

  it('propagates a Horizon account-loading error', async () => {
    server.loadAccount.mockRejectedValueOnce(new Error('Horizon unavailable'));

    await expect(fetchBalances('GPUBLICKEY')).rejects.toThrow('Horizon unavailable');
  });
});
