export type NfcErrorCode =
  | 'UNSUPPORTED'
  | 'UNAVAILABLE'
  | 'DISABLED'
  | 'SESSION_ACTIVE'
  | 'SESSION_CANCELLED'
  | 'CANCELLED'
  | 'SESSION_TIMEOUT'
  | 'EMPTY_NDEF'
  | 'PAYLOAD_MALFORMED'
  | 'PAYLOAD_OVERSIZE'
  | 'PAYLOAD_INVALID'
  | 'PAYLOAD_EXPIRED'
  | 'NATIVE_ERROR';

export class NfcError extends Error {
  readonly code: NfcErrorCode;

  constructor(code: NfcErrorCode, message: string) {
    super(message);
    this.name = 'NfcError';
    this.code = code;
  }
}

export function toNfcError(error: unknown, fallbackCode: NfcErrorCode = 'NATIVE_ERROR'): NfcError {
  if (error instanceof NfcError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unknown NFC error';
  return new NfcError(fallbackCode, message);
}

export interface NfcReaderSessionOptions {
  onPayload: (payload: Uint8Array) => void;
  onError?: (error: NfcError) => void;
  alertMessage?: string;
}

export interface NfcWriterSessionOptions {
  onSuccess?: () => void;
  onError?: (error: NfcError) => void;
  alertMessage?: string;
}

export interface NfcService {
  isSupported(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cancelSession(): Promise<void>;
  startReaderSession(options: NfcReaderSessionOptions): Promise<void>;
  startWriterSession(payload: Uint8Array, options?: NfcWriterSessionOptions): Promise<void>;
}

export function createMockNfcService(overrides: Partial<NfcService> = {}): NfcService {
  return {
    isSupported: async () => true,
    isEnabled: async () => true,
    start: async () => undefined,
    stop: async () => undefined,
    cancelSession: async () => undefined,
    startReaderSession: async () => undefined,
    startWriterSession: async () => undefined,
    ...overrides,
  };
}
