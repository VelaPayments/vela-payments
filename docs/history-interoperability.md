# Stellar History and Interoperability

Vela treats Stellar Horizon as the source of truth for settled payment history.
The client requests the latest payment operations for the active wallet, derives
sent/received direction from the account, and links each record to Stellar
Expert (`testnet` for testnet and `public` for mainnet). A local payment-intent
record is not displayed as settled until the network transaction is confirmed.

The companion server also indexes confirmed Vela payments for both parties at
`GET /v1/transactions`. That endpoint is useful for application audit and
request correlation; the client-facing history remains Horizon-backed so it
also includes Stellar payments made outside Vela.

The typed client method is `PaymentApiClient.getTransactionHistory(token,
{ page, limit, asset, direction, from, to })`. It is available for
account/audit views while the current History tab continues to use Horizon for
complete wallet activity. When the user has a server session, the History tab
also compares transaction hashes with the Vela index and labels matching rows
as `Indexed by Vela`; a temporary API outage leaves Horizon history visible and
shows a warning instead of hiding settled activity.

## Asset identity

- XLM is identified by Horizon's `native` asset type.
- USDC is trusted only when both `asset_code === "USDC"` and
  `asset_issuer === EXPO_PUBLIC_USDC_ISSUER`.
- A same-code issued asset from another issuer remains visible, but is labeled
  `USDC (unverified issuer)` and exposes the issuer address. This prevents a
  code-only match from presenting an unrelated asset as USDC.
- The client and server must use the same issuer and Stellar network profile;
  the testnet issuer is documented in `.env.example` and the E2E runbook.

## SEP-0007 payment links

`src/features/payments/services/Sep7PaymentUri.ts` builds and parses
`web+stellar:pay` URIs for XLM and configured issued assets. It validates the
destination, positive amount, supported asset code, issuer requirement, memo
type, optional message, and configured USDC issuer. The adapter is
intentionally limited to fields Vela can verify; it does not claim to be a
complete wallet implementation.

## Verification

Run the focused tests after installing dependencies:

```bash
npm test -- --runInBand src/features/history/services/HistoryService.test.ts
npm test -- --runInBand src/features/payments/services/Sep7PaymentUri.test.ts
```

For release evidence, independently open the transaction hash in Horizon and
record the network, ledger, asset issuer, and explorer URL in
`vela-server/docs/demo-evidence-template.md`.
