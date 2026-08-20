# Flue architecture cheat sheet

An architect's consolidation of the Flue documentation — all 21 guide entrypoints, fetched
2026-08-17 — organized by *our* concerns: the demo shell, the binding boundary, and the
FE-1383/FE-1357 roadmap. Purpose (Lu's charter): align with recommended patterns and use
provided affordances *before* we diverge by building layers we don't need or drawing
boundaries in the wrong place. Companion to the narrower usage audit
([`flue-patterns-audit-2026-08-17.md`](flue-patterns-audit-2026-08-17.md)); same caveat —
WebFetch summarizes, so unquoted API details are paraphrase-grade.

Link form: every page has a markdown mirror at `<url>/index.md`.

---

## 1. App shell & runtime

[project-layout](https://flueframework.com/docs/guide/project-layout/) ·
[node-target](https://flueframework.com/docs/guide/node-target/) ·
[deploy](https://flueframework.com/docs/guide/deploy/)

**Affordances**

| Thing | What it is |
| --- | --- |
| `app.ts` | Route map + server entry. Required; convention-discovered |
| `db.ts` / `cloudflare.ts` | Optional convention-discovered entries |
| Source-dir resolution | `.flue/` → `src/` (recommended) → root; first match wins, no merging |
| `flue.config.ts` | Explicit overrides: entry paths, `providers` allowlist, `target` |
| Multi-agent layout | `src/agents/<name>/` with per-agent `skills/`, `tools/`, plus `shared/` |
| Build | `vite build` → `dist/server.mjs` (self-starting) + `dist/app.mjs` (embeddable) |
| Node server | Port 3000 / `PORT`; production reads env at startup only — **`.env` is dev-only** |
| Ownership | One live process owns a conversation; leases + expiry scans; multi-replica needs routing |

**Recommended pattern.** Let convention discover the entries; keep explicit config minimal;
deploy `dist/server.mjs` with a real `db.ts` adapter (in-memory default loses everything).

**For brunch-lite.** `apps/dev` matches: `src/app.ts`, `src/db.ts`, `flue.config.ts` with
`target: 'node'` + `providers: ['anthropic']`. The multi-agent layout (`src/agents/`) is
already our shape. *Do not rebuild*: the demo shell should be this same layout, not a custom
server — `dist/app.mjs` exists precisely for embedding if the shell needs a custom host.
*Boundary implication*: single-owner-per-conversation is a **deployment** constraint, not a
harness one — it belongs in demo-shell ops notes, not in the binding.

## 2. Agent definition & loop

[building-agents](https://flueframework.com/docs/guide/building-agents/) ·
[agent-hooks](https://flueframework.com/docs/guide/agent-hooks/) ·
[models](https://flueframework.com/docs/guide/models/) ·
[subagents](https://flueframework.com/docs/guide/subagents/)

**Affordances**

| Hook | Purpose | We use |
| --- | --- | --- |
| `useModel(spec, opts?)` | Declares the LLM; fails fast on unknown specifier; opts: `thinkingLevel`, `compaction` (`reserveTokens`, `keepRecentTokens`, `model`) | ✓ (no opts) |
| `useTool` | Mount a tool | ✓ |
| `usePersistentState` | Durable per-conversation state; **updater form documented**: "ensures the callback always accesses the latest written value, not a stale render snapshot" | ✓ |
| `useAgentStart` | "Runs every time a message is delivered to the agent"; async, pre-inference | ✓ |
| `useAgentFinish`, `useResponseStart`, `useResponseFinish` | Lifecycle; `useResponseFinish` receives the response's aggregate token usage | ✗ |
| `useDataWriter` | One-way agent→client structured stream; model never sees it | ✓ |
| `useInitialData` | Creation-time structured data, recorded once | ✗ |
| `useDelivery` | Metadata of the current delivery (from channels guide) | ✗ |
| `useSubagent` | Named delegate; own frame, own context window; parent sees **only the final message** via the `task` tool; per-delegate `model`/`thinkingLevel` override | ✗ |
| `useSkill`, `useMcpConnection`, `useSandbox` | See §3 | ✗ |

Render model: the agent function re-runs before every model call and rebuilds instructions
from scratch (deliberately React-like). Event hook callbacks run **at-least-once** — the docs
themselves say to guard non-idempotent side effects with persistent state.

**Two audit ambiguities resolved by this page.** The earlier audit (which read the agent-api
*reference*, not this guide) filed `useAgentStart` firing and updater composition as
undocumented semantics pinned only by our integration test. The agent-hooks guide documents
both: per-delivery firing, and the updater-not-snapshot rule. Downgrade both from
"undocumented bet" to "documented, keep the test as a pin".

**For brunch-lite.** Our binding is canonical in every hook it touches. Unused affordances
that map directly onto roadmap items:

- *FE-1392 (settlement trigger)*: `useAgentFinish`/`useResponseFinish` are the documented
  seam. At-least-once hook execution is exactly why the store's content-keyed sweep dedup
  exists — the two designs interlock; say so in the ticket.
- *Capability 6 (private model call)*: **`useSubagent` is the affordance.** A sweep/extraction
  delegate gets a fresh frame, its own (cheaper) model, and returns only its final message —
  capture extraction never pollutes the interview conversation. Strong candidate shape for
  FE-1392's sweep executor; do not hand-roll a second model client inside the binding.
- *FE-1386 (compaction spike)*: `useModel`'s `compaction` options are the knobs under test;
  read them before designing the spike.

## 3. Capability surface

[tools](https://flueframework.com/docs/guide/tools/) ·
[mcp](https://flueframework.com/docs/guide/mcp/) ·
[skills](https://flueframework.com/docs/guide/skills/)

**Affordances**

- `defineTool({ name, description, input, output, run })` — Valibot schemas both ways;
  invalid input never reaches `run`; result envelope `{ output?, terminate? }`;
  `terminate: true` ends the turn after the batch settles. Context: `signal`, `log`,
  `toolCallId`; flags `harness: true`, **`durable: true`** (adds `step`).
- **Durable tools**: `step.do(name, fn)` — "exactly-once-recorded, at-least-once-executed";
  completed steps replay their recorded values on recovery. Ordinary tools are *not*
  re-executed after crashes; they settle as unknown-outcome errors.
- Reserved names: `read`, `write`, `edit`, `bash`, `grep`, `glob`, `task`, `activate_skill`,
  `read_skill_resource`.
- **Skills**: markdown expertise loaded on demand. Mounted skills appear as name+description
  in the prompt; the model calls `activate_skill` for full instructions — progressive
  disclosure that preserves the cached prompt prefix. Supporting files served read-only.
  `useSkill(import)` or `defineSkill({...})` inline; auto-discovery from
  `.agents/skills/<name>/SKILL.md`. `useInstruction()` for always-on content.
- **MCP**: `useMcpConnection({ name, url, auth, tools?, optional? })`;
  `createMcpConnection()` returns raw `ToolDefinition`s for filtering/wrapping.

**For brunch-lite.** The ask tool is canonical (validated output part + `terminate`). Three
do-not-rebuild warnings, one large:

- **FE-1403/FE-1406 (guidance cards, quiver): Flue skills *are* the card-delivery
  mechanism.** A kernel card (Detects / Goal / Questions / Artifacts) is a skill with a
  when-to-use description and on-activation instructions; the activation-probe economy
  (penciled item 4 — cheap name-only cards vs. expensive content cards) maps exactly onto
  name+description-in-prompt vs. full-instructions-on-activation. `defineSkill` gives packs a
  programmatic authoring path. Do not invent a card loader inside the harness; compile packs
  *to* skills in the binding.
- *FE-1392*: if sweep application does side-effectful writes from inside a tool, mark it
  `durable: true` and wrap the store write in `step.do` — recorded-once semantics compose
  with (not replace) the store's own dedup.
- `useInstruction()` exists — instruction assembly in the binding should route through it
  rather than string-returning alone, when guidance grows past one page.

## 4. Conversation & UI transport

[channels](https://flueframework.com/docs/guide/channels/) ·
[react](https://flueframework.com/docs/guide/react/) ·
[routing](https://flueframework.com/docs/guide/routing/)

**Affordances**

- Routing: `createAgentRouter(agent)`; mount path ≠ identity (documented doctrine);
  HTTP surface = POST `/:id` (202, fire-and-forget) · GET `/:id` (snapshot;
  `?view=updates&offset=…` for SSE/long-poll) · `/:id/abort` · attachments. `dispatch()` for
  server-side delivery with no mount. Auth is app middleware in `app.ts`.
- **React: `useFlueAgent()`** — binds one conversation URL to React state: durable-history
  reconstruction, live streaming, optimistic sends, `status`/`historyReady`. Messages are
  parts-based: `text`, `reasoning`, **`dynamic-tool`** (validated tool output on `.output`),
  `file` (ready `url`). Custom client via memoized `createFlueClient()` passed as
  `{ client }`; the same client also does `observe()`/`wait()`/`read()`.
- Channels: inbound-only verified ingress → `dispatch` as `kind: 'signal'` with namespaced
  `type` and `attributes`; outbound stays in app code via provider SDKs.

**For brunch-lite.** This section carries the single biggest do-not-rebuild finding:
**`chat.tsx` is a hand-rolled fraction of `useFlueAgent()`.** Our custom fetch/parse loop,
message filtering, and affordance extraction re-implement what the React package provides —
including the part we got wrong (the markdown floor, FE-1420): the affordance *is* the ask
tool's validated output, delivered as a `dynamic-tool` part whose `.output` is exactly what a
renderer should switch on, with text parts as the natural fallback. Rebuilding the dev UI (and
building FE-1385's gallery/probe surface and the demo shell) on `useFlueAgent` deletes our
transport code and fixes the floor in the same motion. Recommend: adopt at FE-1385 /
demo-shell time; fold the note into FE-1420 now so the floor fix isn't built twice.

Also: the kickoff non-utterance (FE-1420 comment) has a canonical answer — creation-time
intent belongs in `useInitialData` (recorded once, structurally non-user) or a dispatched
`signal`, per the channels pattern. And the harness's own reply-binding signal already matches
the channels guide's signal shape — convergent with canon.

## 5. Persistence & durability

[database](https://flueframework.com/docs/guide/database/) ·
[durability](https://flueframework.com/docs/guide/durability/)

**Affordances / guarantees**

- Flue stores exactly three record families: canonical conversation streams (append-only,
  including compaction and recovery facts), accepted submissions, persisted-state writes.
  **"Your application should manage its own data store separately."**
- `migrate()` provisions Flue's tables idempotently, format-versioned; incompatible versions
  refuse to start.
- Accepted-work contract: every submission reaches exactly one durable terminal outcome;
  per-conversation ordering; "at-least-once execution over exactly-once recording".
  `usePersistentState` writes commit atomically with their unit of work.
- Not guaranteed: sandbox files, external side effects, local promises (persist the
  `DispatchReceipt`, re-attach with `read(receipt)`), arbitrary code checkpointing.
- Compaction: context-overflow compacts and retries the turn; the durability page gives **no
  detail on history retention through compaction** — our FE-1386 question is real and the
  docs don't answer it.

**For brunch-lite.** Canon explicitly endorses the storage-port split: captures are business
data, Flue's store is the conversation record — the boundary we drew is the boundary the
database guide draws. Two implications:

- *FE-1391 (archive)*: the "durable entry projection" we plan to archive **is Flue's
  canonical stream**, read over the documented GET surface. Archive-on-read should *consume*
  that stream, never shadow-record entries a second time from inside hooks. The spec's line
  ("the substrate's conversation store is the live transport copy, never the provenance
  record") is about *retention authority*, not about re-capturing — the archive copies out of
  the canonical stream on read, into the target-document's storage.
- The capture store should adopt Flue's own persistence manners: a `migrate()`-style
  idempotent, format-versioned provisioning step is the documented precedent for the schema
  widening FE-1391 needs (session-log archive slot).

## 6. Orchestration

[workflows](https://flueframework.com/docs/guide/workflows/) ·
[schedules](https://flueframework.com/docs/guide/schedules/) ·
[sandboxes](https://flueframework.com/docs/guide/sandboxes/)

- Workflows are a *pattern*, not a primitive — no `defineWorkflow`. Four approaches:
  `flue run` (CI), the JS API (`start()`/`init()`/`dispatch()`/`read()`) for scripts and
  cron, the SDK (`createFlueClient`) against deployed agents, external durable platforms
  (Temporal/Inngest/Cloudflare) when orchestration itself must survive interruption.
- Schedules: platform cron → `dispatch(agent, { id, message })` (resolves on durable
  admission, not completion); signal-shaped delivery; fixed vs per-fire conversation ids;
  node fires are skipped during downtime.
- Sandboxes: virtual (in-memory bash emulation) / `local()` (no isolation; allowlisted env) /
  remote providers. Agents without one keep tools, skills, subagents.

**For brunch-lite.** The baseline runner is the JS-API workflow pattern, independently
converged. FE-1404 (armed rerun) should be exactly that: a script over `start()` + `init()`
(fresh ids per condition) + `read()`, with `observe()` doing the accounting (§7). No sandbox
anywhere in our current or foreseeable surface — elicitation needs no file tools; keep it
that way (narrowest environment is the documented advice).

## 7. Quality: evals & observability

[evals](https://flueframework.com/docs/guide/evals/) ·
[observability](https://flueframework.com/docs/guide/observability/)

- Evals: in-process `start()` + `init(agent)` (no id → fresh conversation) + `read()`;
  `reply.text`, `reply.data` (data-writer output), `onEvent` for tool-call capture;
  `AgentRunError` on failed runs. HTTP alternative via `createFlueClient` + `history()`.
  Convention: `src/evals/*.eval.ts`, separate vitest config, longer timeouts; real-model
  evals assert behavioral contracts, never strings; `vitest-evals` judges
  (`FactualityJudge`, `createJudge`) for semantic scoring.
- Observability: `observe()` event stream (in-process, live-only) — model requests, tool
  executions, logs, **`turn` events with `input`/`output`/`cacheRead`/`cacheWrite`/
  `totalTokens`/`cost`**; `useResponseFinish` for in-agent aggregate usage;
  `@flue/opentelemetry` via `instrument(...)`; Sentry/Braintrust integrations.

**For brunch-lite.** Our faux-provider + fetch-shim + child-process eval is a bun-forced
composition of documented parts (audited). Adoptable affordances we currently ignore:
`init()` without an id (simpler than UUID mounts for future in-process evals); `onEvent`
tool capture (stronger than substring checks over stringified history — a direct upgrade
path for the walking-skeleton's weaker oracles); `observe()` for *all* token/cost accounting
in FE-1404 and any experiment runner — never hand-count again; judges for FE-1407's scoring
instrument (the failure catalogue becomes `createJudge` rubrics). *Do not rebuild*: no custom
event tap, no custom cost meter, no custom judge harness.

## 8. Cloudflare target (contingency)

[cloudflare-target](https://flueframework.com/docs/guide/cloudflare-target/)

If the demo shell ever deploys there: one generated Durable Object per agent (`agentName`
pinning matters — already our practice), per-object SQLite replaces `db.ts` (**source-root
db config is rejected at build time** — our `LocalCaptureStore`'s file-path assumption
becomes binding-swap territory, which is what the storage port is for), `nodejs_compat`
required, CPU limits per invocation, schedules move to `wrangler.jsonc` crons in UTC, no
in-process `observe()` habits — native Workers Traces instead. Spec §12.5's remote-parity
constraints (pinned identity, storage outside plugin, no dynamic agents) are exactly the
things this page confirms as load-bearing. Nothing to do now; this section exists so nobody
builds a node-only assumption into a *harness* layer — node-only assumptions belong in
bindings and deployment config.

---

## Boundary design summary

Flue's affordance surface sorts our system into three lanes, and the binding line belongs
between the second and third:

1. **Consume directly (no wrapping).** UI transport (`useFlueAgent`, `createFlueClient`,
   the HTTP surface), observability (`observe`, OTel), eval harnessing (`init`/`read`,
   judges), scheduling, deployment. These are *shell-facing* affordances: the demo shell,
   dev app, and experiment scripts should use them natively. Wrapping them in our binding
   would be a parallel SDK — lens-2 debt at the API level.
2. **Translate in the binding (current capabilities list — correct).** The agent-loop
   capabilities: tool registration, instruction assembly, persistent state, affordance
   emission, suspend-for-reply, private model call (→ `useSubagent`), entry-projection read,
   durable store hosting. The binding's job stays translation of harness semantics into hook
   dialect — and the hooks guide now documents the two semantics we depend on.
3. **Own outright (harness + storage port).** Elicitation semantics and the capture store:
   envelope invariants, settlement judgment, sweep idempotence, provenance verification,
   completion. Canon agrees — "your application should manage its own data store separately."

**Divergence risks, ranked:**

1. **The parallel chat client.** `chat.tsx` grows feature-by-feature into a hand-rolled
   `useFlueAgent`. Adopt the React package at FE-1385/demo-shell; route FE-1420's markdown
   floor through `dynamic-tool` parts.
2. **Sweep machinery ignoring `useSubagent` + durable tools.** FE-1392 built as in-conversation
   prompting with a bare store write would hand-roll both the private model call and
   crash-safe side effects that `task` delegation and `step.do` provide.
3. **Cards as a bespoke loader.** FE-1403/FE-1406 inventing pack-content delivery when
   skills' `activate_skill` progressive disclosure is the documented mechanism with the right
   economics.
4. **The archive shadow-recording the stream.** FE-1391 re-capturing entries inside hooks
   instead of archiving from the canonical GET surface — two copies of the conversation, one
   drifting.
5. **Hand-rolled accounting/oracles in experiments.** FE-1404/FE-1407 re-counting tokens or
   substring-matching histories when `observe()`, `onEvent`, and judge harnesses exist.

## Reconciliation with the Flue-vs-tilde analysis (2026-08-14)

The comparative analysis at [`../inbox/amp-analysis-flue-vs-tilde.md`](../inbox/amp-analysis-flue-vs-tilde.md)
read Flue's *source and changelog*, not only the guides, so where it speaks it carries higher
evidence grade than this sheet's paraphrase-level doc reads. Reconciled 2026-08-17; no
contradictions found — the analysis's verdict (keep Flue; Tilde is a hosted control plane, not
a runtime; the capture store stays application-owned under any future) matches this sheet's
boundary summary independently. Four source-level facts it adds that the guides state weakly
or not at all:

- **Pre-remote-exposure gates.** The mounted Flue route is public — no authentication or
  per-conversation authorization exists. Before the demo shell is exposed remotely: auth +
  per-conversation authorization, runtime telemetry, persisted-state versioning/backup
  expectations, and the restart-durability gap (FE-1396) closed. All four are ticketed as
  FE-1423 (FE-1396 blocks it), ratified as requirements 2026-08-17. (Routing row: "you're
  about to expose the demo remotely".)
- **Churn risk is measured, not vibes.** 2.0.0 was an architectural rewrite days before the
  current 2.0.3, and persisted beta stores are rejected with **no migration path**. Pin
  versions deliberately; re-verify the walking-skeleton-pinned semantics at every upgrade;
  treat docs' future-tense claims as unshipped.
- **The at-least-once floor is universal.** Exactly-once-*recorded*, at-least-once-*executed*
  holds on both targets, and `step.do` checkpointing cannot make an external effect
  once-only — which is the source-level argument for why the capture store's content-keyed
  dedup is load-bearing rather than defensive.
- **Skills ride the Vite build graph** (`SKILL.md` imports are build-resolved) and will not
  load under plain test runners — a real constraint on risk 3's "cards compile to skills"
  path: FE-1403/FE-1406 card content must stay assertable outside the graph (fixture-grade
  copies or eval-config runs), or the card tests go vacuous.

## Sources

All fetched 2026-08-17 in `index.md` mirror form; **all 21 succeeded, no failures, no
retries needed**:

- https://flueframework.com/docs/guide/project-layout/index.md
- https://flueframework.com/docs/guide/building-agents/index.md
- https://flueframework.com/docs/guide/agent-hooks/index.md
- https://flueframework.com/docs/guide/models/index.md
- https://flueframework.com/docs/guide/tools/index.md
- https://flueframework.com/docs/guide/mcp/index.md
- https://flueframework.com/docs/guide/skills/index.md
- https://flueframework.com/docs/guide/subagents/index.md
- https://flueframework.com/docs/guide/sandboxes/index.md
- https://flueframework.com/docs/guide/routing/index.md
- https://flueframework.com/docs/guide/database/index.md
- https://flueframework.com/docs/guide/deploy/index.md
- https://flueframework.com/docs/guide/workflows/index.md
- https://flueframework.com/docs/guide/schedules/index.md
- https://flueframework.com/docs/guide/channels/index.md
- https://flueframework.com/docs/guide/evals/index.md
- https://flueframework.com/docs/guide/observability/index.md
- https://flueframework.com/docs/guide/durability/index.md
- https://flueframework.com/docs/guide/react/index.md
- https://flueframework.com/docs/guide/cloudflare-target/index.md
- https://flueframework.com/docs/guide/node-target/index.md

Caveat as ever: WebFetch reads through a summarizing intermediary; API names quoted here
matched across pages and against our working code, but load-bearing signatures should be
confirmed against the raw page (or `node_modules` types) before implementation.
