import { env } from './env';
import { stellarTransactionUrl } from './stellarExplorer';

describe('stellarTransactionUrl', () => {
  const originalNetwork = env.stellarNetwork;

  afterEach(() => {
    (env as { stellarNetwork: string }).stellarNetwork = originalNetwork;
  });

  it('uses the testnet explorer for testnet hashes', () => {
    (env as { stellarNetwork: string }).stellarNetwork = 'testnet';
    expect(stellarTransactionUrl('abc/123')).toBe(
      'https://stellar.expert/explorer/testnet/tx/abc%2F123'
    );
  });

  it('uses the public explorer for mainnet hashes', () => {
    (env as { stellarNetwork: string }).stellarNetwork = 'mainnet';
    expect(stellarTransactionUrl('hash')).toBe('https://stellar.expert/explorer/public/tx/hash');
  });
});
