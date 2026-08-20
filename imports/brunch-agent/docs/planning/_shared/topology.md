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
├─ affordance.ts      ✓  envelope schemas (free-text form)
├─ naming.ts          ✓  identity/tool-name policy (ADR-0001)
├─ plugin.ts          ✓  plugin surface (thin today; grows ops at FE-1393)
├─ testing/           ✓  test utilities subpath (mirrors Flue's own store-contract pattern)
└─ [MISSING]          ✗  the ask/suspension PROTOCOL — mechanism currently in binding-flue.
                         This is the §14.2 second-binding failure in spirit. See N1.

packages/binding-flue              LANE 2 (translate harness ↔ Flue dialect)
├─ capabilities.ts    ✓  the 8-capability declaration — the binding's contract-of-record
├─ index.ts           ~  useElicitation: the HOOK WIRING is correctly here (useTool,
│                        usePersistentState updater, useAgentStart, useDataWriter,
│                        terminate:true, ctx.append) — but interleaved with portable
│                        mechanism that isn't:
│                          ✗ affordance id scheme        (`affordance_${toolCallId}` policy)
│                          ✗ one-live-affordance guard + refusal text
│                          ✗ reply-binding signal payload (type/tagName/body/attributes)
│                          ✗ elicitation instruction text
│                        Never: elicitation semantics, store rules, prompt content.
└─ local-capture-store.ts ✓ storage-port implementation (file, tmp+rename, per-path queue).
                         One per deploy target per binding. Never: business rules (all in core).

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

- **N1 (the one structural repair).** `packages/core/src/ask-protocol.ts`: pure functions —
  mint affordance from (question, callId), the one-live guard as a pure decision, the
  reply-binding signal payload builder, the instruction fragments. `useElicitation` becomes
  wiring: hooks in, protocol calls out. The second-binding test then has content: a
  `binding-pi` reuses the protocol module wholesale. Do this **before FE-1392**, which
  otherwise lands sweep mechanism in the binding the same way (recommend: its trigger/judgment
  logic goes to `core/src/sweep-protocol.ts` from day one; the binding contributes only
  `useAgentFinish`/`useSubagent`/durable-tool wiring).
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
- **N5 (storage-port implementations).** One per (binding × deploy target), always in the
  binding package, always implementing core's `CaptureStore` + parse-on-read. The Cloudflare
  case (per-object SQLite) is a new implementation behind the same port — the file-path
  assumption never leaks above the binding.
- **N6 (plugin-assurance, when chartered).** `packages/plugin-assurance`, same shape as
  gherkin; its existence is FE-1387's contract-freeze instrument, not a feature.

Ratification note: N1 is the only item that *changes* existing code; N2–N6 constrain future
placement. If ratified, N1–N6 become an ADR and the boundary gates in `test/boundaries.test.ts`
should learn the enforceable parts (N2's "no plugin content in app skills dirs" and N5's
"port implementations only in bindings" are both mechanically checkable).
