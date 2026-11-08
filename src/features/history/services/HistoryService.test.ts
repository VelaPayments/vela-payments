import { HistoryService, markServerIndexed } from './HistoryService';

const mockCall = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
  },
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      payments: () => ({
        forAccount: () => ({
          limit: () => ({
            order: () => ({ call: mockCall }),
          }),
        }),
      }),
    })),
  },
}));

describe('HistoryService', () => {
  beforeEach(() => mockCall.mockReset());

  it('marks the configured USDC issuer as verified', async () => {
    mockCall.mockResolvedValue({
      records: [
        {
          id: 'op-1',
          type: 'payment',
          from: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          to: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          amount: '2.50',
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          transaction_hash: 'hash-1',
          created_at: '2026-11-07T12:00:00Z',
          ledger: 123,
        },
      ],
    });

    const [item] = await HistoryService.list(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );

    expect(item).toMatchObject({
      asset: 'USDC',
      verifiedAsset: true,
      assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    });
  });

  it('does not treat a same-code asset from another issuer as USDC', async () => {
    mockCall.mockResolvedValue({
      records: [
        {
          id: 'op-2',
          type: 'payment',
          from: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          amount: '1',
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          transaction_hash: 'hash-2',
          created_at: '2026-11-07T12:01:00Z',
          ledger: 124,
        },
      ],
    });

    const [item] = await HistoryService.list(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );

    expect(item.asset).toBe('USDC (unverified issuer)');
    expect(item.verifiedAsset).toBe(false);
  });

  it('marks only Horizon records present in the Vela confirmation index', () => {
    const items = [
      {
        id: 'op-1',
        hash: 'hash-1',
        createdAt: '2026-11-07T12:00:00Z',
        direction: 'sent' as const,
        asset: 'XLM',
        assetIssuer: null,
        verifiedAsset: true,
        amount: '-1',
        counterparty: 'GDESTINATION',
        ledger: 123,
        explorerUrl: 'https://stellar.expert/explorer/testnet/tx/hash-1',
      },
      {
        id: 'op-2',
        hash: 'hash-2',
        createdAt: '2026-11-07T12:01:00Z',
        direction: 'received' as const,
        asset: 'XLM',
        assetIssuer: null,
        verifiedAsset: true,
        amount: '+2',
        counterparty: 'GSENDER',
        ledger: 124,
        explorerUrl: 'https://stellar.expert/explorer/testnet/tx/hash-2',
      },
    ];

    expect(markServerIndexed(items, new Set(['hash-2']))).toEqual([
      expect.objectContaining({ hash: 'hash-1', serverIndexed: false }),
      expect.objectContaining({ hash: 'hash-2', serverIndexed: true }),
    ]);
  });
});
