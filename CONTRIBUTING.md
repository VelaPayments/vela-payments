# Contributing to Vela

Vela is a Stellar testnet prototype. Start with the project-status section in the README and the curated backlog in [Wave preparation](docs/wave-readiness.md).

## Pick a task

Choose an open issue labeled `wave-candidate`. This is a local preparation label, not a claim of Drips approval. Read its scope and acceptance criteria, then ask to be assigned before starting. Check existing tests first: adding a duplicate assertion is not useful work. Tasks are sized by scope; completion times are not guaranteed.

If working through Drips, apply through its dashboard after repository approval. Maintainers review applications and PRs, check the result against the issue, and resolve accepted work during the active Wave. Rewards and approval are determined by the program; issue count does not establish eligibility.

## Setup and checks

Use the README setup steps. The Expo 56 toolchain requires Node.js 20.19+; keep private environment files out of Git, use testnet accounts, and avoid logging credentials or raw provider errors.

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand
npm run build
```

Browser builds default to testnet preview settings. Jest uses its test setup environment and native mocks; passing tests does not establish physical NFC or passkey support. Use a native development build and the device checklist for those flows.

## Pull requests

- Branch from `main` and keep each PR focused on one issue.
- Link the issue with `Closes #<number>` and describe the actual behavior changed.
- Include commands run, results, and any device/network limitations. Do not describe mocked tests as a live transfer.
- For bug fixes, add regression coverage that fails on the original behavior.
- Coordinate changes to the payment payload, API types and authentication across both repositories.
- Preserve historical migration IDs and the deferred RP domain, secure-storage identifiers, NFC MIME type and app scheme until a migration is agreed.
- Use concise, factual commit messages and retain third-party copyright notices.

Contributions are made under the repository's [MIT license](LICENSE). If you need clarification or find unrelated work, open a focused issue describing the observed behavior and expected result.
