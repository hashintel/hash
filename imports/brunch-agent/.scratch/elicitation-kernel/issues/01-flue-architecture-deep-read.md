# Flue architecture deep-read

Type: research
Status: resolved
Resolved: 2026-08-06

## Question

What does Flue's architecture offer — and constrain — for embedding an elicitation kernel, such that the shipping-shape and contract-decomposition tickets can decide on facts rather than the marketing page?

Specifically:

- The agent programming model (React-like hooks API): what is "an agent" as a unit of code, state, and deployment?
- How skills, tools, subagents, persistent state, sandboxes, and channels are defined and composed
- How Pi is exposed through Flue — can an embedded library reach Pi primitives directly, or only through Flue's abstractions?
- Local vs. remote parity: what changes between a Node local run and a Cloudflare/CI deploy? What state survives where?
- Is a "kernel library embedded in a thin Flue agent" a natural pattern, or does Flue push toward the agent *being* the program?
- Channels (Slack/Teams/Discord/GitHub) as host input pathways — what does a host surface look like in Flue terms?

Sources: https://flueframework.com/docs/guide/ (pages are fetchable as markdown at `/docs/guide/<topic>/index.md`).

## Answer

> Resolved by `/research` subagent, 2026-08-06.

# Flue Architecture — Findings for an Embedded "Elicitation Kernel"

Version context: `@flue/runtime` **2.0.3** (npm, published 2026-08-05; package created 2026-05-14, 48 versions). Siblings `@flue/cli`, `@flue/sdk`, `@flue/react`, `@flue/vite` all at 2.0.3. Docs pages carry "Last updated Jul 21–23, 2026". Repo: `github.com/withastro/flue`.

## 1. Agent as a unit

**Code.** An agent is a plain exported, capitalized JS function that returns its system-prompt string. Capabilities come from `use*` hooks called in its body. A module marked `'use agent'` is scanned at build time by the Vite plugin (`flue()` from `@flue/vite`); every exported capitalized function in it becomes a registered agent. One file may export several.

**Lifecycle.** The function **re-renders before every model call** and rebuilds instructions and its declared resource set from scratch. Unlike React, resource hooks *may* be called conditionally — this is the framework's central design bet ("an agent is a program to write, not an object to configure"). Between renders the runtime diffs the declared set against a "last-narrated snapshot" and appends a framework-authored `resources` signal at the next turn boundary ("New tool available: …"). Skill/subagent catalogs are frozen on a durable baseline so flips don't bust the prompt cache; custom-tool changes rewrite the native tools array and *do* invalidate cache (documented exception: a tool unlocked by a completed tool call, on non-Haiku Anthropic models).

**State.** Durable identity is the function name (or the `Fn.agentName` static) — it keys conversation storage, so renaming without pinning `agentName` is a DB migration. Each conversation is addressed by a caller-chosen `id`. `Fn.initialData` (a Valibot schema static) validates creation-time data exactly once.

**Deployment.** Registration ≠ mounting. `createAgentRouter(agent)` returns a Hono sub-app you mount yourself in `src/app.ts`; agents reached only via `dispatch(...)` need no mount at all. Entry points: `flue run <module>` (CLI, no server), HTTP `POST /:id` (202 fire-and-forget), `dispatch(agent, {id, message, initialData, uid})`, and `start()` + `init()` for standalone Node processes.

## 2. Primitive inventory (what a library could register/own)

- **Tools.** `defineTool({name, description, input?, output?, harness?, durable?, run})` — Valibot schemas, frozen at module load, importable from a light `@flue/runtime/tool` entry "for tool-only modules". Mounted per render via `useTool(def)`. `run` receives `{data, signal, log, toolCallId}`; `harness: true` adds `harness`, `durable: true` adds `step`. Reserved names: `task`, `activate_skill`, `read_skill_resource`, plus sandbox built-ins (`read/write/edit/bash/grep/glob`). **This is the primary registration surface an embedded kernel would own.**
- **Harness tools** (worth calling out separately). `harness.sandbox` (direct file/exec verbs, *never recorded in the conversation*) and `harness.prompt(text, {result: Schema, tools, model, thinkingLevel, images})` — runs a model operation in a private scratch conversation invisible to clients, with Valibot-validated structured output enforced via a framework-injected `finish` tool. Repeated calls continue that scratch conversation. **This is the closest thing Flue has to a sub-LLM call primitive, and it is a strong fit for a kernel's internal extraction/normalization steps.** Also `harness.compact()`.
- **Skills.** Open Agent Skills format (`SKILL.md` + supporting files), or `defineSkill({name, description, instructions, files})` for generated/assembled content. Progressive disclosure: one catalog line always present; full instructions arrive as an `activate_skill` tool *result*, so activation never mutates the system prompt and the cached prefix survives. Supporting files are served read-only from the app bundle at virtual paths — **not** copied into the sandbox. Also auto-discovered from `<cwd>/.agents/skills/` when a sandbox exists.
- **Subagents.** `defineSubagent({name, description, agent})` + `useSubagent()`. Model-driven via the always-present `task` tool. Child inherits *environment* (sandbox, workspace context, parent model) but **nothing conversational** — no history, instructions, tools, skills, persistent state, or initialData. Only the final message returns. Explicitly *not* a second addressable agent: "no conversation id, no persistent state, and no address." `GeneralSubagent` ships as a blank delegate under `flue-general`.
- **Persistent state.** `usePersistentState(name, initial)` — React-shaped, JSON-serializable, keyed by name, durable for the life of the conversation. Writes commit **atomically with the unit of work that made them** (tool batch, or event-hook seam checkpoint), which is what makes it the correct guard for at-least-once callbacks. Prefer updater functions; the render value is a snapshot.
- **Sandboxes.** `useSandbox(factory, {cwd})`. `local()` from `@flue/runtime/node`, or adapters (Daytona, E2B, Modal, Cloudflare Sandbox/Computer) built against the Sandbox Adapter API. Attaching one adds the six built-in file/shell tools; an adapter may replace that set entirely. Sandbox filesystems are **ephemeral by default** and independent of conversation durability.
- **Channels.** Inbound-only verified HTTP ingress (Slack, Discord, Teams, GitHub, Stripe, …), shipped as **blueprints** (`flue add channel slack`) that generate project source rather than as opaque packages. A channel is "an object with declarative routes"; `createChannelRouter(routes)` builds one by hand. Handlers call `dispatch(...)` themselves. **Outbound is explicitly not Flue's job** — no send-message abstraction; you use the provider SDK and expose narrow tools with the destination bound in trusted code.
- **Event hooks / data writers.** `useAgentStart` (async — the load-data seam), `useAgentFinish`, `useResponseStart/Finish` (return values merge onto response *metadata*). `useDataWriter(name, {schema})` streams typed structured data parts to clients (`{type: 'data-orderCard', data}`), strictly one-way out of the agent — **the model never sees data parts**, and a write never re-renders the agent.
- **Custom hooks.** Plain `use*` functions composing the built-ins, returning instruction fragments to the caller. Docs explicitly frame this as the reuse/packaging unit.

## 3. Pi exposure

Partial and deliberate, concentrated at the **model-provider layer**. Documented facts:

- `@flue/runtime`'s npm dependencies include `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` directly.
- Models guide: "Providers are Pi's own objects, and Flue accepts them directly: build one with Pi's `createProvider()` … and hand it to `setProvider()` at module top level in `app.ts`." Examples import from `@earendil-works/pi-ai`, `.../api/anthropic-messages.lazy`, `.../providers/anthropic`, `.../api/openai-completions.lazy`.
- `start({providers})` registers "the Pi providers this runtime registers, replacing the default set."
- `PromptImage` "re-exports pi-ai's `ImageContent`."
- Why-Flue: "Flue builds on Pi, the open agent harness behind OpenClaw, and integrates it deeply into every agent you build."

Everything else — conversation loop, tool dispatch, skills, subagents, durability — sits behind Flue's own abstractions. **Inference:** there is no documented path to Pi's agent loop, message list, or Pi extension/package system from inside a Flue agent. A kernel that currently assumes Pi-level tool registration, transcript control, or `renderResult`-style TUI hooks would have to be re-expressed entirely in Flue's `defineTool` + render model. Flue also uses Durable Streams (`@durable-streams/client`) as its client transport protocol.

## 4. Local vs. remote parity

Durable *records and recovery decisions are identical* across targets; ownership and wake mechanics differ.

| | Node | Cloudflare |
|---|---|---|
| Unit | one server process, coordinator with **lease-based** ownership | one **Durable Object per agent conversation**, own SQLite; ownership structural |
| Recovery | startup reconciliation + periodic lease scans | wake-on-start + self-renewing durable wake schedule, bounded supervision pass |
| Storage | `db.ts` adapter required (sqlite, Postgres, MySQL, Mongo, Redis, libSQL, Turso, Supabase, Valkey); **without one, conversations are process-local memory and a restart loses them** | built in |
| Constraint | must route each conversation to exactly one owner; active-active / round-robin for the same conversation is unsafe | every deployed agent needs an append-only DO migration tag in your hand-authored `wrangler.jsonc`; renames/deletes are storage migrations (`renamed_classes` / `deleted_classes`) |

Core contract: "Every accepted submission reaches exactly one durable terminal outcome — completed, failed, or aborted — no matter how many crashes happen in between." Submissions are recorded durably *before* any model work; that is what the 202 and the `DispatchReceipt` attest to. There is a retry budget plus a wall-clock timeout, enforced preemptively via the attempt's abort signal.

**Deliberately not durable:** sandbox files (rebuilt fresh on each initialization unless the adapter keys a provider workspace on the instance id — "a durable database does not make a sandbox durable"); in-flight local promises (persist the `DispatchReceipt` and `read(receipt)` re-attaches from any process); and **code outside the agent** — Flue explicitly does not checkpoint arbitrary TypeScript. For that, docs point to Cloudflare Workflows / Inngest / Temporal calling Flue "like any other service." External side effects are never recorded, only that a tool ran and what it returned.

Also: there is **no GitHub Actions or GitLab *target***. CI is just `flue run` in a shell step (`--new` + deterministic `--id` gives exactly-once conversation creation). GHA/GitLab appear only in the ecosystem catalog. Builds are Vite (`vite build` → `dist/server.mjs` + `dist/app.mjs`, or the Cloudflare plugin's output). Node deps are externalized, not bundled; the built server does not load `.env`.

## 5. Library-in-agent vs. agent-as-product

**Embedding is a natural pattern, and the docs endorse it explicitly.** Evidence:

- `defineTool` / `defineSkill` / `defineSubagent` all exist specifically as *exportable, frozen, module-load-validated* units — described as "the natural shape for tools shared across agents" and "the exportable unit — define a delegate once, mount it from any agent."
- **Custom hooks are the documented composition unit:** "a `useGitHub()` hook that bundles the right tools, skills, and instructions can be written once and dropped into every agent that works with GitHub." That is precisely a kernel-in-a-hook.
- `@flue/runtime/tool` is a lighter entry point for tool-only modules — a library can depend on Flue without pulling in the server runtime.
- Source-dir resolution order puts **`.flue/` first**, described as "a self-contained Flue source area inside a larger application," with authored modules free to "import ordinary supporting code from elsewhere in the project."
- Per-mount overrides "spread cleanly": `useSubagent({ ...issueClassifier, model: 'anthropic/claude-haiku-4-5' })`.

Counter-pressure: Flue insists the *agent itself* be a program, not config, and the `'use agent'` build-time scan means a library **cannot ship a pre-registered agent** — the agent module must be authored in the consuming project.

**Recommendation (inference):** ship the kernel as a published custom hook — `useElicitationKernel(targetPlugin)` — that internally calls `useTool` / `useSkill` / `usePersistentState` / `useDataWriter` and returns instruction fragments, plus raw `defineTool` exports for hosts that want selective mounting. The host owns a ~10-line `'use agent'` module, the `app.ts` mount, and `db.ts`. This is library-in-a-thin-agent, and Flue's grain supports it. One real constraint: tool names are globally unique per render and collide with reserved names, so the kernel needs a namespacing convention.

## 6. Channels as host surfaces

A "host input pathway" in Flue is: verified ingress → `dispatch(agent, {id, message, initialData})`. Three distinct payload lanes:

- **`initialData`** — recorded once at conversation creation, validated against the agent's schema static, read with `useInitialData()`, immutable thereafter. This is where an elicitation *target descriptor* belongs.
- **`kind: 'signal'` messages** — `{type, body, attributes}` where `attributes` is a string→string map of facts *trusted code* attached. Read with `useDelivery()`. Docs push this hard as the authorization pattern: "the model may choose an order ID to look up, but it cannot choose the customer." For a kernel, this is the channel for host-verified respondent identity. Channel deliveries are signals rather than `user` messages precisely because a Slack thread is multi-participant.
- **`kind: 'user'`** — direct human turns.

**Interviewing-UX rendering surfaces, ranked by fit:**

1. **`useDataWriter` + `@flue/react`.** Named, schema-validated structured data parts arriving alongside text on the same message; a tool can write several times mid-run to drive live progress. `useFlueAgent({url})` gives `messages`, `parts`, `status`, `historyReady`, `sendMessage()`, `refresh()`. Message parts are `text | reasoning | dynamic-tool | file`, and **validated structured tool output is preserved on the `dynamic-tool` part's `output`** — the React docs say this exists "so applications can render custom tool interfaces without a separate data-event channel." Direct fit for question cards, choice sets, and review panes.
2. **Chat channels** (Slack/Teams/Discord/GitHub) for text-shaped interviewing only. There is **no outbound abstraction** — every reply is a tool you write against the provider SDK with the destination bound in trusted code (the `replyInThread(data)` pattern). Rich Slack Block Kit interviewing is entirely your code.

**Gap worth flagging loudly: Flue documents no first-class human-in-the-loop / elicitation / interrupt primitive.** There is no "ask the user and suspend" hook. `terminate: true` on a tool result ends the turn once the current batch settles; the documented pattern for waiting on a human is state-gated tools (`record_approval` unlocks `publish_release`) plus a new inbound submission. **Inference:** the kernel must implement its own turn-suspension protocol — a `terminate: true` tool that writes the pending question into `usePersistentState` and emits a data part, with the host's answer arriving as a fresh `dispatch`. That is exactly the kind of thing a kernel *should* own, but Flue provides no scaffolding for it, so it is net-new work either way.

## 7. Constraints & risks

- **Maturity.** 2.0.3, with 2.0 a full API rewrite around hooks announced this cycle; a Migration Guide exists. `@flue/vite` first published 2026-07-10 (19 versions). Fast-moving — expect churn.
- **Build-time magic is load-bearing.** `'use agent'` scanning, `SKILL.md` module imports, and agent-identity stamping all happen in the Vite plugin. **This effectively requires Vite.** A kernel published as a library must not depend on that transform internally — keep to `defineTool`/`defineSkill` (plain runtime calls) and let the host own the scanned module.
- **Durable-identity coupling.** Conversation storage is keyed by agent function name. Always pin `agentName`.
- **Cloudflare migration ceremony.** Adding an agent is always agent + mount + new DO migration tag. If the design ever wants *dynamic* agent creation per elicitation target, Cloudflare forbids it — agents are a build-time set. Use one agent + many conversation ids instead.
- **Prompt-cache economics constrain dynamism.** "Gate tools on state that changes rarely." An interviewing kernel that swaps tools per question would thrash the cache. Prefer one stable tool set + state-driven instructions, or skill activation (cache-safe by design).
- **Valibot lock-in** at every schema boundary (`input`, `output`, `initialData`, `useDataWriter`, `harness.prompt({result})`). A kernel with Zod-based plugin contracts needs a conversion layer or a dual-schema strategy.
- **Node multi-replica.** No active-active per conversation; you must own routing.
- **Subagents are conversationally sterile** — no id, no state, no address. If elicitation-target plugins need their own durable memory, they cannot be subagents; they must be state + tools inside the parent, or separately registered agents.
- **Petrinaut / non-React web-UI host risk:** the rich path (`useFlueAgent`) is React-specific. `@flue/sdk` (`createFlueClient` → `send/read/wait/observe/history`, built on `@durable-streams/client`) is framework-neutral and is what `@flue/react` sits on, so a non-React host is viable — but it must reimplement the materialized-snapshot / reconnect / canonical-reset layer that `useFlueAgent` provides. **Inference:** budget for that, or wrap `createFlueClient` directly and accept a thinner UI contract.
- **`skills` frontmatter `allowed-tools` is accepted but not enforced** — Flue does not restrict the session toolset from a skill. Any kernel-level tool gating must be done with conditional `useTool`.

## 8. Unreached sources

**HTTP 404 (do not exist at those paths):** `/docs/guide/deployment/`, `/docs/guide/state/`, `/docs/guide/cloudflare/`, `/docs/guide/cli/`, `/docs/guide/github-actions-target/`, `/docs/reference/index.md`, `/llms.txt`. (Real equivalents: `/docs/guide/deploy/`, state is a section of `agent-hooks`, `/docs/guide/cloudflare-target/`.)

**Exist but not fetched** (nav-confirmed; would sharpen specific answers): `/docs/guide/database/`, `/docs/guide/schedules/`, `/docs/guide/evals/`, `/docs/guide/observability/`, `/docs/guide/configuration/`, `/docs/guide/migration/`, `/docs/guide/agent-behavior/`, `/docs/reference/sandbox-api/`, `/docs/reference/provider-api/`, the full `/docs/reference/agent-hooks-api/` (indexed, read only via search), the CLI and Agent SDK reference sections, all `/docs/ecosystem/*` sub-pages, the `@flue/react` package README, and `examples/react-chat`. The GitHub repo (`withastro/flue`) source and Pi's own docs (`pi.dev/docs/latest`) were not read.
