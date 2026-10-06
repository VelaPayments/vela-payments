import { NfcError } from '@/features/nfc/services/NfcService.types';
import { useNfcSessionStore } from '@/features/nfc/state/nfcSessionStore';

describe('nfcSessionStore', () => {
  beforeEach(() => {
    useNfcSessionStore.setState({
      status: 'idle',
      error: null,
      lastRequest: null,
      nfcActive: false,
    });
  });

  it('transitions idle → scanning with nfcActive', () => {
    useNfcSessionStore.getState().beginScanning();

    const state = useNfcSessionStore.getState();
    expect(state.status).toBe('scanning');
    expect(state.nfcActive).toBe(true);
  });

  it('transitions scanning → success and clears nfcActive', () => {
    useNfcSessionStore.getState().beginScanning();
    useNfcSessionStore.getState().setSuccess();

    const state = useNfcSessionStore.getState();
    expect(state.status).toBe('success');
    expect(state.nfcActive).toBe(false);
  });

  it('clears the active flag when a scan fails', () => {
    useNfcSessionStore.getState().beginScanning();
    useNfcSessionStore.getState().setError(new NfcError('UNSUPPORTED', 'scan failed'));

    expect(useNfcSessionStore.getState().status).toBe('error');
    expect(useNfcSessionStore.getState().nfcActive).toBe(false);
  });

  it('enforces one active session at a time', () => {
    useNfcSessionStore.getState().beginWriting();

    expect(() => useNfcSessionStore.getState().beginScanning()).toThrow(NfcError);
  });

  it('reset returns to idle', () => {
    useNfcSessionStore.getState().beginScanning();
    useNfcSessionStore.getState().setError(new NfcError('SESSION_TIMEOUT', 'timeout'));
    useNfcSessionStore.getState().reset();

    const state = useNfcSessionStore.getState();
    expect(state.status).toBe('idle');
    expect(state.nfcActive).toBe(false);
    expect(state.error).toBeNull();
  });

  it('clears the active flag when a session is cancelled', () => {
    useNfcSessionStore.getState().beginScanning();

    useNfcSessionStore.getState().reset();

    const state = useNfcSessionStore.getState();
    expect(state.status).toBe('idle');
    expect(state.nfcActive).toBe(false);
  });
});
