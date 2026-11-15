# NFC flow and troubleshooting

## Payment request wire format

The NFC codec writes the shared `payment-request` version 1 contract used by
the server. Its wire timestamps are ISO 8601 UTC strings; the app's internal
`payment_request` object continues to use Unix seconds (including fractional seconds to preserve wire milliseconds). The codec converts
between these representations at the NFC boundary. The matching fixture is
`src/features/nfc/fixtures/payment-request.v1.json` and is checked by the
server contract tests as well.

This document describes the NFC handshake, security constraints, and common troubleshooting steps for developers and beta testers.

Overview
- Roles: Writer (sender) and Reader (receiver).
- Format: `payment-request.v1` JSON payload with non-sensitive fields only.

Handshake
1. Writer prepares `payment-request.v1` payload with `id` and optional `expiresAt` (epoch seconds).
2. Reader calls `useNfc().startReading()` and waits for inbound payload.
3. On read, the app validates payload using `validatePaymentRequest()` which enforces expiry and replay dedupe.
4. If valid, proceed to presentation/confirm UI. If invalid, surface mapped Spanish error copy.

Security rules
- Forbidden fields: secret, private, seed, token, passphrase, password, privKey, keyPair.
- Replay protection: 5-minute TTL dedupe window; duplicate requests rejected deterministically.
- Clock skew tolerance: 30s default; configurable in validator.

Platform and transport notes
- **Writable NDEF tags vs. phone-to-phone transport:** `NfcService.native` writes `payment-request.v1` NDEF MIME records to writable NDEF tags (`Ndef.writeNdefMessage`) and reads NDEF tags in reader mode. Generic phone-to-phone NFC delivery is **not** promised across modern iOS and Android devices because Host Card Emulation (HCE) is not implemented in this prototype.
- **iOS:** Core NFC requires entitlement `com.apple.developer.nfc.readersession.formats` and `NFCReaderUsageDescription` in Info.plist. Supports reading NDEF payloads and writing to writable NDEF tags on physical devices only; iPhone-to-iPhone NDEF push is not provided by Core NFC tag sessions.
- **Android:** Requires `android.permission.NFC` and foreground reader/tag dispatch. Android Beam (`setNdefPushMessage`) was removed in Android 10+ and is absent in `react-native-nfc-manager` v3; when peer push is unavailable on the runtime, starting a peer writer session fails with `UNSUPPORTED` instead of reporting delivery. Explicit `{ transport: 'tag' }` writer sessions write to writable NDEF tags.

Troubleshooting
- NFC Unavailable / Unsupported Transport: ensure the device supports NFC, app permissions are granted, and use a writable NDEF tag when native phone-to-phone push is unavailable.
- NFC Disabled: ask user to enable in OS settings.
- Timeout: ask users to hold the device steady against the writable tag or supported NFC target and retry.

## Validation and compatibility

Fresh native NFC reads enforce the shared five-minute timestamp clock window and the maximum 24-hour request lifetime. Amounts reject leading zeros and nonfinite values. UTC dates must represent a real calendar date, and supported optional fields retain their contract limits. Encoding validates a request before serializing it.

The decoder also accepts the previous internal request format for existing tags. Decoding without `rejectExpired` is for structural/archival inspection; live reads use `rejectExpired: true`. Milliseconds from version 1 timestamps are preserved through decode/encode. NFC MIME and app scheme identifiers remain unchanged.
