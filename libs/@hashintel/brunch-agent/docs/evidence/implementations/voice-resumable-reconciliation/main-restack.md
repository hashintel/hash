# Full-stack restack onto main

Lu explicitly requested `gt restack --no-interactive` on 2026-09-07 after the review-only Mission 7 move. That operation restacked Missions 5, 6, 6b and 7 onto `main` at `b1d3ffcfd1077546276a8698f45cee8f7144c6dc`. No push, PR submission, Linear write, provider call or acceptance occurred. Mission 6b remains unaccepted and Mission 7's shared/paid foundation gate remains closed.

## Resolution and pins

Only `apps/brunch-agent/src/app.ts` and `apps/brunch-agent/src/http/routes.ts` conflicted, while replaying Mission 5's removal of the legacy chat route. Main's newly added liveness route is retained alongside the ownership-guarded Flue conversation route. `/api/chat`, its handler and its route constant remain removed. The rest of the stack replayed without source conflicts.

| Role | Rebased pin |
| --- | --- |
| Mission 5 | `b1295ad454ba7548a927e7d9771c5bb211e04827` |
| Mission 6 | `976bb1c67cc6673c06356b855a667584b662f8c9` |
| Mission 6b code candidate | `8ed08e1eba50ea972a96481227540461e03bba39` |
| Mission 6b before this pointer refresh | `ccf93d5bb5b33c4cc54c5b349c469bc632df221b` |
| Mission 7 at the verification run | `11bfa2a18da1c782ae0ed191f12f44a68a11e2c2` |

The runtime tree differs from the previous review candidate by main's container/liveness changes, not new Voice reconciliation behavior. The imported KA contribution remains pinned at `be56a18ff0244c5750a8702e9c7f45c0b607dc06`. KA's frozen branch was observed at the later `9415e1b0075d7cb8c5b7fe19e0512b8bc917c97f` and was left untouched; that newer contribution is not imported by this restack. Original source, witness and pre-restack evidence pins remain historical records, not rewritten results.

## Verification

The same seven-package command in [the reconciliation verification](verification.md#verification-run), with `--force`, passed **39/39 tasks with zero cached tasks**: builds, unit tests, TypeScript and ESLint. Scoped suites passed **1,318 tests in 167 files**. The increase from the earlier run is main's new health unit test. The architecture-doc check passed with 70 layers, 356 edges, 736 files, 71 generated pages and 38 authored pages. Whitespace and conflict-marker checks passed.

A separate Node probe loaded the real built application through `loadBuiltBrunchApplication()`, with a fresh temporary `BRUNCH_DEV_DB_PATH` and `OTEL_SDK_DISABLED=true`. It used the production application's `fetch`, not a test-only Hono route, and shut it down afterward. Assertions verified:

```json
{"health":{"status":200,"body":{"status":"pass"}},"legacy":404,"guardedFlue":401}
```

The health response also had `cache-control: no-store` and `application/health+json` content type. Requests were `/health`, `/api/chat` and `/agents/chat/missing-identity`; none admitted a conversation or contacted a model. This proves that the conflict resolution retained liveness and the single guarded conversation door in the emitted application. It is not a container-runtime, deployment, microphone, reload or latency witness.

Subsequent commits refresh the live Mission 6b/7 dependency pointers only; they do not change this tested runtime tree or clear any acceptance gate. The existing [acceptance dispositions](verification.md#acceptance-disposition--still-open) remain open.
