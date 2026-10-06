import { useWalletStore } from './walletStore';

describe('walletStore', () => {
  beforeEach(() => {
    useWalletStore.getState().reset();
  });

  it('starts idle with no wallet data', () => {
    const state = useWalletStore.getState();
    expect(state.status).toBe('idle');
    expect(state.publicKey).toBeNull();
    expect(state.balances).toBeNull();
    expect(state.error).toBeNull();
    expect(state.hasHydrated).toBe(false);
  });

  it('setPublicKey stores the public key', () => {
    useWalletStore.getState().setPublicKey('GPUB');
    expect(useWalletStore.getState().publicKey).toBe('GPUB');
  });

  it('setStatus transitions the status', () => {
    useWalletStore.getState().setStatus('creating');
    expect(useWalletStore.getState().status).toBe('creating');
  });

  it('setBalances stores the balances object', () => {
    const balances = { xlm: '10', usdc: '5', hasUsdcTrustline: true };
    useWalletStore.getState().setBalances(balances);
    expect(useWalletStore.getState().balances).toEqual(balances);
  });

  it('stores an empty wallet balance state', () => {
    const balances = { xlm: '0', usdc: null, hasUsdcTrustline: false };
    useWalletStore.getState().setBalances(balances);

    expect(useWalletStore.getState().balances).toEqual(balances);
  });

  it('setError stores and clears the error message', () => {
    useWalletStore.getState().setError('boom');
    expect(useWalletStore.getState().error).toBe('boom');

    useWalletStore.getState().setError(null);
    expect(useWalletStore.getState().error).toBeNull();
  });

  it('sets an empty error value to clear the current error', () => {
    useWalletStore.getState().setError('previous error');
    useWalletStore.getState().setError('');

    expect(useWalletStore.getState().error).toBeNull();
  });

  it('setHydrated flips hasHydrated to true', () => {
    useWalletStore.getState().setHydrated();
    expect(useWalletStore.getState().hasHydrated).toBe(true);
  });

  it('reset restores the initial state', () => {
    useWalletStore.getState().setStatus('ready');
    useWalletStore.getState().setPublicKey('GPUB');
    useWalletStore.getState().setBalances({ xlm: '1', usdc: null, hasUsdcTrustline: false });
    useWalletStore.getState().setError('boom');
    useWalletStore.getState().setHydrated();

    useWalletStore.getState().reset();

    const state = useWalletStore.getState();
    expect(state.status).toBe('idle');
    expect(state.publicKey).toBeNull();
    expect(state.balances).toBeNull();
    expect(state.error).toBeNull();
    expect(state.hasHydrated).toBe(false);
  });
});
