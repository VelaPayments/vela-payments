import { createPaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import { encodePaymentRequest } from '@/features/nfc/services/NfcPayloadCodec';
import { NfcReader } from '@/features/nfc/services/NfcReader';
import type {
  NfcService,
  NfcReaderSessionOptions,
  NfcWriterSessionOptions,
} from '@/features/nfc/services/NfcService.types';

const RECIPIENT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const mockNfcService: jest.Mocked<NfcService> = {
  isSupported: jest.fn(async () => true),
  isEnabled: jest.fn(async () => true),
  start: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  cancelSession: jest.fn(async () => undefined),
  startReaderSession: jest.fn(async (_options: NfcReaderSessionOptions) => undefined),
  startWriterSession: jest.fn(
    async (_payload: Uint8Array, _options?: NfcWriterSessionOptions) => undefined
  ),
};

jest.mock('@/features/nfc/services/nfcServiceImpl', () => ({
  get nfcService() {
    return mockNfcService;
  },
}));
jest.mock('@/features/nfc/services/nfcServiceImpl.native', () => ({
  get nfcService() {
    return mockNfcService;
  },
}));
jest.mock('@/features/nfc/services/NfcService.web', () => ({
  get nfcService() {
    return mockNfcService;
  },
}));
jest.mock('@/features/nfc/services/NfcService.native', () => ({
  get nfcService() {
    return mockNfcService;
  },
}));
jest.mock('@/features/nfc/services/NfcService', () => ({
  get nfcService() {
    return mockNfcService;
  },
}));

describe('NfcReader compatibility adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('decodes a real payment request from the native reader callback', async () => {
    let readerOptions: NfcReaderSessionOptions | undefined;
    mockNfcService.startReaderSession.mockImplementationOnce(
      async (options: NfcReaderSessionOptions) => {
        readerOptions = options;
      }
    );

    const request = createPaymentRequest({
      recipient: RECIPIENT,
      asset: 'XLM',
      amount: '2',
      ttlSeconds: 60,
    });
    const resultPromise = new NfcReader().startRead();

    await new Promise<void>((resolve) => setImmediate(resolve));
    readerOptions?.onPayload(encodePaymentRequest(request));

    await expect(resultPromise).resolves.toMatchObject({
      recipient: RECIPIENT,
      amount: '2',
      asset: 'XLM',
    });
  });

  it('writes the canonical encoded request through the native writer callback', async () => {
    let writtenPayload: Uint8Array | undefined;
    mockNfcService.startWriterSession.mockImplementationOnce(async (payload, options) => {
      writtenPayload = payload;
      options?.onSuccess?.();
    });

    const request = createPaymentRequest({
      recipient: RECIPIENT,
      asset: 'XLM',
      amount: '3',
      ttlSeconds: 60,
    });
    await new NfcReader().startWrite(request);

    expect(writtenPayload).toEqual(encodePaymentRequest(request));
  });
});
