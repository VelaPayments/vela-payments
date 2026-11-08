import { Horizon } from '@stellar/stellar-sdk';

import { env } from '@/lib/env';
import { STELLAR_ASSETS } from '@/features/wallet/constants/assets';
import { ensureStellarPolyfills } from './stellarPolyfills';

ensureStellarPolyfills();

const server = new Horizon.Server(env.horizonUrl);

export interface WalletBalances {
  xlm: string;
  usdc: string | null;
  hasUsdcTrustline: boolean;
}

const ASSET_DECIMAL_SCALE = 10n ** 7n;

function toAssetUnits(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,7})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * ASSET_DECIMAL_SCALE + BigInt(fraction.padEnd(7, '0'));
}

/**
 * Performs an obvious balance check before a payment is authorized. Horizon
 * remains authoritative for reserves, fees, and final transaction validity.
 */
export function hasSufficientAssetBalance(
  balances: WalletBalances,
  asset: 'XLM' | 'USDC',
  amount: string
): boolean {
  const available = toAssetUnits(asset === 'XLM' ? balances.xlm : (balances.usdc ?? ''));
  const requested = toAssetUnits(amount);
  return available !== null && requested !== null && available >= requested;
}

type AccountBalances = Pick<Horizon.AccountResponse, 'balances'>;

export function parseBalances(account: AccountBalances): WalletBalances {
  let xlm = '0';
  let usdc: string | null = null;
  let hasUsdcTrustline = false;

  for (const line of account.balances) {
    if (line.asset_type === 'native') {
      xlm = line.balance;
      continue;
    }

    if (
      'asset_code' in line &&
      line.asset_code === STELLAR_ASSETS.USDC.code &&
      line.asset_issuer === STELLAR_ASSETS.USDC.issuer
    ) {
      usdc = line.balance;
      hasUsdcTrustline = true;
    }
  }

  return { xlm, usdc, hasUsdcTrustline };
}

export async function fetchBalances(publicKey: string): Promise<WalletBalances> {
  const account = await server.loadAccount(publicKey);
  return parseBalances(account);
}

export const BalanceService = {
  parseBalances,
  fetchBalances,
  hasSufficientAssetBalance,
};
