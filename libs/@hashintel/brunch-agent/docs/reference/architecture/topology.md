# Topology: verification and specification

**Status: living package-tree map.** Original ratification 2026-08-17 (ADR-0002); transport
updated by Mission 5. This file records where code lives now. It is not a placement roadmap
and not a capture-store or YAML-plugin plan. `✓` complies today; `○` exists but is unmounted
or rejected as product provenance.

## Verification — the tree as it stands

```text
packages/core                      CORE + Flue-native agent contribution
├─ prompts/SYSTEM.md  ✓ authoritative context- and formalism-independent always-on prompt
├─ skills/elicitation/ ✓ core's one capability skill: `SKILL.md` + `references/universal-elicitation.md`,
│                        packaged through `skills/skill-markdown.ts` and mounted by `flue.ts`
├─ flue.ts            ✓ `useBrunchAgent()`: model, elicitation skill, returned core prompt (`./flue`)
├─ evidence/          ○ capture-store code still exported; rejected as product provenance on
│                        2026-09-04. Archived-session evidence remains the binding-owned archive lane.
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

packages/transport-aisdk           BROWSER FLUE → AI SDK PROJECTION
├─ index.ts            ✓ adapts one caller-supplied public `FlueClient` to an AI SDK `ChatTransport`;
│                        sends one user message or client-tool-result signal and follows only the
│                        admitted submission. Never: `@flue/runtime`, core, plugin, or binding imports.
├─ ui-stream.ts        ✓ projects Flue conversation chunks into one finite AI SDK response stream
├─ transcript.ts       ✓ projects SDK-maintained canonical state into renderable UI messages
└─ identity.ts         ✓ browser-safe principal + logical-conversation identity and ownership headers

packages/plugin-gherkin            TARGET POLICY + Flue-native contribution bundle (not yet composed)
├─ index.ts           ✓  pairing identity only (YAML definition removed 2026-09-02)
├─ prompts/APPEND_SYSTEM.md ✓ optional always-on plugin append
├─ skills/gherkin-specification/ ✓ `SKILL.md` + `references/` + `templates/`; routes to core `elicitation`
└─ flue.ts            ✓  `useGherkinPlugin()`; no tools until a real parser/binding capability exists

packages/plugin-dafny              STUB contribution bundle (topology pressure test; not composed)
├─ prompts/APPEND_SYSTEM.md, skills/dafny-verification/SKILL.md, flue.ts — placeholder homes only

packages/plugin-claims             STUB contribution bundle (normative-source interference probe; not composed)
├─ index.ts, flue.ts, skills/claims-formalization/ — pairing identity, append, and job skill;
│                        no ledger API or application mount

packages/plugin-sdcpn              TARGET POLICY + Flue-native production contribution
├─ index.ts           ✓  pairing identity only (YAML definition removed 2026-09-02)
├─ prompts/APPEND_SYSTEM.md ✓ compact always-on SDCPN append
├─ skills/sdcpn-modelling/ ✓ `SKILL.md` + `references/{profile,pn-construction,checks}.md`
│                        + `templates/workpiece.md`; activates core `elicitation` for human knowledge
├─ flue.ts            ✓  `useSdcpnPlugin()`: append, job skill, doc tool, ordinary batched
│                        construction, and retained legacy/headless fixture modes
└─ tools/
   ├─ mutate-petrinet.ts ✓ one ordinary model-facing root-net carrier over the selected
   │                        canonical Petrinaut actions
   ├─ petrinaut-construction.ts ✓ bounded individual realization tools retained for
   │                              headless and legacy test modes
   └─ read-petrinaut-doc.ts     ✓ Petrinaut editor guidance exposed as a client-executed tool

apps/brunch-agent                  LANE 1 SHELL + remote server (imported from apps/dev)
├─ src/app.ts, db.ts  ✓  Flue convention authorities: one route map and one conversation adapter
├─ src/db-path.ts     ✓  testable package-relative path policy kept at source root because the
│                        same relative URL must survive Flue's flattened `dist/` bundle
├─ src/agents/chat-agent/
│  ├─ agent.ts        ✓  sole directive-marked registration and composition point: generic core,
│  │                     selected SDCPN/Petrinaut plugin, and deployment instructions
│  └─ tools/ping.ts   ✓  app-only server-path diagnostic
├─ src/http/          ✓  HTTP authority: assets, mounted route names, ownership guard, and local origins;
│                        `/agents/chat/:instanceId` is the sole Brunch conversation door
├─ src/conversation/  ✓  server identity verification, client-tool results, current-net
│                        freshness, candidate history projection, current-revision explanation,
│                        and operator transcript; browser AI SDK projection lives in `transport-aisdk`
├─ src/worked-model-store.ts ✓ app-owned build-fixture catalogue and principal-copy contract;
│                              Postgres implementation stays beside it in its private subtree
├─ src/http/worked-models.ts ✓ principal-owned bundle resolution, clean-copy and definition-update API
├─ src/capture/       ✓  Mission 2 application composition over binding-owned history/store ports;
│                        no elicitation policy
├─ src/evaluations/runbook/ ✓ runbook experiment drivers, artifact recovery, and headless client;
│                        not product runtime authority
├─ src/diagnostics/   ✓  operator-facing transcript CLI
├─ src/ui/            ✓  local diagnostics client only; do not grow part-rendering here.
│                        `@flue/react` remains appropriate for this debug UI (spine later concerns).
└─ test/              ✓  reviewed substrate inventory; child-process eval (audited: composed
                         from documented parts; do-not-weaken pins live here)
```

## Ordinary browser-bound Brunch tools

[`apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts`](../../../../../apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts)
is the checked name/ownership map. The native-provider carriage probe compares
the live mounted names against it through both provider entrypoints and fails
on duplicates, additions, removals or ordering drift. It records no schemas;
those remain with their definition owners.

| Name | Definition owner | Execution owner | Role |
| --- | --- | --- | --- |
| `task` | Flue | Flue | substrate delegation |
| `activate_skill` | Flue | Flue | skill activation |
| `read_skill_resource` | Flue | Flue | skill resource read |
| `brunch_mark_question` | Brunch core | Brunch app | question relay metadata |
| `update_workpiece` | Brunch core | Brunch app | durable workpiece write |
| `readPetrinautDoc` | Petrinaut canonical contract | Petrinaut website | guide read |
| `getLatestNetDefinition` | Petrinaut Core | Petrinaut website | current document read |
| `getNetCompilationErrors` | Petrinaut Core | Petrinaut website | diagnostics read |
| `applyAutoLayout` | Petrinaut Core | Petrinaut website | recorded layout mutation |
| `mutate_petrinet` | SDCPN plugin over Petrinaut actions | Petrinaut website | selected root-net mutation carrier |
| `brunch_workpiece` | Brunch core | Brunch app | workpiece/source/locator read |
| `brunch_why` | Brunch app today; split under Mission 7c review | Brunch app | current-model explanation |
| `ping` | Brunch app | Brunch app | server diagnostic |

Stock Petrinaut has its own canonical individual AI-tool surface and history.
Legacy/headless Brunch modes still mount individual construction tools for
their bounded tests; they are not the ordinary product surface.

## Current placement locks

These replace the old N1–N6 "where next work lands" list. Retired N items (ask/sweep remount,
YAML repertoire, plugin-assurance-for-symmetry) are history in [ADR-0002](../../adr/0002-topology-and-placement-rules.md).

- **App vs libraries.** `apps/brunch-agent` is the registration and host-composition shell.
  `apps/petrinaut-website` owns the user-facing integration. Applications may compose public
  surfaces; reusable libraries may not know about one another.
- **Flue-native contributions.** Core and plugins expose production resources through `./flue`
  subpaths. Plugins depend inward on core, never on bindings. Transport never depends on a
  binding. Suspended code stays under `src/_suspended/` and is never mounted.
- **Experiments.** Runners live under the consuming app, use the JS-API `observe()` pattern, and
  never enter `packages/`. Cases, oracles, and protocols stay in context-root `evaluations/`;
  observed output stays under `apps/brunch-agent/.data-wipe-me/evaluations/`.
- **Durable state.** Workpiece revisions settle in per-conversation state; Flue `history()` is
  the conversation log. Binding-owned storage ports may implement the session-log archive lane
  per deploy target; they must not revive capture envelopes as the document of record. File-path
  assumptions never leak above the binding.
