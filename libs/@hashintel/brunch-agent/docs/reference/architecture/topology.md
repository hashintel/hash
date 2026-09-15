# Topology: verification and specification

**Status: living package-tree map.** Original ratification 2026-08-17 (ADR-0002); transport
updated by Mission 5. This file records where code lives now. It is not a placement roadmap
and not a capture-store or YAML-plugin plan. `✓` complies today.

## Verification — the tree as it stands

```text
packages/core                      CORE + Flue-native agent contribution
├─ prompts/SYSTEM.md  ✓ authoritative context- and formalism-independent always-on prompt
├─ skills/elicitation/ ✓ core's one capability skill: `SKILL.md` + `references/universal-elicitation.md`,
│                        packaged through `skills/skill-markdown.ts` and mounted by `flue.ts`
├─ flue.ts            ✓ `useBrunchAgent()`: model, elicitation skill, returned core prompt (`./flue`)
├─ conversation/      ✓ tool naming, ask contract, and the harness reply-event contract
├─ client-tools.ts    ✓ public browser/client contract subpath
├─ index.ts           ✓ substrate-neutral contract facade
└─ json-value.ts,
   readonly-deep.ts   ✓ package-wide representation primitives, not a generic utility directory
   (plugin/, teaching/, interpretation/, prompts.ts, testing/, and schema/ — the YAML plugin
    definition, repertoire, and typed interpretation machinery — were removed 2026-09-02)

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
├─ worked-model-net-projection.ts ✓ `./worked-model` wire parse/type for principal-owned
│                        net projections; not mounted into the Flue contribution
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
├─ src/worked-model-store.ts ✓ app-owned build-fixture catalogue and persistence of principal
│                              net projections; plugin `./worked-model` owns the wire parse/type.
│                              Postgres implementation stays beside it in its private subtree
├─ src/http/worked-models.ts ✓ legacy-path GET/POST/PUT API for resolving, refreshing and updating
│                              principal-owned net projections
├─ src/evaluations/runbook/ ✓ runbook experiment drivers, artifact recovery, and headless client;
│                        not product runtime authority
├─ src/diagnostics/   ✓  operator-facing transcript CLI
├─ src/ui/            ✓  local diagnostics client only; do not grow part-rendering here.
│                        `@flue/react` remains appropriate for this debug UI (spine later concerns).
└─ test/              ✓  reviewed substrate inventory; child-process eval (audited: composed
                         from documented parts; do-not-weaken pins live here)

apps/petrinaut-website/src/main/app/local-storage-demo
├─ documents/document-repository.ts ✓ storage-neutral document/source/controller contracts and
│                                      the typed process-agent seed
├─ documents/local-storage/
│  ├─ use-local-document-repository.ts ✓ ordinary browser-local persistence
│  └─ use-fixture-document-overlay.ts  ✓ local-only prepared-fixture decorator
├─ documents/remote/
│  ├─ use-remote-document-repository.ts ✓ worked-model source and read-only title boundary
│  ├─ use-worked-model-net-projection.ts ✓ queued identity-explicit remote revision persistence
│  └─ worked-model-net-projection-client.ts ✓ principal-scoped GET/POST/PUT net projection
├─ documents/use-document-controller.ts ✓ the only host seam that crosses document sources
└─ assistants/brunch/use-process-agent-binding.ts ✓ document/incarnation/conversation binding;
                                                     consumes the typed seed without choosing storage
```

Route identity selects the local or remote source; assistant preference does
not. A repository owns document persistence, while the controller creates a
local document before crossing from a remote route. The process-agent binding
owns conversation identity. Remote worked-model titles are inherited and
read-only because that repository exposes no rename action. This
repository/controller/binding authority split remains valid.

A worked-model copy must preserve one independently writable, complete
connected bundle: retained conversation/session, workpiece history and current
revision, Petrinaut document and revision history, net, mutation provenance and
the links among them. The landed GET/POST/PUT and remote repository path is an
explicitly incomplete net projection: the fixture catalogue packages session,
workpiece and net, but the path currently projects only the net under fresh
document, incarnation and empty-conversation identities. Workpiece or history
created inside that projection proves post-open behavior only, not fixture
bundle copying, identity remapping or provenance preservation.

## Ordinary browser-bound Brunch tools

[`apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts`](../../../../../../apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts)
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
| `mutate_workpiece` | Brunch core | Brunch app | durable full-revision write with recorded delta |
| `read_petrinaut_net` | Petrinaut Core | Petrinaut website | current document read |
| `read_petrinaut_docs` | Petrinaut Core | Petrinaut website | user-guide read |
| `read_petrinaut_diagnostics` | Petrinaut Core | Petrinaut website | diagnostics read |
| `layout_petrinaut_net` | Petrinaut Core | Petrinaut website | recorded layout mutation |
| `mutate_petrinaut_net` | SDCPN plugin over Petrinaut actions | Petrinaut website | selected root-net mutation carrier |
| `read_workpiece` | Brunch core | Brunch app | workpiece/source/locator read |
| `query_workpiece` | Brunch app | Brunch app | current-model explanation and provenance query |
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
  subpaths. Plugins and transport depend only inward on core, never on one another or an
  application; core depends on no sibling package. Production source never imports test code.
  [`apps/brunch-agent/test/architecture/import-direction.test.ts`](../../../../../../apps/brunch-agent/test/architecture/import-direction.test.ts)
  is the mechanical gate for these directions.
- **Reachability audits.** Run
  `yarn exec depcruise --no-config --ts-pre-compilation-deps --output-type json apps/brunch-agent/src apps/brunch-agent/test libs/@hashintel/brunch-agent/packages`
  for an ad-hoc import graph. Process launches by filename and mission-named oracles are real edges
  that this command does not model.
- **Experiments.** Runners live under the consuming app, use the JS-API `observe()` pattern, and
  never enter `packages/`. Cases, oracles, and protocols stay in context-root `evaluations/`;
  observed output stays under `apps/brunch-agent/.data-wipe-me/evaluations/`.
- **Durable state.** Workpiece revisions settle in per-conversation state; Flue `history()` is
  the conversation log. A future archive or cross-conversation projection must name a current
  consumer and owner; it must not revive capture envelopes as the document of record.
