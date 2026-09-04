# Side quest — Preserve Voice APIs in the Brunch launcher

## Relationship to the live mission

The real `yarn dev:brunch` witness required by Mission 5 exposed a bounded launcher
regression: the Brunch-specific Vite config removes Petrinaut's entire
`petrinaut-api-dev` plugin, so `/api/voice/config` returns transformed source
instead of the handler's JSON response. The owner directed this remediation to
PR #9531 rather than its parent. This side quest changes only local launcher
wiring and does not change the unified Flue conversation route or Voice turn
semantics.

## Imperative

Make the Brunch-configured Petrinaut panel retain the website's API plugin while
continuing to proxy `/agents/chat/*` to the Brunch server, so the existing Voice
availability and Realtime-call handlers can run under `yarn dev:brunch`.

## Throughline

```text
yarn dev:brunch
→ apps/brunch-agent/petrinaut-local.vite.config.ts
→ real apps/petrinaut-website Vite config and petrinaut-api-dev plugin
→ /api/voice/config and /api/voice/realtime-call

panel /agents/chat/*
→ unchanged same-origin proxy
→ Brunch Flue server
```

## Proof

- A config-level regression test loads the real merged Brunch panel config and
  finds the `petrinaut-api-dev` plugin alongside the `/agents/chat` proxy.
- The focused Brunch test suite passes.
- With the required Voice environment enabled, a real local
  `/api/voice/config` request returns the handler's JSON availability envelope,
  not source text.

## Constraints

- Do not alter the stock Petrinaut `/api/chat` handler or route.
- Do not proxy `/api/voice/*` to the Brunch server.
- Preserve `/agents/chat` as the only Brunch conversation route.
- Do not change Voice policy, conversation state, or production deployment.

## Stop conditions and budget

Stop if retaining the website plugin causes `/api/chat` to intercept
`/agents/chat`, changes the Flue proxy, or requires production routing work.
Budget: one launcher config change, one focused regression test, and the minimum
documentation/evidence update required to close this side quest.
