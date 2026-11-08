import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useReceivePayment } from '@/features/receive/hooks/useReceivePayment';

const VALID_RECIPIENT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const FIXED_REQUEST = {
  type: 'payment_request' as const,
  recipient: VALID_RECIPIENT,
  asset: 'XLM',
  amount: '5',
  timestamp: 1_000,
  expiresAt: 1_300,
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockNfcStatus: 'idle' | 'scanning' | 'writing' | 'success' | 'error' = 'idle';
const mockNfcStartWriting = jest.fn(async () => {
  mockNfcStatus = 'writing';
});
const mockNfcCancel = jest.fn(async () => {
  mockNfcStatus = 'idle';
});

jest.mock('@/features/nfc/hooks/useNfcWriter', () => ({
  useNfcWriter: () => ({
    status: mockNfcStatus,
    error: null,
    startWriting: mockNfcStartWriting,
    cancel: mockNfcCancel,
  }),
}));

const mockCancelExpiryTimer = jest.fn();
const mockStartRequestExpiry = jest.fn(() => mockCancelExpiryTimer);
const mockStartWaitTimeout = jest.fn(() => jest.fn());
const mockCancelAll = jest.fn();

jest.mock('@/features/receive/services/receiveSession', () => ({
  receiveSession: {
    startRequestExpiry: (...args: unknown[]) =>
      (mockStartRequestExpiry as (...a: unknown[]) => () => void)(...args),
    startWaitTimeout: (...args: unknown[]) =>
      (mockStartWaitTimeout as (...a: unknown[]) => () => void)(...args),
    cancelAll: () => mockCancelAll(),
  },
}));

const mockBuild = jest.fn(() => FIXED_REQUEST);
jest.mock('@/features/receive/services/PaymentRequestBuilder', () => ({
  paymentRequestBuilder: {
    build: (...args: unknown[]) =>
      (mockBuild as (...a: unknown[]) => typeof FIXED_REQUEST)(...args),
  },
}));

const mockCheckUsdcTrustline = jest.fn(async () => ({ hasLine: true, sufficientReserve: true }));
jest.mock('@/features/wallet/services/TrustlineService', () => ({
  trustlineService: {
    checkUsdcTrustline: (...args: unknown[]) =>
      (mockCheckUsdcTrustline as (...a: unknown[]) => Promise<unknown>)(...args),
  },
}));

const mockTrackEvent = jest.fn();
jest.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => (mockTrackEvent as (...a: unknown[]) => void)(...args),
}));

// ─── Minimal renderHook harness (no @testing-library/react-native installed) ──

function renderHookHarness<T>(callback: () => T) {
  const result: { current: T } = { current: undefined as unknown as T };

  function TestComponent() {
    result.current = callback();
    return null;
  }

  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(TestComponent));
  });

  return {
    result,
    rerender: () => act(() => renderer.update(createElement(TestComponent))),
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useReceivePayment', () => {
  beforeEach(() => {
    mockNfcStatus = 'idle';
    jest.clearAllMocks();
    mockBuild.mockReturnValue(FIXED_REQUEST);
    mockCheckUsdcTrustline.mockResolvedValue({ hasLine: true, sufficientReserve: true });
    mockStartRequestExpiry.mockReturnValue(mockCancelExpiryTimer);
  });

  it('transitions idle -> preparing -> broadcasting -> waiting -> success', async () => {
    const { result, rerender } = renderHookHarness(() => useReceivePayment());

    expect(result.current.state).toBe('idle');

    await act(async () => {
      await result.current.prepare('5', 'XLM', VALID_RECIPIENT);
    });
    expect(result.current.state).toBe('preparing');
    expect(result.current.paymentRequest).toEqual(FIXED_REQUEST);

    await act(async () => {
      await result.current.startBroadcast();
    });
    expect(mockNfcStartWriting).toHaveBeenCalledWith(FIXED_REQUEST);

    // The NFC mock flips status to 'writing' synchronously and stays there
    // until we simulate a successful delivery below.
    mockNfcStatus = 'success';
    rerender();
    expect(result.current.state).toBe('waiting');

    act(() => {
      result.current.confirmSuccess('abc123');
    });
    expect(result.current.state).toBe('success');
    expect(result.current.txHash).toBe('abc123');
  });

  it('cancels from the broadcasting state', async () => {
    const { result } = renderHookHarness(() => useReceivePayment());

    await act(async () => {
      await result.current.prepare('5', 'XLM', VALID_RECIPIENT);
    });
    await act(async () => {
      await result.current.startBroadcast();
    });
    expect(result.current.state).toBe('broadcasting');

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.state).toBe('cancelled');
    expect(mockNfcCancel).toHaveBeenCalled();
    expect(mockCancelAll).toHaveBeenCalled();
  });

  it('moves to failed with the given reason on the timeout path', async () => {
    const { result } = renderHookHarness(() => useReceivePayment());

    await act(async () => {
      await result.current.prepare('5', 'XLM', VALID_RECIPIENT);
    });
    await act(async () => {
      await result.current.startBroadcast();
    });

    act(() => {
      result.current.confirmFailure('timeout');
    });

    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBe('timeout');
  });

  it('fails preparation with trustline_missing when the USDC trustline check fails', async () => {
    mockCheckUsdcTrustline.mockResolvedValueOnce({ hasLine: false, sufficientReserve: false });
    const { result } = renderHookHarness(() => useReceivePayment());

    await act(async () => {
      await expect(result.current.prepare('5', 'USDC', VALID_RECIPIENT)).rejects.toThrow(
        'trustline_missing'
      );
    });

    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBe('trustline_missing');
  });
});
