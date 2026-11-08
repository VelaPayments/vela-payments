import { useEffect, useRef, useState } from 'react';
import { isNfcAvailable, NfcReader } from '@/features/nfc/services/NfcReader';
import { NfcErrorCode } from '@/features/nfc/services/nfcErrors';

type Status = 'idle' | 'reading' | 'writing' | 'error';

export function useNfc() {
  const readerRef = useRef<NfcReader | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [lastError, setLastError] = useState<any>(null);

  useEffect(() => {
    readerRef.current = new NfcReader();
    return () => {
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  }, []);

  const startReading = async (opts?: { timeoutMs?: number }) => {
    if (!isNfcAvailable()) {
      const err = { code: NfcErrorCode.UNAVAILABLE };
      setLastError(err);
      setStatus('error');
      return Promise.reject(err);
    }
    setStatus('reading');
    try {
      const payload = await readerRef.current!.startRead(opts?.timeoutMs);
      // analytics: success
      // trackEvent(AnalyticsEvents.NFC_READ_SUCCESS, { code: 'ok' })
      setStatus('idle');
      return payload;
    } catch (e) {
      setLastError(e);
      setStatus('error');
      return Promise.reject(e);
    }
  };

  const startWriting = async (payload: any, opts?: { timeoutMs?: number }) => {
    if (!isNfcAvailable()) {
      const err = { code: NfcErrorCode.UNAVAILABLE };
      setLastError(err);
      setStatus('error');
      return Promise.reject(err);
    }
    setStatus('writing');
    try {
      await readerRef.current!.startWrite(payload, opts?.timeoutMs);
      // analytics: success
      setStatus('idle');
      return true;
    } catch (e) {
      setLastError(e);
      setStatus('error');
      return Promise.reject(e);
    }
  };

  const cancel = () => {
    readerRef.current?.cancel();
    setStatus('idle');
  };

  return {
    status,
    lastError,
    startReading,
    startWriting,
    cancel,
    isAvailable: isNfcAvailable,
  } as const;
}

export default useNfc;
