import { Platform } from 'react-native';
import NfcManager, { Ndef } from 'react-native-nfc-manager';

import { NFC_PAYMENT_MIME_TYPE } from '@/features/nfc/constants/nfcConstants';
import { createPaymentRequest } from '@/features/nfc/schemas/paymentRequest';
import { encodePaymentRequest } from '@/features/nfc/services/NfcPayloadCodec';
import { nfcService } from '@/features/nfc/services/NfcService.native';
import { NfcError } from '@/features/nfc/services/NfcService.types';
import { startWriterSession } from '@/features/nfc/services/NfcWriter';

const RECIPIENT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

type ListenerCallback = ((event?: unknown) => Promise<void> | void) | null;

interface MockNfcManagerShape {
  __listeners: Record<string, ListenerCallback>;
  isSupported: jest.Mock<Promise<boolean>, []>;
  isEnabled: jest.Mock<Promise<boolean>, []>;
  start: jest.Mock<Promise<void>, []>;
  registerTagEvent: jest.Mock<Promise<void>, [unknown?]>;
  unregisterTagEvent: jest.Mock<Promise<void>, []>;
  requestTechnology: jest.Mock<Promise<string>, [unknown, unknown?]>;
  cancelTechnologyRequest: jest.Mock<Promise<void>, [unknown?]>;
  setEventListener: jest.Mock<void, [string, ListenerCallback]>;
  ndefHandler: {
    writeNdefMessage?: jest.Mock<Promise<void>, [number[]]>;
  };
  setNdefPushMessage?: jest.Mock<Promise<void>, [number[] | null]>;
}

jest.mock('react-native-nfc-manager', () => {
  const listeners: Record<string, ListenerCallback> = {};
  const writeNdefMessage = jest.fn<Promise<void>, [number[]]>(async () => undefined);
  const manager: MockNfcManagerShape = {
    __listeners: listeners,
    isSupported: jest.fn<Promise<boolean>, []>(async () => true),
    isEnabled: jest.fn<Promise<boolean>, []>(async () => true),
    start: jest.fn<Promise<void>, []>(async () => undefined),
    registerTagEvent: jest.fn<Promise<void>, [unknown?]>(async () => undefined),
    unregisterTagEvent: jest.fn<Promise<void>, []>(async () => undefined),
    requestTechnology: jest.fn<Promise<string>, [unknown, unknown?]>(async () => 'Ndef'),
    cancelTechnologyRequest: jest.fn<Promise<void>, [unknown?]>(async () => undefined),
    setEventListener: jest.fn((eventName: string, cb: ListenerCallback) => {
      listeners[eventName] = cb;
    }),
    ndefHandler: {
      writeNdefMessage,
    },
  };

  return {
    __esModule: true,
    default: manager,
    NfcEvents: {
      DiscoverTag: 'NfcManagerDiscoverTag',
      SessionClosed: 'NfcManagerSessionClosed',
    },
    NfcTech: {
      Ndef: 'Ndef',
    },
    Ndef: {
      TNF_MIME_MEDIA: 0x02,
      TNF_WELL_KNOWN: 0x01,
      RTD_TEXT: 'T',
      record: jest.fn((tnf: number, type: string, id: number[], payload: number[]) => ({
        tnf,
        type,
        id,
        payload,
      })),
      encodeMessage: jest.fn((records: { payload: number[] }[]) => records[0]?.payload ?? []),
      isType: jest.fn(() => false),
      text: {
        decodePayload: jest.fn(() => ''),
      },
    },
  };
});

jest.mock('@/features/nfc/services/nfcServiceImpl', () => {
  const nativeModule = jest.requireActual(
    '@/features/nfc/services/NfcService.native'
  ) as typeof import('@/features/nfc/services/NfcService.native');
  return {
    get nfcService() {
      return nativeModule.nfcService;
    },
  };
});

jest.mock('@/features/nfc/services/nfcServiceImpl.native', () => {
  const nativeModule = jest.requireActual(
    '@/features/nfc/services/NfcService.native'
  ) as typeof import('@/features/nfc/services/NfcService.native');
  return {
    get nfcService() {
      return nativeModule.nfcService;
    },
  };
});

const mockNfcManager = NfcManager as unknown as MockNfcManagerShape;

function setPlatformOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
}

function buildSampleRequest() {
  return createPaymentRequest({
    recipient: RECIPIENT,
    asset: 'XLM',
    amount: '4.5',
    ttlSeconds: 120,
  });
}

describe('Android & tag NFC writer transport correctness (#111)', () => {
  const originalOs = Platform.OS;
  const mockWriteNdefMessage = mockNfcManager.ndefHandler.writeNdefMessage!;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete mockNfcManager.setNdefPushMessage;
    mockNfcManager.ndefHandler = { writeNdefMessage: mockWriteNdefMessage };
    mockNfcManager.isSupported.mockResolvedValue(true);
    mockNfcManager.isEnabled.mockResolvedValue(true);
    mockNfcManager.start.mockResolvedValue(undefined);
    mockNfcManager.registerTagEvent.mockResolvedValue(undefined);
    mockNfcManager.unregisterTagEvent.mockResolvedValue(undefined);
    mockNfcManager.requestTechnology.mockResolvedValue('Ndef');
    mockNfcManager.cancelTechnologyRequest.mockResolvedValue(undefined);
    mockWriteNdefMessage.mockResolvedValue(undefined);
    for (const key of Object.keys(mockNfcManager.__listeners)) {
      delete mockNfcManager.__listeners[key];
    }
    await nfcService.cancelSession();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOs,
    });
  });

  it('rejects with UNSUPPORTED and never calls onSuccess/onWritten when Android setNdefPushMessage is absent', async () => {
    setPlatformOs('android');
    const onWritten = jest.fn();
    const onError = jest.fn();

    await expect(
      startWriterSession(buildSampleRequest(), {
        onWritten,
        onError,
      })
    ).rejects.toMatchObject({
      name: 'NfcError',
      code: 'UNSUPPORTED',
    });

    expect(onWritten).not.toHaveBeenCalled();
    expect(mockNfcManager.start).not.toHaveBeenCalled();

    const onSuccessDirect = jest.fn();
    await expect(
      nfcService.startWriterSession(new Uint8Array([1, 2, 3]), {
        onSuccess: onSuccessDirect,
      })
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    expect(onSuccessDirect).not.toHaveBeenCalled();
  });

  it('surfaces NATIVE_ERROR, cleans up, and never calls onSuccess when Android peer push rejects', async () => {
    setPlatformOs('android');
    mockNfcManager.setNdefPushMessage = jest
      .fn<Promise<void>, [number[] | null]>()
      .mockRejectedValueOnce(new Error('peer push transport failed'))
      .mockResolvedValue(undefined);

    const onWritten = jest.fn();

    await expect(
      startWriterSession(buildSampleRequest(), {
        onWritten,
      })
    ).rejects.toMatchObject({
      name: 'NfcError',
      code: 'NATIVE_ERROR',
      message: 'peer push transport failed',
    });

    expect(onWritten).not.toHaveBeenCalled();
    expect(mockNfcManager.setNdefPushMessage).toHaveBeenCalledWith(null);
  });

  it('suppresses onSuccess and clears the pushed payload if cancelled while Android push is in flight', async () => {
    setPlatformOs('android');
    let resolvePush!: () => void;
    mockNfcManager.setNdefPushMessage = jest
      .fn<Promise<void>, [number[] | null]>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvePush = resolve;
          })
      )
      .mockResolvedValue(undefined);

    const onSuccess = jest.fn();
    const writePromise = nfcService.startWriterSession(new Uint8Array([9, 8, 7]), {
      onSuccess,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    await nfcService.cancelSession();
    resolvePush();
    await writePromise;

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockNfcManager.setNdefPushMessage).toHaveBeenLastCalledWith(null);
  });

  it('emits onWritten only after a completed tag NDEF write and preserves the payment MIME type', async () => {
    setPlatformOs('android');
    const request = buildSampleRequest();
    const encoded = encodePaymentRequest(request);
    const onWritten = jest.fn();
    const onError = jest.fn();

    await startWriterSession(request, {
      transport: 'tag',
      onWritten,
      onError,
    });

    expect(onWritten).not.toHaveBeenCalled();
    expect(mockNfcManager.__listeners.NfcManagerDiscoverTag).toEqual(expect.any(Function));

    await mockNfcManager.__listeners.NfcManagerDiscoverTag?.({});

    expect(Ndef.record).toHaveBeenCalledWith(
      Ndef.TNF_MIME_MEDIA,
      NFC_PAYMENT_MIME_TYPE,
      [],
      Array.from(encoded)
    );
    expect(mockWriteNdefMessage).toHaveBeenCalledWith(Array.from(encoded));
    expect(onWritten).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces NATIVE_ERROR via onError and never calls onWritten when tag writeNdefMessage rejects', async () => {
    setPlatformOs('ios');
    mockWriteNdefMessage.mockRejectedValueOnce(new Error('tag lost during write'));

    const onWritten = jest.fn();
    const onError = jest.fn();

    await startWriterSession(buildSampleRequest(), {
      onWritten,
      onError,
    });

    await mockNfcManager.__listeners.NfcManagerDiscoverTag?.({});

    expect(onWritten).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(NfcError);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'NATIVE_ERROR',
      message: 'tag lost during write',
    });
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalled();
  });

  it('cancels an active tag writer session, cleans up native listeners, and ignores late tag events', async () => {
    setPlatformOs('ios');
    const onWritten = jest.fn();
    const onError = jest.fn();

    const session = await startWriterSession(buildSampleRequest(), {
      onWritten,
      onError,
    });

    const capturedDiscoverListener = mockNfcManager.__listeners.NfcManagerDiscoverTag;
    await session.cancel();

    expect(mockNfcManager.unregisterTagEvent).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SESSION_CANCELLED',
      })
    );

    await capturedDiscoverListener?.({});
    expect(mockWriteNdefMessage).not.toHaveBeenCalled();
    expect(onWritten).not.toHaveBeenCalled();
  });
});
