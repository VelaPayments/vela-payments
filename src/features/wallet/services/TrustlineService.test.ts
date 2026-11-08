import { Horizon, TransactionBuilder } from '@stellar/stellar-sdk';

import { SecureKeyStore } from '@/lib/SecureKeyStore';
import {
  ensureUsdcTrustline,
  hasSufficientReserveForTrustline,
  hasUsdcTrustline,
} from './TrustlineService';

jest.mock('@stellar/stellar-sdk', () => {
  class MockAsset {
    code: string;
    issuer?: string;
    constructor(code: string, issuer?: string) {
      this.code = code;
      this.issuer = issuer;
    }
  }

  const horizonServerInstance = {
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  };

  const transactionInstance = { sign: jest.fn() };

  class MockTransactionBuilder {
    addOperation() {
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return transactionInstance;
    }
  }

  return {
    Horizon: {
      Server: jest.fn(() => horizonServerInstance),
    },
    Asset: MockAsset,
    BASE_FEE: '100',
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({ publicKey: () => 'GPUB' }),
    },
    Operation: {
      changeTrust: jest.fn().mockReturnValue({}),
    },
    TransactionBuilder: MockTransactionBuilder,
    Networks: {
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      TESTNET: 'Test SDF Network ; September 2015',
    },
  };
});

jest.mock('@/lib/SecureKeyStore', () => ({
  SecureKeyStore: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const server = new Horizon.Server('https://horizon-testnet.stellar.org') as unknown as {
  loadAccount: jest.Mock;
  submitTransaction: jest.Mock;
};
const transaction = new TransactionBuilder({} as never).build() as unknown as { sign: jest.Mock };

describe('hasUsdcTrustline', () => {
  it('returns true when a matching USDC trustline exists', () => {
    const result = hasUsdcTrustline({
      balances: [
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER } as never,
      ],
    });
    expect(result).toBe(true);
  });

  it('returns false when no USDC trustline is present', () => {
    const result = hasUsdcTrustline({ balances: [{ asset_type: 'native' } as never] });
    expect(result).toBe(false);
  });
});

describe('hasSufficientReserveForTrustline', () => {
  it('allows a trustline when the balance comfortably covers the new reserve', () => {
    expect(hasSufficientReserveForTrustline(10, 0)).toBe(true);
  });

  it('rejects a trustline when the balance sits at the base reserve floor', () => {
    expect(hasSufficientReserveForTrustline(1, 0)).toBe(false);
  });

  it('accounts for existing subentries when computing the required reserve', () => {
    expect(hasSufficientReserveForTrustline(3.005, 3)).toBe(false);
    expect(hasSufficientReserveForTrustline(3.02, 3)).toBe(true);
  });
});

describe('ensureUsdcTrustline', () => {
  beforeEach(() => {
    server.loadAccount.mockReset();
    server.submitTransaction.mockReset();
    transaction.sign.mockReset();
    (SecureKeyStore.get as jest.Mock).mockReset();
  });

  it('is idempotent when a trustline already exists', async () => {
    server.loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER }],
      subentry_count: 1,
    });

    const result = await ensureUsdcTrustline('GPUB');

    expect(result).toEqual({ status: 'already_trusted' });
    expect(server.submitTransaction).not.toHaveBeenCalled();
  });

  it('returns a safe error when account lookup fails', async () => {
    server.loadAccount.mockRejectedValueOnce(new Error('private Horizon details'));

    const result = await ensureUsdcTrustline('GPUB');

    expect(result.status).toBe('error');
    expect(result.message).toBeTruthy();
    expect(result.message).not.toContain('private Horizon details');
  });

  it('surfaces a user-safe error when the reserve is insufficient, without touching the secret key', async () => {
    server.loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '1.0000000' }],
      subentry_count: 0,
    });

    const result = await ensureUsdcTrustline('GPUB');

    expect(result.status).toBe('insufficient_reserve');
    expect(result.message).toBeTruthy();
    expect(SecureKeyStore.get).not.toHaveBeenCalled();
  });

  it('creates the trustline when funds are sufficient', async () => {
    server.loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
      subentry_count: 0,
    });
    (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce('SFAKESECRET');
    server.submitTransaction.mockResolvedValueOnce({});

    const result = await ensureUsdcTrustline('GPUB');

    expect(result).toEqual({ status: 'created' });
    expect(transaction.sign).toHaveBeenCalled();
    expect(server.submitTransaction).toHaveBeenCalled();
  });

  it('returns a user-safe error when no secret key is stored on this device', async () => {
    server.loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
      subentry_count: 0,
    });
    (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce(null);

    const result = await ensureUsdcTrustline('GPUB');

    expect(result.status).toBe('error');
    expect(server.submitTransaction).not.toHaveBeenCalled();
  });

  it('returns a user-safe error when submission fails', async () => {
    server.loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
      subentry_count: 0,
    });
    (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce('SFAKESECRET');
    server.submitTransaction.mockRejectedValueOnce(new Error('tx_failed'));

    const result = await ensureUsdcTrustline('GPUB');

    expect(result.status).toBe('error');
  });
});
