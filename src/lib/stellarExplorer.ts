import { env } from './env';

export function stellarTransactionUrl(hash: string): string {
  const network = env.stellarNetwork === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(hash)}`;
}
