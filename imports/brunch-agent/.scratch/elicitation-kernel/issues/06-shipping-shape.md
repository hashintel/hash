# Shipping shape: kernel library vs. Flue agent

Type: grilling
Status: resolved
Resolved: 2026-08-07
Blocked by: 01, 04

## Question

What does the carve-out physically ship as — a kernel library that a thin Flue agent (and later Petrinaut/web/brunch hosts) embeds, or a Flue agent as the product itself — and what is the viable/ideal package structure?

Sub-questions:

- Given the Flue deep-read: is library-embedded-in-agent natural in Flue, or fighting the framework?
- What does each option cost the Petrinaut-UI and web-UI futures?
- Package topology: one package or kernel + packs as separate packages? Where do dev targets (elicit-gherkin, elicit-lean) live?
- What is the local dev loop (run against both targets) vs. the remote deploy story?

Input from Contract decomposition (issue 04): the plugin **SDK surface** is part of the shipping shape — standard machinery for evidence anchoring, claim identity, issue construction, schema validation, retries, idempotency, state-delta application, tracing, test fixtures, and a **local simulation harness** (fixture-driven pack testing: conversation in → expected claims/issues/projections out; "debugging should not require reading an entire agent transcript"). The black-box authoring test and change-surface metric are the acceptance bar.

## Answer

> Resolved by HITL grilling, 2026-08-07 (two rounds + a testing-strategy revision pass grounded in `expert-property-based-testing`).

### Root: harness library in a thin host-authored agent — ratified, with the second-binding test

The product is the **harness library** (core + packs/plugins); every host authors its own thin `'use agent'` module, `app.ts` mount, and storage adapter, and calls a hook shaped like `useElicitation(plugin)`. The Flue facts make the alternative structurally unavailable anyway (build-time `'use agent'` scan lives in the consuming project; a library cannot ship a pre-registered agent). A runnable reference app ships alongside as a dev/demo vehicle, not as the product.

**Amendment — portability as a named pressure test, not a build target.** The deliverable decomposes into (1) pure runtime mechanism, (2) a tool surface, (3) prompt/skill material — and (3) is already portable for free (Open Agent Skills format is shared by Flue, Claude Code, and Pi-family harnesses). The substrate-agnostic-core non-goal stands as written (no ports for hypothetical consumers, no second maintained binding), but the decomposition must keep a second binding *demonstrably small*:

- The spec **enumerates the substrate-facing surface as a short named capability list** the binding must supply: register a tool · contribute instructions · persist state · emit an affordance payload · suspend-for-reply · private model call. Porting = reimplementing that list; if it grows exotic Flue-shaped entries, that is an early smell signal.
- **Second-binding test** (sibling to smallest-honest-plugin, adopted into spec acceptance material): every time mechanism wants to land in the binding rather than the core, ask "is this genuinely substrate-specific, or is mechanism leaking into Flue's dialect?"
- Binding-size asymmetry is expected, not a failure: Flue's binding carries the turn-suspension compensation (ticket 10); a terminal binding gets ask-the-user nearly free but may only afford the questioning-UX markdown floor (which issue 05 already fixed as universal). Claude Code/Codex would be the awkward cousins (out-of-process: MCP server + skills dir). The core stays identical; each binding absorbs what its substrate lacks or forbids.
- **Binding** entered the glossary (`CONTEXT.md`): the harness defines the capability list; a binding imports both harness and substrate; the harness imports no substrate.

### Package topology

- **Core and Flue binding as two workspace packages from day one.** The package boundary is the enforcement mechanism for the portability property; extracting a subpath later is visible churn. Acknowledged as mild ceremony now — accepted because the cost is low if kept clean.
- **Monorepo in this repo** (brunch-lite becomes the workspace; rename is cheap once the real name resolves). Bun workspaces: `packages/core`, `packages/flue` (binding), `packages/plugin-gherkin`, `packages/plugin-proof-obligations`, `apps/dev`. The dev app owns the `'use agent'` module, `app.ts`, `db.ts`, and the Vite build Flue requires. Spec records the layout as intended structure; nothing is scaffolded during this map.
- **Plugin packages are `plugin-*`, not `elicit-*`** — the prefix names what they are architecturally; "elicit" is the function, not the identity.
- **Plugin SDK is core's public export surface** (authoring types + machinery; test/fixture machinery on a `core/testing` subpath so prod bundles stay clean). A separate SDK package would re-export core with no seam-value.
- **Dependency rule, stated as a spec invariant: plugins depend on `core` only** — never on the binding, never on Flue. Every plugin is substrate-portable by construction, and the black-box authoring test stays honest (a plugin author's world is one package's exports).
- **Envisioned horizon** (named, not built): per-substrate binding packages (`flue-<name>`, `pi-<name>`, `codex-<name>`), same harness inside each. The payoff *if the second-binding test keeps passing*, not a commitment.

### Cross-cutting choices

- **Valibot throughout** — Flue locks it at every boundary; Standard-Schema-at-the-waist would buy plugin-author comfort at the cost of a conversion seam that can silently drop constraints (named smell: silent coercion/loss).
- **Tool namespacing: prefix derived from the product name**, provisionally `bl_*` — never `elicit_*` (function vs. identity again). Core names ops abstractly; the binding renders them as substrate tool names. All model-facing tools are harness-owned (plugins expose ops, not tools).
- **Naming principle** (recurring, carried forward): architectural strings name *identity* (product, role), not *function*; the name-fog eventually resolves every one of these strings, so nothing bakes "elicit" or "brunch" into structure.
- **Publishing posture: workspace-internal** — no npm publishing until the real name resolves and an external consumer exists. The spec describes the publishable shape; publishing waits.

### Testing strategy: generation-first fixtures, deterministic replay

The scripted deterministic driver (ticket 11's headless-driver pattern) is the **execution/replay layer**: fixtures are data, replay is pure, everything runs in plain `bun test` — no model, no substrate. But hand-written fixtures demote to **seeds**; the corpus is generated, answering the two untruthfulness modes:

1. **Circularity** (fixtures tailored to the plugin-as-written): properties come from the **kernel contract** — the ten kernel invariants (ticket 04) are literally properties (re-sweep idempotence, equivalent-state → equivalent-projection, corrections don't erase history, retries idempotent, …) — and generators come from the **plugin's declarations**, never its implementation. The SDK ships `arbitraryFromSchema` (Valibot → fast-check arbitraries) for generated capture populations, plus negative-space properties for plugin code (validators total: never throw, always typed issues; `project` never emits an undeclared loss category).
2. **Unrealistic conversational dynamics**: (i) most invariants hold over capture/state space directly — no conversation needed; (ii) where dynamics are the subject (sweep/settlement, supersession, absences), **model-based command-sequence testing** (`fc.commands`) over a small command alphabet — utter · settle-range · sweep · correct · contradict · reply-with-absence · redirect — derived from the envelope vocabulary; the fuzzer explores interleavings no hand-scripted conversation contains; (iii) language realism via a **model as offline generator, never CI oracle**: a model plays the respondent against the plugin's own kernel cards (Detects/Questions = targeting spec), varied by persona/curveball, plus a **mutation library** generalizing the minimal-pairs test (epistemic-status flips, absence injections, supersession injections). Outputs freeze as replayable fixture files; **regenerate when declarations change** (the anti-drift mechanism).

Bonus adopted: shrunk counterexamples from broken invariants *are* minimal pathological conversations — pinned as regressions and read first as type-design feedback on envelope/payload types. SDK surface therefore includes: schema-driven arbitraries, the command alphabet, mutation operators, fixture freeze/replay format — alongside ticket 04's list (evidence anchoring, capture identity, issue construction, retries, tracing).

### Dev loop, demo, deploy

- **One agent per target** in one dev app (`ElicitGherkin`, `ElicitProofObligations`): static per-agent tool sets (Flue cache economics), and the shape Cloudflare forces later anyway (build-time agent set; plugin choice is conversation-lifetime-immutable via `initialData` regardless).
- **The dev app is chartered with three roles, spec'd as roles not features**: (1) local dev loop against both plugins; (2) the colleague-facing **target-gallery demo** — parallel tabbed sessions: start a BDD-spec elicitation, open another tab for a proof obligation, another for a process model; (3) the diagnostic/probe surface — provisional affordance renderers now (the deferred UI package's exploratory material), exploded-view instrumented readout when it graduates. Demo-polish and probe-internals pull opposite ways, so they are different views/routes of one app.
- **UI affordance package deferred**: spec names it as intended (React renderers + reply transport over `@flue/react`; non-React hosts build on `@flue/sdk`), milestone one keeps renderers in the dev app.
- **Remote deploy: milestone one is local-only; the spec pins the remote-parity constraints** (one-agent-many-conversations, pinned `agentName`, host-owned storage port, no dynamic agent creation) so nothing local-only creeps in. CI smoke = `vite build` + the simulation suite (no model key, no flake); an optional secret-gated real-model `flue run` smoke once a provider key exists. Actual deploy-target choice waits on an infra conversation (user, 2026-08-07) and blocks nothing on this map.
