import { Horizon, Keypair, NotFoundError, TransactionBuilder } from '@stellar/stellar-sdk';

import { env } from '@/lib/env';
import { SecureKeyStore } from '@/lib/SecureKeyStore';
import { SECURE_KEYS } from '@/lib/SecureKeyStore.types';
import { ensureStellarPolyfills } from './stellarPolyfills';

ensureStellarPolyfills();

const server = new Horizon.Server(env.horizonUrl);

export interface WalletKeypair {
  publicKey: string;
  isNew: boolean;
}

export type FundingOutcome = 'funded' | 'already_funded' | 'error';

export interface FundingResult {
  outcome: FundingOutcome;
  message?: string;
}

export interface ExpectedPaymentTransaction {
  sourcePublicKey: string;
  destination: string;
  asset: 'XLM' | 'USDC';
  amount: string;
  memo?: string | null;
}

function isAccountAlreadyFundedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const data = (error as { response?: { data?: Record<string, unknown> } }).response?.data;
  if (!data) return false;

  const detail = typeof data.detail === 'string' ? data.detail : '';
  const operations = (data.extras as { result_codes?: { operations?: string[] } } | undefined)
    ?.result_codes?.operations;

  return (
    detail.includes('createAccountAlreadyExist') ||
    Boolean(operations?.includes('op_already_exists'))
  );
}

export const AccountService = {
  async getOrCreateKeypair(): Promise<WalletKeypair> {
    const existingPublicKey = await SecureKeyStore.get(SECURE_KEYS.WALLET_STELLAR_PUBLIC_KEY);
    if (existingPublicKey) {
      return { publicKey: existingPublicKey, isNew: false };
    }

    const keypair = Keypair.random();
    await SecureKeyStore.set(SECURE_KEYS.WALLET_STELLAR_SECRET_KEY, keypair.secret());
    await SecureKeyStore.set(SECURE_KEYS.WALLET_STELLAR_PUBLIC_KEY, keypair.publicKey());

    return { publicKey: keypair.publicKey(), isNew: true };
  },

  async accountExistsOnNetwork(publicKey: string): Promise<boolean> {
    try {
      await server.loadAccount(publicKey);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }
      throw error;
    }
  },

  async fundTestnetAccount(publicKey: string): Promise<FundingResult> {
    if (env.stellarNetwork !== 'testnet') {
      return {
        outcome: 'error',
        message: 'La financiación automática solo está disponible en testnet.',
      };
    }

    try {
      await server.friendbot(publicKey).call();
      return { outcome: 'funded' };
    } catch (error) {
      if (isAccountAlreadyFundedError(error)) {
        return { outcome: 'already_funded' };
      }

      return {
        outcome: 'error',
        message: 'No se pudo financiar la cuenta de prueba en testnet. Inténtalo de nuevo.',
      };
    }
  },

  validatePaymentTransaction(unsignedXdr: string, expected: ExpectedPaymentTransaction): void {
    const parsed = TransactionBuilder.fromXDR(unsignedXdr, env.networkPassphrase);
    if (!('operations' in parsed)) {
      throw new Error('Fee-bump payment envelopes are not supported.');
    }

    const transaction = parsed as typeof parsed & {
      source: string;
      operations: {
        type?: string;
        destination?: string;
        amount?: string;
        asset?: {
          isNative(): boolean;
          getCode(): string;
          getIssuer(): string;
        };
      }[];
      memo?: { type?: string; value?: { toString(): string } };
    };
    if (transaction.source !== expected.sourcePublicKey) {
      throw new Error('Payment source does not match the linked wallet.');
    }
    if (transaction.operations.length !== 1) {
      throw new Error('Payment transaction must contain exactly one operation.');
    }

    const actualMemo =
      transaction.memo?.type === 'text' ? (transaction.memo.value?.toString() ?? null) : null;
    if ((expected.memo ?? null) !== actualMemo) {
      throw new Error('Payment memo does not match the request.');
    }

    const operation = transaction.operations[0];
    const stellarAsset = operation.asset;
    const assetMatches =
      expected.asset === 'XLM'
        ? stellarAsset?.isNative() === true
        : stellarAsset !== undefined &&
          !stellarAsset.isNative() &&
          stellarAsset.getCode() === 'USDC' &&
          stellarAsset.getIssuer() === env.usdcIssuer;
    if (
      operation.type !== 'payment' ||
      operation.destination !== expected.destination ||
      operation.amount !== expected.amount ||
      !assetMatches
    ) {
      throw new Error('Unsigned payment does not match the payment intent.');
    }
  },

  async signPaymentTransaction(unsignedXdr: string): Promise<string> {
    const secret = await SecureKeyStore.get(SECURE_KEYS.WALLET_STELLAR_SECRET_KEY);
    if (!secret) throw new Error('Wallet signing key is unavailable.');
    const transaction = TransactionBuilder.fromXDR(unsignedXdr, env.networkPassphrase);
    if (!('operations' in transaction))
      throw new Error('Fee-bump payment envelopes are not supported.');
    transaction.sign(Keypair.fromSecret(secret));
    return transaction.toXDR();
  },
};
