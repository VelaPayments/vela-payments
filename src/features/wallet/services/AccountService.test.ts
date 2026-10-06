import { Horizon, NotFoundError } from '@stellar/stellar-sdk';

import { SecureKeyStore } from '@/lib/SecureKeyStore';
import { env } from '@/lib/env';
import { AccountService } from './AccountService';

jest.mock('@stellar/stellar-sdk', () => {
  class NotFoundError extends Error {}

  const friendbotCall = jest.fn();
  const horizonServerInstance = {
    loadAccount: jest.fn(),
    friendbot: jest.fn(() => ({ call: friendbotCall })),
  };

  return {
    Horizon: {
      Server: jest.fn(() => horizonServerInstance),
    },
    Keypair: {
      random: jest.fn().mockReturnValue({
        publicKey: () => 'GFAKEPUBLICKEY0000000000000000000000000000000000000000',
        secret: () => 'SFAKESECRETKEY00000000000000000000000000000000000000000',
      }),
    },
    NotFoundError,
    Networks: {
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      TESTNET: 'Test SDF Network ; September 2015',
    },
  };
});

jest.mock('@/lib/SecureKeyStore', () => ({
  SecureKeyStore: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

const server = new Horizon.Server('https://horizon-testnet.stellar.org') as unknown as {
  loadAccount: jest.Mock;
  friendbot: (address: string) => { call: jest.Mock };
};
const friendbotCall = server.friendbot('GPUB').call;

describe('AccountService.getOrCreateKeypair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the existing public key without generating a new one', async () => {
    (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce('GEXISTINGPUBLICKEY');

    const result = await AccountService.getOrCreateKeypair();

    expect(result).toEqual({ publicKey: 'GEXISTINGPUBLICKEY', isNew: false });
    expect(SecureKeyStore.set).not.toHaveBeenCalled();
  });

  it('generates and persists a new keypair when none exists', async () => {
    (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce(null);

    const result = await AccountService.getOrCreateKeypair();

    expect(result.isNew).toBe(true);
    expect(SecureKeyStore.set).toHaveBeenCalledWith(
      'ding.wallet.stellar.secretKey',
      expect.any(String)
    );
    expect(SecureKeyStore.set).toHaveBeenCalledWith(
      'ding.wallet.stellar.publicKey',
      expect.any(String)
    );
  });

  it('does not persist a keypair when key generation fails', async () => {
    (SecureKeyStore.get as jest.Mock).mockResolvedValueOnce(null);
    const { Keypair } = jest.requireMock('@stellar/stellar-sdk') as {
      Keypair: { random: jest.Mock };
    };
    Keypair.random.mockImplementationOnce(() => {
      throw new Error('key generation failed');
    });

    await expect(AccountService.getOrCreateKeypair()).rejects.toThrow('key generation failed');
    expect(SecureKeyStore.set).not.toHaveBeenCalled();
  });
});

describe('AccountService.accountExistsOnNetwork', () => {
  beforeEach(() => {
    server.loadAccount.mockReset();
  });

  it('returns true when the account loads successfully', async () => {
    server.loadAccount.mockResolvedValueOnce({});
    await expect(AccountService.accountExistsOnNetwork('GPUB')).resolves.toBe(true);
  });

  it('returns false when the account is not found', async () => {
    server.loadAccount.mockRejectedValueOnce(new NotFoundError('not found', {}));
    await expect(AccountService.accountExistsOnNetwork('GPUB')).resolves.toBe(false);
  });

  it('rethrows unexpected errors', async () => {
    server.loadAccount.mockRejectedValueOnce(new Error('network down'));
    await expect(AccountService.accountExistsOnNetwork('GPUB')).rejects.toThrow('network down');
  });
});

describe('AccountService.fundTestnetAccount', () => {
  const originalNetwork = env.stellarNetwork;

  beforeEach(() => {
    friendbotCall.mockReset();
    (env as { stellarNetwork: string }).stellarNetwork = 'testnet';
  });

  afterAll(() => {
    (env as { stellarNetwork: string }).stellarNetwork = originalNetwork;
  });

  it('funds a fresh account successfully', async () => {
    friendbotCall.mockResolvedValueOnce({});
    const result = await AccountService.fundTestnetAccount('GPUB');
    expect(result).toEqual({ outcome: 'funded' });
  });

  it('treats an already-funded account as a non-error outcome', async () => {
    const error = Object.assign(new Error('Bad Request'), {
      response: { data: { detail: 'createAccountAlreadyExist(GPUB)' } },
    });
    friendbotCall.mockRejectedValueOnce(error);

    const result = await AccountService.fundTestnetAccount('GPUB');

    expect(result).toEqual({ outcome: 'already_funded' });
  });

  it('surfaces a user-safe error on a genuine funding failure', async () => {
    friendbotCall.mockRejectedValueOnce(new Error('network down'));

    const result = await AccountService.fundTestnetAccount('GPUB');

    expect(result.outcome).toBe('error');
    expect(result.message).toBeTruthy();
  });

  it('refuses to fund on mainnet', async () => {
    (env as { stellarNetwork: string }).stellarNetwork = 'mainnet';

    const result = await AccountService.fundTestnetAccount('GPUB');

    expect(result.outcome).toBe('error');
    expect(friendbotCall).not.toHaveBeenCalled();
  });
});
