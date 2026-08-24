# Topology: verification and specification

**Status: ratified 2026-08-17 (Lu) — recorded as [ADR-0002](../../adr/0002-topology-and-placement-rules.md);
this file remains the living reference.** Verifies
the current app/package topology against the three-lane model (cheatsheet, boundary summary),
spec §12.2, and Flue's project-layout guide; then specifies where upcoming work lands. Pseudo-
style: tree nodes with rules; `✓` complies today, `✗` violates, `→` normative rule for what's
next.

## Verification — the tree as it stands

```text
packages/core                      LANE 3 (harness; substrate-free)
├─ capture-store.ts   ✓  the storage port's contract + pure command surface; owns envelope
│                        invariants. Never: substrate imports, IO, per-substrate shapes.
├─ session-log.ts     ✓  substrate-neutral archive/version/anchoring rules; archive ordinals
│                        are evidence identity, substrate ids remain provenance only.
├─ storage.ts         ✓  binding-only storage support subpath; not part of the plugin SDK.
├─ affordance.ts      ✓  envelope schemas (free-text form)
├─ naming.ts          ✓  identity/tool-name policy (ADR-0001)
├─ plugin.ts          ✓  plugin identity + one declared proposal floor (FE-1392); grows the
│                        full catalog/tables/ops contract at FE-1393
├─ testing/           ✓  test utilities subpath (mirrors Flue's own store-contract pattern)
├─ ask-protocol.ts    ✓  substrate-free ask/suspension mechanism: affordance minting, guard,
│                        reply-binding signal, and instruction fragments (FE-1422). See N1.
└─ sweep-protocol.ts  ✓  substrate-free settlement/sweep mechanism: trigger/high-water facts,
                         replayable settled range, repair continuation, quote-only extraction,
                         and affordance-bound accounting advisories (FE-1392). See N1.

packages/binding-flue              LANE 2 (translate harness ↔ Flue dialect)
├─ capabilities.ts    ✓  capability declaration — the binding's contract-of-record
├─ history-reader.ts  ✓  public SDK `history()` mapping over a host-injected URL resolver/fetch;
│                        non-writing peek + binding-private archive refresh; no private
│                        canonical/update-chunk vocabulary.
├─ archive-capability.ts ✓ binding-private write capability; callers holding `CaptureStore`
│                        cannot inject pre-classified archive entries.
├─ capture-accounting.ts ✓ recovers active-session Flue ids from session-qualified archived
│                        evidence pointers; contains no accounting policy.
├─ index.ts           ✓  useElicitation is Flue HOOK WIRING (useTool, usePersistentState,
│                        useAgentStart/useAgentFinish, useDataWriter, harness.prompt, durable
│                        step.do, ctx.append) and calls core's ask/sweep protocols (FE-1422/92).
│                        Never: elicitation semantics, store rules, prompt content.
└─ local-capture-store.ts ✓ versioned storage-port implementation (capture store + session-log
                         archive, legacy provisioning, parse-on-read, tmp+rename, per-path
                         queue). One per deploy target per binding. Never: business rules.

packages/transport-aisdk           UI REPLY WIRE (substrate-neutral)
└─ index.ts            ✓ validates Petrinaut's POST, drives an application-supplied harness turn,
                         and encodes
                         harness reply events with `ai` only. Opt-in inspection emits metadata
                         out-of-band. Never: binding/Flue imports, inference, conversation
                         rendering, or diagnostics dispatched as user evidence.

packages/plugin-gherkin            LANE 3 (target policy)
└─ index.ts           ✓  identity + one `statement-noted` ConditionStated verbatim floor;
                         strict schema forbids parsed structure and silent hardening.
                         Never: harness mechanism, substrate imports, storage.

apps/brunch-agent                  LANE 1 SHELL + remote server (imported from apps/dev)
├─ src/app.ts         ✓  single fetch entry; explicit mounts; assets beside agents
├─ src/routes.ts      ✓  the one shared mount constant (doctrine per routing guide)
├─ src/agents/gherkin-elicitor.ts ✓ thin directive-marked host (§12.1); flat file OK until
│                        the second agent (then per-agent folders, FE-1385)
├─ src/elicitation-session.ts, target-document-path.ts ✓ host-owned session/document binding,
│                        full mount URL/transport, and opaque local target path
├─ src/petrinaut-chat.ts ✓ thin Flue→harness-event→AI SDK composition; `/api/chat` mount and
│                        opt-in JSONL inspection. No second conversation renderer.
├─ src/db.ts, db-path.ts ✓ convention entry + separately testable path logic, deliberately split
├─ src/ui/chat.tsx    ~  hand-rolled client; tolerated ONLY until FE-1385 adopts @flue/react
│                        (divergence risk 1). Never: growing new part-rendering features here.
└─ test/              ✓  reviewed substrate inventory; child-process eval (audited: composed
                         from documented parts; do-not-weaken pins live here)

docs/planning/process-model-elicitation/baseline/run.ts   EXPERIMENT (transitional legacy path)
```

## Specification — where what's next lands

- **N1 (the structural repair, discharged by FE-1422 + FE-1392).**
  `packages/core/src/ask-protocol.ts` now owns pure affordance minting, the one-live guard,
  reply-binding signal payload, and instruction fragments. `packages/core/src/sweep-protocol.ts`
  owns range selection, trigger/repair decisions (including reopening the loop guard after a
  refusal), prompt content, and advisory semantics;
  `useElicitation` contributes only Flue projection, hooks, persistent-state, private-prompt,
  refresh, and durable-step wiring. A future `binding-pi` reuses both protocol modules.
- **N2 (packs and cards).** Plugin-owned content lives in plugin packages, exported as
  `defineSkill`-compatible definitions; the app's agent module _registers_ what the plugin
  exports. Never per-agent `skills/` dirs holding plugin content in the app — that puts lane-3
  policy inside lane-1, invisible to the boundary gates. Quiver (FE-1406) content is
  harness-shipped: same rule, exported from core (or a `packages/quiver`), registered by hosts.
  Card content stays assertable outside the Vite graph (fixture-grade copies; B4's probe
  decides the exact shape).
- **N3 (application composition; amended by ADR-0004 / FE-1437).** There is no dedicated demo
  shell. The standalone `apps/dev` was imported as `apps/brunch-agent`, which owns the remote
  Brunch server, target gallery, and diagnostics. `apps/petrinaut-website` owns the user-facing
  integration.
  Applications may compose Brunch and Petrinaut public surfaces; reusable libraries may not know
  about one another.
- **N4 (experiments).** Experiment runners (FE-1404, future condition reruns) stay beside their
  the JS-API pattern with `observe()` accounting — never in
  `packages/` (they are instruments, not product) and never a bespoke daemon.
- **N5 (storage-port implementations; local target discharged by FE-1391).** One per (binding ×
  deploy target), always in the binding package, always implementing core's `CaptureStore` +
  parse-on-read. The local implementation provisions a versioned target-document record around
  both capture and archive state. The Cloudflare case (per-object SQLite) is a new implementation
  behind the same port — the file-path assumption never leaks above the binding.
- **N6 (plugin-assurance, when chartered).** `packages/plugin-assurance`, same shape as
  gherkin; its existence is FE-1387's contract-freeze instrument, not a feature.

Ratification note: N1 was the only item that changed existing code; FE-1422 extracted the ask
protocol and FE-1392 continued the same repair for sweep mechanism.
N2–N6 constrain future placement. ADR-0002 records the ratification. The boundary gates in
`test/boundaries.test.ts` should learn the enforceable parts as their packages arrive (N2's
"no plugin content in app skills dirs" and N5's "port implementations only in bindings" are
both mechanically checkable).
