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

Platform notes
- iOS: Core NFC requires entitlement `com.apple.developer.nfc.readersession.formats` and `NFCReaderUsageDescription` in Info.plist. Only physical devices supported.
- Android: Add `android.permission.NFC` and handle foreground dispatch. Test on Pixel and Samsung-class devices.

Troubleshooting
- NFC Unavailable: ensure device supports NFC and app has permissions.
- NFC Disabled: ask user to enable in OS settings.
- Timeout: ask users to bring devices closer and retry.

## Validation and compatibility

Fresh native NFC reads enforce the shared five-minute timestamp clock window and the maximum 24-hour request lifetime. Amounts reject leading zeros and nonfinite values. UTC dates must represent a real calendar date, and supported optional fields retain their contract limits. Encoding validates a request before serializing it.

The decoder also accepts the previous internal request format for existing tags. Decoding without `rejectExpired` is for structural/archival inspection; live reads use `rejectExpired: true`. Milliseconds from version 1 timestamps are preserved through decode/encode. NFC MIME and app scheme identifiers remain unchanged.
