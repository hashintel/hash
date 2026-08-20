# Topology: verification and specification

**Status: ratified 2026-08-17 (Lu) — recorded as [ADR-0002](../../adr/0002-topology-and-placement-rules.md);
this file remains the living reference.** Verifies
the current app/package topology against the three-lane model (cheatsheet, boundary summary),
spec §12.2, and Flue's project-layout guide; then specifies where upcoming work lands. Pseudo-
style: tree nodes with rules; `✓` complies today, `✗` violates, `→` normative rule for what's
next.

## Verification — the tree as it stands

```
packages/core                      LANE 3 (harness; substrate-free)
├─ capture-store.ts   ✓  the storage port's contract + pure command surface; owns envelope
│                        invariants. Never: substrate imports, IO, per-substrate shapes.
├─ session-log.ts     ✓  substrate-neutral archive/version/anchoring rules; archive ordinals
│                        are evidence identity, substrate ids remain provenance only.
├─ storage.ts         ✓  binding-only storage support subpath; not part of the plugin SDK.
├─ affordance.ts      ✓  envelope schemas (free-text form)
├─ naming.ts          ✓  identity/tool-name policy (ADR-0001)
├─ plugin.ts          ✓  plugin surface (thin today; grows ops at FE-1393)
├─ testing/           ✓  test utilities subpath (mirrors Flue's own store-contract pattern)
└─ ask-protocol.ts    ✓  substrate-free ask/suspension mechanism: affordance minting, guard,
                         reply-binding signal, and instruction fragments (FE-1422). See N1.

packages/binding-flue              LANE 2 (translate harness ↔ Flue dialect)
├─ capabilities.ts    ✓  capability declaration — the binding's contract-of-record
├─ history-reader.ts  ✓  public SDK `history()` mapping over a host-injected URL resolver/fetch;
│                        archive-on-read; no private canonical/update-chunk vocabulary.
├─ archive-capability.ts ✓ binding-private write capability; callers holding `CaptureStore`
│                        cannot inject pre-classified archive entries.
├─ index.ts           ✓  useElicitation is Flue HOOK WIRING (useTool, usePersistentState
│                        updater, useAgentStart/useDelivery, useDataWriter, terminate:true,
│                        ctx.append) and calls core's ask protocol (FE-1422).
│                        Never: elicitation semantics, store rules, prompt content.
└─ local-capture-store.ts ✓ versioned storage-port implementation (capture store + session-log
                         archive, legacy provisioning, parse-on-read, tmp+rename, per-path
                         queue). One per deploy target per binding. Never: business rules.

packages/plugin-gherkin            LANE 3 (target policy)
└─ index.ts           ✓  {name, targetDomain} — honest thinness (smallest-honest bar).
                         Never: harness mechanism, substrate imports, storage.

apps/dev                           LANE 1 SHELL (consume Flue directly) + thin host
├─ src/app.ts         ✓  single fetch entry; explicit mounts; assets beside agents
├─ src/routes.ts      ✓  the one shared mount constant (doctrine per routing guide)
├─ src/agents/gherkin-elicitor.ts ✓ thin directive-marked host (§12.1); flat file OK until
│                        the second agent (then per-agent folders, FE-1385)
├─ src/db.ts, db-path.ts ✓ convention entry + bun-testable path logic, deliberately split
├─ src/ui/chat.tsx    ~  hand-rolled client; tolerated ONLY until FE-1385 adopts @flue/react
│                        (divergence risk 1). Never: growing new part-rendering features here.
└─ test/              ✓  reviewed substrate inventory; child-process eval (audited: composed
                         from documented parts; do-not-weaken pins live here)

docs/planning/**/baseline/run.ts   EXPERIMENT (JS-API workflow pattern, independently converged)
```

## Specification — where what's next lands

- **N1 (the structural repair, discharged by FE-1422).**
  `packages/core/src/ask-protocol.ts` now owns pure affordance minting, the one-live guard,
  reply-binding signal payload, and instruction fragments; `useElicitation` is hooks-in,
  protocol-calls-out wiring. The remaining future constraint still applies: FE-1392's
  trigger/judgment logic goes to `core/src/sweep-protocol.ts` from day one, while the binding
  contributes only `useAgentFinish`/`useSubagent`/durable-tool wiring. A future `binding-pi`
  should reuse both protocol modules wholesale.
- **N2 (packs and cards).** Plugin-owned content lives in plugin packages, exported as
  `defineSkill`-compatible definitions; the app's agent module *registers* what the plugin
  exports. Never per-agent `skills/` dirs holding plugin content in the app — that puts lane-3
  policy inside lane-1, invisible to the boundary gates. Quiver (FE-1406) content is
  harness-shipped: same rule, exported from core (or a `packages/quiver`), registered by hosts.
  Card content stays assertable outside the Vite graph (fixture-grade copies; B4's probe
  decides the exact shape).
- **N3 (the demo shell).** `apps/demo`, sibling of `apps/dev`, same canonical layout; consumes
  `@flue/react` + `createFlueClient` directly (lane 1), imports `@brunch/*` public surfaces
  only. Never: reaching into binding internals, custom servers (`dist/app.mjs` exists for the
  embed case if it ever really arises).
- **N4 (experiments).** Experiment runners (FE-1404, future condition reruns) stay beside their
  planning docs (`docs/planning/**/`), JS-API pattern, `observe()` accounting — never in
  `packages/` (they are instruments, not product) and never a bespoke daemon.
- **N5 (storage-port implementations; local target discharged by FE-1391).** One per (binding ×
  deploy target), always in the binding package, always implementing core's `CaptureStore` +
  parse-on-read. The local implementation provisions a versioned target-document record around
  both capture and archive state. The Cloudflare case (per-object SQLite) is a new implementation
  behind the same port — the file-path assumption never leaks above the binding.
- **N6 (plugin-assurance, when chartered).** `packages/plugin-assurance`, same shape as
  gherkin; its existence is FE-1387's contract-freeze instrument, not a feature.

Ratification note: N1 was the only item that changed existing code and landed in FE-1422;
N2–N6 constrain future placement. ADR-0002 records the ratification. The boundary gates in
`test/boundaries.test.ts` should learn the enforceable parts as their packages arrive (N2's
"no plugin content in app skills dirs" and N5's "port implementations only in bindings" are
both mechanically checkable).
