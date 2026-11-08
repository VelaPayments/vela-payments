# Auth Flow — Vela (C06)

This document describes the complete passkey authentication lifecycle for the Vela mobile client.

## File ownership

| Area | Files |
|---|---|
| Service layer | `src/features/auth/services/PasskeyService.ts` |
| Error mapping | `src/features/auth/services/authErrors.ts` |
| Service types | `src/features/auth/services/types.ts` |
| API client | `src/features/auth/services/AuthApiClient.ts` |
| State machine | `src/features/auth/state/authStore.ts` |
| React hook | `src/features/auth/hooks/useAuth.ts` |
| Session policy | `src/features/auth/hooks/useSessionPolicy.ts` |
| Re-auth gate | `src/features/auth/hooks/useReAuth.ts` |
| Route guard | `src/features/auth/components/AuthGuard.tsx` |
| Re-auth modal | `src/features/auth/components/ReAuthModal.tsx` |
| Session mount | `src/features/auth/components/SessionPolicyMount.tsx` |
| Settings UI | `src/features/auth/components/SettingsAuthSection.tsx` |
| Welcome view | `src/features/auth/views/WelcomeView.tsx` |
| Create passkey view | `src/features/auth/views/CreatePasskeyView.tsx` |
| Locked view | `src/features/auth/views/LockedView.tsx` |
| Secure store wrapper | `src/lib/SecureKeyStore.ts` |
| Secure store types | `src/lib/SecureKeyStore.types.ts` |
| Session constants | `src/constants/session.ts` |
| Onboarding routes | `src/app/(onboarding)/` |
| Root layout | `src/app/_layout.tsx` |
| Tabs layout | `src/app/(tabs)/_layout.tsx` |
| Unit tests | `src/features/auth/services/__tests__/PasskeyService.test.ts` |

---

## Auth state machine

```mermaid
stateDiagram-v2
    [*] --> LOADING : app cold start

    LOADING --> UNAUTHENTICATED : no credential in store
    LOADING --> LOCKED : credential found (session not established)

    UNAUTHENTICATED --> ONBOARDING : wallet created
    UNAUTHENTICATED --> READY : passkey registered (PASSKEY_REGISTERED)

    ONBOARDING --> READY : passkey registered (PASSKEY_REGISTERED)

    LOCKED --> READY : passkey authenticated (AUTHENTICATED)
    LOCKED --> UNAUTHENTICATED : logout (LOGOUT)

    READY --> LOCKED : session timeout (LOCK)
    READY --> UNAUTHENTICATED : logout (LOGOUT)
```

### States

| State | Meaning |
|---|---|
| `LOADING` | App rehydrating auth state from SecureStore — render nothing |
| `UNAUTHENTICATED` | No passkey registered — redirect to onboarding welcome |
| `ONBOARDING` | Transitional state if wallet exists but passkey not yet created |
| `READY` | Fully authenticated — all protected tabs accessible |
| `LOCKED` | Session expired — passkey re-auth required before proceeding |

### Actions

| Action | Trigger | Transition |
|---|---|---|
| `REHYDRATE` | App cold start | `LOADING → UNAUTHENTICATED` or `LOADING → LOCKED` |
| `PASSKEY_REGISTERED` | Successful `PasskeyService.register()` | Any → `READY` |
| `AUTHENTICATED` | Successful `PasskeyService.authenticate()` | `LOCKED` → `READY` |
| `LOCK` | Session policy timeout | `READY → LOCKED` |
| `LOGOUT` | User logout or dev reset | Any → `UNAUTHENTICATED` |
| `SET_ERROR` | Auth failure | State unchanged, `lastError` updated |

---

## Registration flow

```mermaid
sequenceDiagram
    participant User
    participant WelcomeView
    participant CreatePasskeyView
    participant PasskeyService
    participant Passkey (native)
    participant SecureKeyStore
    participant AuthProvider

    User->>WelcomeView: taps "Crear llave de acceso"
    WelcomeView->>CreatePasskeyView: router.push

    User->>CreatePasskeyView: taps register button
    CreatePasskeyView->>PasskeyService: register({ rpId, challenge, ... })
    PasskeyService->>Passkey (native): Passkey.create(request)
    Passkey (native)-->>User: biometric prompt (Face ID / fingerprint)
    User-->>Passkey (native): biometric confirmation
    Passkey (native)-->>PasskeyService: PasskeyCreateResult
    PasskeyService->>SecureKeyStore: set(PASSKEY_CREDENTIAL_ID, credentialId)
    PasskeyService-->>CreatePasskeyView: { success: true, credential }
    CreatePasskeyView->>AuthProvider: registerPasskey(displayName)
    AuthProvider->>AuthProvider: dispatch PASSKEY_REGISTERED
    AuthProvider->>SecureKeyStore: set(WALLET_PUBLIC_KEY, publicKey)
    CreatePasskeyView->>CreatePasskeyView: show success → navigate to tabs
```

---

## Authentication / unlock flow

```mermaid
sequenceDiagram
    participant AppState
    participant SessionPolicyMount
    participant AuthProvider
    participant LockedView
    participant PasskeyService
    participant Passkey (native)

    AppState->>SessionPolicyMount: app backgrounded > 5 minutes
    SessionPolicyMount->>AuthProvider: lock()
    AuthProvider->>AuthProvider: dispatch LOCK → LOCKED
    AuthProvider->>LockedView: AuthGuard redirects to /locked

    LockedView->>PasskeyService: authenticate({ rpId, challenge })
    PasskeyService->>Passkey (native): Passkey.get(request)
    Passkey (native)-->>User: biometric prompt
    User-->>Passkey (native): biometric confirmation
    Passkey (native)-->>PasskeyService: PasskeyGetResult
    PasskeyService-->>AuthProvider: unlockWithPasskey()
    AuthProvider->>AuthProvider: dispatch AUTHENTICATED → READY
    LockedView->>LockedView: router.replace('/(tabs)/receive')
```

---

## Session policy

Implemented in `useSessionPolicy` (CLI-026) and `src/constants/session.ts`.

| Policy | Value | Configurable in |
|---|---|---|
| Idle lock | 15 minutes of no activity | `SESSION.IDLE_LOCK_MS` |
| Background lock | 5 minutes backgrounded | `SESSION.BACKGROUND_LOCK_MS` |
| Background grace | 30 seconds (skip re-auth for quick task switches) | `SESSION.BACKGROUND_GRACE_MS` |

### NFC lock exemption

The `useSessionPolicy` hook accepts an `nfcActive` boolean prop. When `true`, background lock is suppressed — this is the hook point for future NFC coordination. Wire via the NFC feature's active state:

```ts
// In SessionPolicyMount — update when NFC state is available:
useSessionPolicy({ nfcActive: nfcIsActive });
```

---

## Route guard

`AuthGuard` wraps the `(tabs)` layout. It reads `state.status` from `useAuth()` and performs `<Redirect>` using Expo Router's `replace` semantics to prevent back-button loops.

```
LOADING       → null (splash handles it)
UNAUTHENTICATED → /(onboarding)/welcome
ONBOARDING    → /(onboarding)/create-passkey
LOCKED        → /(onboarding)/locked
READY         → render children (tabs)
```

---

## Re-authentication modal

`ReAuthModal` + `useReAuth` provide a reusable gate for sensitive transaction actions (e.g. send payment, sign contract).

```tsx
const { withReAuth } = useReAuth();

// In a send-payment handler:
await withReAuth(async () => {
  await sendPayment(amount, recipient);
});
```

---

## Error handling

All native passkey errors are mapped through `mapNativePasskeyError()` in `authErrors.ts`. Every `AuthErrorCode` has a user-safe English message. Raw native error objects are attached as `cause` for internal diagnostics only — they are never surfaced in toasts or analytics.

```
UserCancelled      → USER_CANCELLED  → "Verification cancelled…"
NotSupported       → NOT_SUPPORTED   → "Passkeys are unavailable on this device…"
NoCredentials      → NO_CREDENTIAL   → "No passkey was found…"
CredentialAlreadyExists → CREDENTIAL_EXISTS → "A passkey is already registered…"
Timeout            → TIMEOUT         → "Verification timed out…"
Interrupted        → INTERRUPTED     → "Verification was interrupted…"
(catch-all)        → UNKNOWN         → "Something went wrong…"
```

---

## Security notes

- **No private keys in passkey payloads** — credentials carry only the authenticator's public key and assertion data.
- **SecureKeyStore** uses `requireAuthentication: true` for sensitive keys (credential ID, wallet public key).
- **Dev reset** is gated behind `__DEV__` and never included in production builds.
- **Error sanitization**: `sanitizeAuthError()` strips `cause` before any analytics emission.
- **Challenges**: Registration and payment authorization use server-issued WebAuthn challenges. Local challenge generation remains only for the offline preview path.

---

## Server coordination

`AuthApiClient` uses the live server WebAuthn endpoints for authenticated registration and payment authorization:

- `POST /v1/webauthn/register/options` → WebAuthn creation options
- `POST /v1/webauthn/register/verify` → verified credential
- `POST /v1/webauthn/authenticate/options` → payment-scoped assertion options
- `POST /v1/payments/:id/authorize` → server-side assertion verification

The legacy challenge/verify methods remain typed offline-preview fallbacks and must not be treated as production authentication. The server requires a Supabase bearer token and stores WebAuthn challenges and credentials server-side.
