# NFC device checklist

Devices to test
- iPhone with Core NFC support (physical device)
- Pixel-class Android device
- Samsung/other OEM device to capture vendor variance

Checklist
- Ensure NFC is enabled in system settings.
- For iOS: confirm entitlement and Info.plist usage string present in `app.config.ts`, and verify NDEF write/read against a physical writable NDEF tag (do not assume iPhone-to-iPhone tag push).
- For Android: confirm `android.permission.NFC` is declared, verify reader/tag dispatch with a writable NDEF tag, and confirm peer-push writer mode fails cleanly with `UNSUPPORTED` (never false success) on Android 10+ devices without `setNdefPushMessage`.
