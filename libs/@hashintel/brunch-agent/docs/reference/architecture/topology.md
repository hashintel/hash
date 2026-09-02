# Topology: verification and specification

**Status: ratified 2026-08-17 (Lu), application layout updated 2026-08-31 — recorded as [ADR-0002](../../adr/0002-topology-and-placement-rules.md); this file remains the living reference.** Verifies the current app/package topology against the three-lane model (cheatsheet, boundary summary), spec §12.2, and Flue's project-layout guide; then specifies where upcoming work lands. Pseudo-style: tree nodes with rules; `✓` complies today, `✗` violates, `→` normative rule for what's next.

## Verification — the tree as it stands

```text
packages/core                      CORE HARNESS + Flue-native agent contribution
├─ prompts/SYSTEM.md  ✓ authoritative context- and formalism-independent always-on prompt
├─ skills/elicitation/ ✓ core's one capability skill: `SKILL.md` + `references/universal-elicitation.md`,
│                        packaged through `skills/skill-markdown.ts` and mounted by `flue.ts`
├─ flue.ts            ✓ `useBrunchAgent()`: model, elicitation skill, returned core prompt (`./flue`)
├─ evidence/          ✓ active capture-store and archived-session evidence authority
├─ conversation/      ✓ tool naming and the harness reply-event contract
├─ _suspended/conversation/ ○ compiled ask/affordance and settlement protocols; not mounted;
│                        re-exported only for contracts other packages still type against
├─ client-tools.ts    ✓ public browser/client contract subpath
├─ storage.ts         ✓ binding-only public facade over archived-session evidence
├─ index.ts           ✓ substrate-neutral evidence and contract facade
└─ json-value.ts,
   readonly-deep.ts   ✓ package-wide representation primitives, not a generic utility directory
   (plugin/, teaching/, interpretation/, prompts.ts, testing/, and schema/ — the YAML plugin
    definition, repertoire, and typed interpretation machinery — were removed 2026-09-02)

packages/binding-flue              LANE 2 (translate harness ↔ Flue dialect)
├─ capabilities.ts    ✓  capability declaration — the binding's contract-of-record
├─ history-reader.ts  ✓  public SDK `history()` mapping over a host-injected URL resolver/fetch;
│                        non-writing peek + binding-private archive refresh; no private
│                        canonical/update-chunk vocabulary.
├─ archive-capability.ts ✓ binding-private write capability; callers holding `CaptureStore`
│                        cannot inject pre-classified archive entries.
├─ capture-accounting.ts ✓ recovers active-session Flue ids from session-qualified archived
│                        evidence pointers; contains no accounting policy.
├─ index.ts           ✓  active public history, reply-projection, and local-store adapters only
└─ local-capture-store.ts ✓ versioned storage-port implementation (capture store + session-log
                         archive, legacy provisioning, parse-on-read, tmp+rename, per-path
                         queue). One per deploy target per binding. Never: business rules.

packages/transport-aisdk           UI REPLY WIRE (substrate-neutral)
└─ index.ts            ✓ validates Petrinaut's POST, drives an application-supplied harness turn,
                         and encodes
                         harness reply events with `ai` only. Opt-in inspection emits metadata
                         out-of-band. Never: binding/Flue imports, inference, conversation
                         rendering, or diagnostics dispatched as user evidence.

packages/plugin-gherkin            TARGET POLICY + Flue-native contribution bundle (not yet composed)
├─ index.ts           ✓  pairing identity only (YAML definition removed 2026-09-02)
├─ prompts/APPEND_SYSTEM.md ✓ optional always-on plugin append
├─ skills/gherkin-specification/ ✓ `SKILL.md` + `references/` + `templates/`; routes to core `elicitation`
└─ flue.ts            ✓  `useGherkinPlugin()`; no tools until a real parser/binding capability exists

packages/plugin-dafny              STUB contribution bundle (topology pressure test; not composed)
├─ prompts/APPEND_SYSTEM.md, skills/dafny-verification/SKILL.md, flue.ts — placeholder homes only

packages/plugin-sdcpn              TARGET POLICY + Flue-native production contribution
├─ index.ts           ✓  pairing identity only (YAML definition removed 2026-09-02)
├─ prompts/APPEND_SYSTEM.md ✓ compact always-on SDCPN append
├─ skills/sdcpn-modelling/ ✓ `SKILL.md` + `references/{profile,pn-construction,checks}.md`
│                        + `templates/workpiece.md`; activates core `elicitation` for human knowledge
├─ flue.ts            ✓  `useSdcpnPlugin()`: append, job skill, doc tool, conditional construction tools
└─ tools/
   ├─ petrinaut-construction.ts ✓ bounded, schema-validated SDCPN realization tools
   └─ read-petrinaut-doc.ts     ✓ Petrinaut editor guidance exposed as a client-executed tool

apps/brunch-agent                  LANE 1 SHELL + remote server (imported from apps/dev)
├─ src/app.ts, db.ts  ✓  Flue convention authorities: one route map and one conversation adapter
├─ src/db-path.ts     ✓  testable package-relative path policy kept at source root because the
│                        same relative URL must survive Flue's flattened `dist/` bundle
├─ src/agents/chat-agent/
│  ├─ agent.ts        ✓  sole directive-marked registration and composition point: generic core,
│  │                     selected SDCPN/Petrinaut plugin, and deployment instructions
│  └─ tools/ping.ts   ✓  app-only server-path diagnostic
├─ src/http/          ✓  HTTP authority: assets, route names, ownership guard, local origins,
│                        and `/api/chat` composition
├─ src/conversation/  ✓  identity and projection authority: shared payload, client-tool signal,
│                        Flue-history transcript, and AI SDK stream projection
├─ src/capture/       ✓  Mission 2 application composition over binding-owned history/store ports;
│                        no elicitation policy
├─ src/evaluations/runbook/ ✓ runbook experiment drivers, artifact recovery, and headless client;
│                        not product runtime authority
├─ src/diagnostics/   ✓  operator-facing transcript CLI
├─ src/ui/            ~  hand-rolled client; tolerated ONLY until FE-1385 adopts @flue/react
│                        (divergence risk 1). Never: growing new part-rendering features here.
└─ test/              ✓  reviewed substrate inventory; child-process eval (audited: composed
                         from documented parts; do-not-weaken pins live here)
```

## Specification — where what's next lands

- **N1 (the structural repair, discharged by FE-1422 + FE-1392).**
  `packages/core/src/conversation/ask-protocol.ts` now owns pure affordance minting, the one-live guard,
  reply-binding signal payload, and instruction fragments. `packages/core/src/conversation/sweep-protocol.ts`
  owns range selection, trigger/repair decisions (including reopening the loop guard after a
  refusal), prompt content, and advisory semantics;
  `useElicitation` contributes only Flue projection, hooks, persistent-state, private-prompt,
  refresh, and durable-step wiring. A future `binding-pi` reuses both protocol modules.
- **N2 (plugin cells, repertoire, and the proving runbook; amended by ADR-0007, ADR-0008, Mission 3, and FE-1563; retired 2026-09-02).** The YAML cell/repertoire machinery described here was removed on 2026-09-02 once plugins became Flue-native contribution bundles; this paragraph is history. Reusable plugin-owned policy lives in plugin packages, and harness-owned repertoire teaching lives in core behind `@hashintel/brunch-agent/prompts`; plugins may not import that guarded prompt data. FE-1563 established a separate Flue-native production seam: core's `./flue` subpath supplies the stable agent prompt, while plugin-sdcpn's `./flue` subpath and exported `SKILL.md` supply SDCPN prompt material, progressive teaching, and target-specific tools. This does not reactivate the generalized repertoire/`useElicitation()` runtime. The app retains only the directive-marked registration point and host-specific capabilities. The committed YAML remains directly assertable outside the bundle.
- **N3 (application composition; amended by ADR-0004 / FE-1437).** There is no dedicated demo
  shell. The standalone `apps/dev` was imported as `apps/brunch-agent`, which owns the remote
  Brunch server, target gallery, and diagnostics. `apps/petrinaut-website` owns the user-facing
  integration.
  Applications may compose Brunch and Petrinaut public surfaces; reusable libraries may not know
  about one another.
- **N4 (experiments).** Experiment runners live under the consuming app's `src/evaluations/`, use the JS-API pattern with `observe()` accounting, and never enter `packages/` or become bespoke daemons. Reusable cases, oracles, and protocols remain under the context-root `evaluations/`; observed output remains under `docs/evidence/evaluations/`.
- **N5 (storage-port implementations; local target discharged by FE-1391).** One per (binding ×
  deploy target), always in the binding package, always implementing core's `CaptureStore` +
  parse-on-read. The local implementation provisions a versioned target-document record around
  both capture and archive state. The Cloudflare case (per-object SQLite) is a new implementation
  behind the same port — the file-path assumption never leaks above the binding.
- **N6 (plugin-assurance, when chartered).** `packages/plugin-assurance`, same shape as
  gherkin; its existence is FE-1387's contract-freeze instrument, not a feature.

Ratification note: N1 was the only item that changed existing code in the original 2026-08-17 ratification; FE-1422 extracted the ask protocol and FE-1392 continued the same repair for sweep mechanism. Mission 3 later narrowed N2's blanket app-skill prohibition for one directly authored proving instrument without reactivating plugin composition. N2–N6 otherwise constrain future placement. ADR-0002 records the original ratification. The boundary gates in `test/boundaries.test.ts` should learn enforceable package rules as their packages arrive; N5's "port implementations only in bindings" remains mechanically checkable.
