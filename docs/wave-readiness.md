# Wave preparation

Vela is an early open-source Stellar testnet payment prototype with an Expo client and NestJS backend. Its goal is contactless payment requests and self-custodial wallet access using NFC and passkeys.

## Submission description

> Vela is an open-source NFC payment experience for Stellar testnet. A receiver registers an expiring request, a payer scans and reviews it, authorizes with a passkey, signs the transaction locally, and submits it through the Vela server for confirmation. The repositories now include the shared lifecycle, wallet ownership checks, Horizon history and SEP-0007 interoperability. Native two-device settlement evidence is the remaining release gate.

Repositories:

- https://github.com/VelaPayments/vela-payments
- https://github.com/VelaPayments/vela-server
- Preview: https://vela-payments.vercel.app/

## Verified preparation

- Both repositories provide an MIT license; existing Expo attribution is retained in the client.
- Contributor setup, focused PR expectations and check commands are in CONTRIBUTING.md.
- The original single-case backlog was reviewed and consolidated into seven scoped candidates per repository, with 31 pre-existing mobile PR-linked issues preserved for review. See [issue audit](issue-audit.md).
- Automated tests use mocks and fixtures. They establish regression coverage, not successful real-device payments or live transfer safety.
- The current implementation includes a testnet E2E runbook and sanitized evidence template; no live transaction hash is claimed until the physical flow is executed.
- The client-side [native testnet demo checklist](testnet-demo.md) documents the two-device passkey/NFC flow, retry behavior, and evidence to capture.
- The payer flow performs issuer-specific USDC trustline and asset-balance preflights before first authorization; retries skip those checks and reconcile the stored transaction hash.
- Build-plan and architecture documents include planned functionality; the README project status records the current limits.

## Verification status — November 8, 2026

| Check               | Result                                                 |
| ------------------- | ------------------------------------------------------ |
| Formatting           | `git diff --check` passed                              |
| Type checking        | Not run: local dependency install is incomplete        |
| Build                | Not run: local dependency install is incomplete        |
| Unit tests           | Not run: Jest binary is unavailable locally             |
| End-to-end tests     | Physical-device payment/NFC/passkey flows not verified |

Earlier baseline checks are not evidence for this checkout. Use the current GitHub Actions run after dependencies are available.

## Current release gate

Dependency installation in the current workspace is blocked by unavailable npm
registry packages, so the new client/server changes still require a clean CI
run. After that, capture one real XLM or USDC testnet transfer using
`vela-server/docs/testnet-e2e-runbook.md` and attach the sanitized record from
`demo-evidence-template.md`.

## Remaining candidate set

Start with a manageable subset after maintainers confirm scope and dependencies. `wave-candidate` is a preparation label only; it does not enroll an issue in Drips.

- #17: NFC byte-size boundaries and decoding errors — retain for broader device/codec coverage.
- #27: Receive precision and request construction — input regression coverage.
- #39: Timer concurrency and cancellation cleanup — fake-timer coverage.

The shared contract alignment with vela-server#3 is implemented. Trustline key/reserve checks and passkey failure mapping have deterministic regression coverage; native-device and clean-CI verification remain.

## Apply through Drips

1. Log into [Drips Wave](https://www.drips.network/wave) with the maintainer GitHub account.
2. In Maintainers → Orgs and Repos, install the Drips GitHub app on VelaPayments and select these public repositories.
3. Because a rejected repository cannot be re-applied, use the repository's **Appeal** action in Maintainers → Orgs and Repos; follow the cooldown and application-limit status shown in the app.
4. Include the substantive changes listed above, the [native testnet demo checklist](testnet-demo.md), and the server's completed release evidence record.
5. Attach evidence only after a real two-device testnet transfer and independent Horizon verification. Approval is not guaranteed and has not been verified for Vela.
6. After approval, add a small reviewed issue set with honest complexity values. Review applications promptly and verify PRs against their acceptance criteria.

Drips' [maintainer guidance](https://docs.drips.network/wave/maintainers/participating-in-a-wave/) says appeals are reconsidered only when there has been substantive change in code, project quality, activity, or the concerns raised in the review. The [Terms & Rules](https://docs.drips.network/wave/terms-and-rules/) state that repository selection remains at the discretion of the organizers.

The project remains a testnet prototype. Production hosting does not make it a mainnet wallet. The RP domain, storage identifiers, NFC MIME type and app scheme migration remain deferred. No contributor should bypass these compatibility decisions to make a demo appear complete.

References: [maintainer participation](https://docs.drips.network/wave/maintainers/participating-in-a-wave/), [program rules](https://docs.drips.network/wave/terms-and-rules/), [Stellar program](https://www.drips.network/wave/stellar).
