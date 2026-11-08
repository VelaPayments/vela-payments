import { env } from '@/lib/env';

export type PublicKeyCredentialRequestOptionsJSON = Record<string, unknown>;
export type AuthenticationResponseJSON = Record<string, unknown>;

export type PaymentStatus = 'CREATED' | 'AUTHORIZED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';

export interface PaymentResponse {
  id: string;
  status: PaymentStatus;
  paymentRequestId: string | null;
  recipient: string;
  senderPublicKey: string;
  asset: 'XLM' | 'USDC';
  network: 'TESTNET' | 'MAINNET';
  amount: string;
  memo: string | null;
  expiresAt: string | null;
  stellarTxHash: string | null;
  failureCode: string | null;
  unsignedXdr?: string;
}

/** A successful HTTP response is not proof of settlement; require the state transition. */
export function assertConfirmedPayment(payment: PaymentResponse): PaymentResponse {
  if (payment.status !== 'CONFIRMED') {
    const detail = payment.failureCode ? ` (${payment.failureCode})` : '';
    throw new Error(`Payment was not confirmed: ${payment.status}${detail}.`);
  }

  return payment;
}

export interface PaymentRequestResponse {
  id: string;
  status: string;
  externalRequestId: string | null;
  network: 'TESTNET' | 'MAINNET';
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
  stellarTxHash: string | null;
  recipient: string;
  asset: 'XLM' | 'USDC';
  amount: string;
  expiresAt: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  supabaseUserId: string;
  email: string;
  displayName: string | null;
  wallets: {
    id: string;
    stellarPublicKey: string;
    network: 'TESTNET' | 'MAINNET';
    isPrimary: boolean;
    label: string | null;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface ServerTransaction {
  id: string;
  direction: 'SENT' | 'RECEIVED';
  stellarTxHash: string;
  counterparty: string;
  asset: 'XLM' | 'USDC';
  amount: string;
  memo: string | null;
  network: 'TESTNET' | 'MAINNET';
  ledger: number | null;
  createdAt: string;
  explorerUrl: string;
}

export interface TransactionHistoryResponse {
  data: ServerTransaction[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface TransactionSimulationResponse {
  simulation: Record<string, unknown>;
}

export interface TransactionHistoryQuery {
  page?: number;
  limit?: number;
  asset?: 'XLM' | 'USDC';
  direction?: 'SENT' | 'RECEIVED';
  from?: string;
  to?: string;
}

export interface PaymentApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
}

export class PaymentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'PaymentApiError';
  }
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as T | PaymentApiErrorBody;
  if (!response.ok) {
    const error = body as PaymentApiErrorBody;
    const message = Array.isArray(error.message) ? error.message.join('; ') : error.message;
    throw new PaymentApiError(
      message ?? `Payment API request failed (${response.status}).`,
      response.status,
      error.code
    );
  }
  return body as T;
}

export const PaymentApiClient = {
  getProfile(token: string) {
    return call<UserProfile>('/users/me', token);
  },

  linkWallet(
    token: string,
    stellarPublicKey: string,
    network: 'TESTNET' | 'MAINNET',
    label?: string
  ) {
    return call<UserProfile>('/users/me/wallet', token, {
      method: 'POST',
      body: JSON.stringify({ stellarPublicKey, network, ...(label ? { label } : {}) }),
    });
  },

  createPaymentRequest(
    token: string,
    request: {
      recipient: string;
      asset: 'XLM' | 'USDC';
      amount: string;
      timestamp: number;
      expiresAt: number;
      requestId: string;
      memo?: string;
    }
  ) {
    return call<PaymentRequestResponse>('/payment-requests', token, {
      method: 'POST',
      body: JSON.stringify({
        type: 'payment-request',
        version: 1,
        recipient: request.recipient,
        asset: request.asset,
        amount: request.amount,
        timestamp: new Date(request.timestamp * 1000).toISOString(),
        expiresAt: new Date(request.expiresAt * 1000).toISOString(),
        requestId: request.requestId,
        ...(request.memo ? { memo: request.memo } : {}),
      }),
    });
  },

  getPaymentRequest(token: string, requestId: string) {
    return call<PaymentRequestResponse>(
      `/payment-requests/external/${encodeURIComponent(requestId)}`,
      token
    );
  },

  createPayment(
    token: string,
    request: { senderPublicKey: string; paymentRequestId?: string; requestId?: string }
  ) {
    return call<PaymentResponse>('/payments', token, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  getAuthenticationOptions(token: string, paymentId: string) {
    return call<PublicKeyCredentialRequestOptionsJSON>('/webauthn/authenticate/options', token, {
      method: 'POST',
      body: JSON.stringify({ paymentId }),
    });
  },

  authorizePayment(token: string, paymentId: string, assertion: AuthenticationResponseJSON) {
    return call<{ id: string; status: 'AUTHORIZED'; authorizedAt: string | null }>(
      `/payments/${paymentId}/authorize`,
      token,
      { method: 'POST', body: JSON.stringify(assertion) }
    );
  },

  submitPayment(token: string, paymentId: string, signedXdr: string) {
    return call<PaymentResponse>(`/payments/${paymentId}/submit`, token, {
      method: 'POST',
      body: JSON.stringify({ signedXdr }),
    });
  },

  getPayment(token: string, paymentId: string) {
    return call<PaymentResponse>(`/payments/${paymentId}`, token);
  },

  simulateTransaction(token: string, transactionXdr: string) {
    return call<TransactionSimulationResponse>('/transactions/simulate', token, {
      method: 'POST',
      body: JSON.stringify({ transactionXdr }),
    });
  },

  getTransactionHistory(token: string, query: TransactionHistoryQuery = {}) {
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      limit: String(query.limit ?? 20),
    });
    if (query.asset) params.set('asset', query.asset);
    if (query.direction) params.set('direction', query.direction);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return call<TransactionHistoryResponse>(`/transactions?${params.toString()}`, token);
  },
};
