# Development guide

Vela is a Stellar testnet payment prototype built with Expo SDK 56, React Native and TypeScript. Physical-device payments and complete backend authentication integration remain under development.

## Requirements

- Node.js 20.19 or newer and npm.
- A physical Android or iOS device for native NFC and passkey work.
- A Vela development build: Expo Go cannot load the required native modules.
- Domain associations and signing configuration for native passkeys. The RP domain and compatibility identifier migration remain deferred; do not change them independently.

## Setup

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and review the public testnet settings.
3. Build the native app with `npx expo run:android` or `npx expo run:ios`, or use `npm run dev:build:android` / `npm run dev:build:ios` after configuring EAS and signing.
4. Run `npm run dev-client` and open the project in the installed development build.

The EAS commands require the EAS CLI and an authenticated Expo account. Physical iOS builds also require device provisioning and Apple signing credentials. Native dependency changes require rebuilding the development client.

For the browser UI preview, run `npm run web`. Browser NFC and native passkey onboarding are unavailable; the preview does not demonstrate physical-device transfers.

## Quality checks

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint checks |
| `npm run format:check` | Formatting validation |
| `npm test -- --runInBand` | Unit tests |
| `npm run build` | Static Expo web export to `dist` |

## Configuration

The client reads these public environment variables:

- `EXPO_PUBLIC_STELLAR_NETWORK`
- `EXPO_PUBLIC_HORIZON_URL`
- `EXPO_PUBLIC_RPC_URL`
- `EXPO_PUBLIC_USDC_ISSUER`

Testnet has public defaults. Mainnet requires explicit values and is not a supported prototype payment deployment. Never put secret keys in `EXPO_PUBLIC_*` variables.

## Project layout

- `src/app/`: Expo Router routes.
- `src/features/`: authentication, wallet, NFC, receive and send features.
- `src/components/`: shared interface components.
- `src/lib/`: configuration, analytics and secure storage.
- `assets/brand/`: Vela brand assets.
- `docs/`: architecture and contributor guides.

See [CONTRIBUTING.md](../CONTRIBUTING.md), [deployment instructions](deployment.md), and the [README project status](../README.md#project-status) before opening a PR. Verify the current implementation before claiming a feature is complete.
