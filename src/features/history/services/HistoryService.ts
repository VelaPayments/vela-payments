import { Horizon } from '@stellar/stellar-sdk';

import { env } from '@/lib/env';
import { stellarTransactionUrl } from '@/lib/stellarExplorer';

const horizon = new Horizon.Server(env.horizonUrl);

export interface HistoryItem {
  id: string;
  hash: string;
  createdAt: string;
  direction: 'sent' | 'received';
  asset: string;
  assetIssuer: string | null;
  verifiedAsset: boolean;
  amount: string;
  counterparty: string;
  ledger: number;
  explorerUrl: string;
  serverIndexed?: boolean;
}

export function markServerIndexed(
  items: HistoryItem[],
  indexedHashes: ReadonlySet<string>
): HistoryItem[] {
  return items.map((item) => ({
    ...item,
    serverIndexed: indexedHashes.has(item.hash),
  }));
}

type PaymentRecord = Horizon.ServerApi.PaymentOperationRecord & {
  ledger?: number;
  ledger_attr?: number;
};

function assetDetails(operation: PaymentRecord): {
  asset: string;
  assetIssuer: string | null;
  verifiedAsset: boolean;
} {
  if (operation.asset_type === 'native') {
    return { asset: 'XLM', assetIssuer: null, verifiedAsset: true };
  }

  const verifiedAsset =
    operation.asset_code === 'USDC' && operation.asset_issuer === env.usdcIssuer;
  return {
    asset: verifiedAsset
      ? (operation.asset_code ?? 'UNKNOWN')
      : `${operation.asset_code ?? 'UNKNOWN'} (unverified issuer)`,
    assetIssuer: operation.asset_issuer ?? null,
    verifiedAsset,
  };
}

export const HistoryService = {
  async list(publicKey: string): Promise<HistoryItem[]> {
    const page = await horizon.payments().forAccount(publicKey).limit(50).order('desc').call();

    return page.records
      .filter((record): record is PaymentRecord => record.type === 'payment')
      .map((record) => {
        const sent = record.from === publicKey;
        const counterparty = sent ? record.to : record.from;
        const amount = sent ? `-${record.amount}` : `+${record.amount}`;
        const assetDetailsForRecord = assetDetails(record);
        return {
          id: record.id,
          hash: record.transaction_hash,
          createdAt: record.created_at,
          direction: sent ? 'sent' : 'received',
          ...assetDetailsForRecord,
          amount,
          counterparty,
          ledger: record.ledger ?? record.ledger_attr ?? 0,
          explorerUrl: stellarTransactionUrl(record.transaction_hash),
        };
      });
  },
};
