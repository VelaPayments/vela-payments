# Vela Stellar testnet demo

This is the client-side checklist for a real two-device demo. The server-side
[runbook](https://github.com/VelaPayments/vela-server/blob/main/docs/testnet-e2e-runbook.md),
[release checklist](https://github.com/VelaPayments/vela-server/blob/main/docs/release-checklist.md),
and [appeal brief](https://github.com/VelaPayments/vela-server/blob/main/docs/drips-appeal-summary.md)
live in the `vela-server` repository.

## Before the demo

1. Use a development build on two NFC-capable physical devices; Expo Go and
   the web preview cannot exercise NFC, passkeys, or SecureStore.
2. Configure both devices with the same deployed API URL, Supabase project,
   `EXPO_PUBLIC_STELLAR_NETWORK=testnet`, testnet Horizon/RPC endpoints, and
   testnet USDC issuer.
3. Configure the WebAuthn relying-party ID and HTTPS origin for the build.
   Register a passkey on each device and confirm the server health endpoint
   reports `network: testnet`.
4. Create or restore a wallet on each device. The receiver must link its
   wallet to the server; the payer must be funded by Friendbot or an existing
   testnet balance.

## Exercise the payment

1. On the receiver, choose XLM or USDC and start receiving.
2. Hold the receiver near the payer until the `payment-request.v1` payload is
   delivered. NFC delivery is not settlement.
3. On the payer, review the destination, amount, asset, and memo. Approve with
   the payment-scoped passkey, then sign locally. For USDC, both wallets must
   have a trustline for the configured testnet issuer; the payer screen checks
   this before authorization/signing. The payer also refreshes its Horizon
   balance before first approval; retries reconcile the server’s stored
   transaction hash without repeating this preflight. Final fees and reserve
   rules remain enforced by Horizon.
4. Wait for the server to confirm the Stellar transaction. If the submit
   response is interrupted, retrying the payment reconciles the stored hash.
5. Refresh History on both devices. Confirm the Horizon record is marked
   `Indexed by Vela` and opens to the Stellar Expert transaction page.

## Evidence

Record sanitized screenshots of the request, passkey approval, success state,
History entry, client/server commit SHAs, CI run URL, payment UUID, transaction
hash, ledger, network, asset issuer when applicable, and the independent
Horizon verification output. Never record seed phrases, private keys, tokens,
or raw WebAuthn material.
