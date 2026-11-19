# Petrinaut and Brunch integration tests

These tests run the Petrinaut website's Brunch code against the built Brunch server (`apps/brunch-agent`), in-process and with faux model providers, so they cost no model turns. They live in their own package so that neither app depends on the other: the website does not build the Brunch server, and the Brunch server does not depend on Petrinaut's UI.

- `local-storage-demo-app.canonical-state-change`: the website's panel runs the browser tools the server issues, saves revisions, and the server continues the turn.
- `ledger-refusal-presentation`: the website renders the server's applied, refused and thrown Ledger commits, live and reopened from history.
- `live-pending-tool`: the website's transport bounds a stalled native OpenAI tool row without replaying completed tool work.
- `reliable-chat-endings`: clean empty tool follow-ups end visibly; unanswered calls in a failed response become neutral, non-actionable rows, live and reopened, while successful results remain visible.
- `buffered-admission`: the website's Voice code speaks only what the server's admission-controls probe approved.

The tests import website modules as `@apps/petrinaut-website/src/...` and reach the server through `@apps/brunch-agent/testing/*`, which loads `apps/brunch-agent/dist/app.mjs`.

```sh
turbo run test:integration --filter @tests/petrinaut-brunch-integration
```

The corresponding manual Chrome witness also checks Stop and later-message usability. It uses only synthetic responses and an owned loopback server; like the app's other browser witnesses, it requires local macOS Chrome. It builds both apps first; see [the app's manual tests](../../apps/brunch-agent/README.md#tests).

```sh
yarn workspace @apps/brunch-agent test:manual:browser:reliable-chat-endings
```
