# Flue patterns audit — 2026-08-17

Audit of brunch-lite's Flue usage against the official docs (project-layout, routing, database,
configuration, models, agent-api reference, evals guide — fetched 2026-08-17; the framework's
`.../index.md` markdown mirrors). Produced during the FE-1401 remediation sweep. One empirical
probe was run where the docs were silent (noted inline).

**Verdict.** The repo's Flue usage is substantially canonical — in several places the docs
retroactively bless choices the deep-reads had marked as judgment calls (the mount-path/identity
split most notably), and in one place canon _downgrades_ a known finding's severity (the faux
model-id coupling fails fast at resolution, not silently over the network). Nothing audited is
outright wrong. The divergences that exist are all in the eval harness, all forced by the same
root fact (the Flue node runtime cannot be driven under `bun test`), and all composed from
documented parts rather than invented mechanisms. The genuinely load-bearing risks are two
places where the binding relies on runtime semantics the docs state only vaguely — both pinned
by the walking-skeleton integration test, which this audit therefore marks as a
do-not-weaken oracle.

## Wrong-or-fragile

1. **Faux model id silently coupled to the agent's `useModel` string — fragile, but louder
   than we recorded.** `walking-skeleton.integration.ts:20` declares
   `models: [{ id: 'claude-haiku-4-5' }]`, which must match
   `gherkin-elicitor.ts:28`'s `useModel('anthropic/claude-haiku-4-5')`. The FE-1389 deep-read
   feared drift "falls through to a real provider or fails obscurely". Canon corrects half of
   that: registering a provider under a built-in's id **overrides** it (models guide, custom
   provider registration), and "an unknown specifier fails fast: the run errors with the
   unresolved provider and model ID before any request is sent". So drift is a loud resolution
   error, not a network call. Still fragile — nothing ties the two strings. Fix: one shared
   constant (or derive the faux model list from the agent module's specifier). Cheap; belongs
   with FE-1420-adjacent test hardening.
2. **`providers` left unrestricted in the build.** `flue.config.ts` declares only
   `target: 'node'`; canon offers `providers: ['anthropic']` to make the registered set
   exhaustive, so "a specifier naming any other provider fails at resolution". As is, every
   built-in provider ships and a typo'd provider id in a future `useModel` resolves against a
   provider we never intend to credential. One line, matches the repo's fail-fast posture
   (docs/agents/posture.md). Recommended.

## Divergent with defensible reason

1. **Eval harness shape.** Canon (evals guide): Vitest, separate `vitest.evals.config.ts`,
   `src/evals/*.eval.ts`, extended timeouts, one runtime per process. Repo:
   `apps/dev/test/walking-skeleton.test.ts` under `bun test` spawning
   `node --experimental-strip-types` for the integration file. The docs "do not address Bun
   test" (their words); the child process _honors_ the one-runtime-one-process rule by giving
   the runtime a process of its own; and the canonical reason evals live in a separate suite —
   they spend real tokens and real time — does not apply to a faux-provider run that costs
   nothing and finishes in ~500ms, so folding it into the ordinary test gate is sound, not lazy.
   Stay divergent; revisit only if paid-model evals arrive (those should follow canon's
   separate-suite shape).
2. **Hybrid in-process + HTTP coverage.** Canon presents `start()` (in-process) and
   `createFlueClient` (HTTP against a running server) as alternatives; the repo composes them —
   `start()` boots the runtime, `createFlueClient({ url, fetch: fetchApp })` drives the real
   `app.ts` through a fetch shim (`walking-skeleton.integration.ts:51-59`). The `fetch` option
   is typed SDK surface, so this is composed from documented parts, and it captures precisely
   what canon says direct-import testing misses ("agents depending on build-resolved features
   require HTTP evaluation"): route wiring is covered without a socket. Stay divergent —
   arguably this is the better pattern and worth upstreaming as a docs suggestion.
3. **`db.ts` path anchored to the module, env-overridable.** Canon's example is a bare relative
   `'./data/flue.db'` and never says relative-to-what; the repo anchors via `import.meta.url`
   with the failure mode documented at the site (`db-path.ts`). The `BRUNCH_DEV_DB_PATH`
   override is app convention, not a Flue one — fine, since canon's `db` config field names the
   module, not the file. Stay divergent; docs are silent.
4. **Flat agent file rather than per-agent folder.** Canon's multi-agent layout nests
   `src/agents/<agent>/` folders; the repo has one agent as a flat file
   (`src/agents/gherkin-elicitor.ts`). Right-sized today; adopt folders when the target gallery
   (FE-1385) adds the second agent.

## Canonical — confirmed against the docs

1. **`'use agent'` directive discipline.** First statement before imports, exported capitalized
   function, `agentName` as a pinned string-literal static (`gherkin-elicitor.ts:1,27,48`) —
   matches the directive scan, the identity-resolution order (build-stamped binding →
   `agentName` → function name), and the identity regex. The pinning is _more_ load-bearing
   than the comment even claims: under `start()`'s direct module import (evals), the
   build-stamped binding may be absent, and `agentName` is the next resolution step — the
   static is what keeps eval and production conversations keyed identically.
2. **Mount path ≠ agent identity.** `routes.ts` + `app.ts:23` mount at a route constant while
   storage keys on the pinned identity. Canon, verbatim: "The mount path is not the agent's
   identity… never by the URL." The FE-1389 deep-read defended this as a judgment call; it is
   documented doctrine. (SPEC-LEDGER note: no row change needed, but the deep-read's
   "newcomer would misunderstand" entry can cite the routing guide.)
3. **`app.ts` as the single fetch-compatible entry, Hono by convention, assets composed
   alongside agents, auth-by-middleware-not-framework.** All as the routing guide draws it.
4. **Tool contract.** Inline `useTool` with valibot `input`/`output`, `run` returning
    `{ output, terminate: true }`, affordance id minted from `toolCallId`, tool errors thrown to
    the model (the second-ask rejection) — every element is documented surface, including
    `terminate` ("ends the agent's turn once the tool batch settles").
5. **Signals.** `ctx.append({ kind: 'signal', type, tagName, body, attributes })` matches the
    `DeliveredMessage` contract; `affordance-reply-bound` is not in the reserved-type list;
    signals render as XML-tagged blocks, not chat turns — which is the §9.4
    structurally-non-user property the binding depends on.
6. **Instruction assembly.** Agent returns the binding's string; canon composes "your returned
    string first". The no-interpolation rule (nothing pending in the instruction string) is
    exactly what avoids the documented `instructions` signal ("System instructions updated.") —
    the docs confirm both the advisory's existence and its trigger (composed-instruction digest
    change).
7. **`initialData`.** Valibot schema validated once at first contact, immutable — canon's
    AgentStatics lane, used for the session→document binding. Observation, not a violation: the
    parsed value is never read back yet (`useInitialData()` has no caller); FE-1392's sweep
    wiring is the intended consumer.
8. **`db.ts` shape.** Default-exports `sqlite(path)` from `@flue/runtime/node` — canon's
    exact idiom, WAL mode, auto-created directories, boot-time `migrate()`/`connect()` meaning
    a bad path fails at startup, which is the fail-loud behavior FE-1400's fixes wanted.
9. **Version hygiene.** All `@flue/*` packages pinned to one version line (`^2.0.3`);
    `pi-ai` (faux provider) a devDependency only.

## Docs-are-silent — verified empirically or accepted

1. **`start()` does not auto-discover `db.ts` (probed).** The docs say `db.ts` is "discovered
    by convention from the source directory" but never say whether `start()` (evals) performs
    that discovery. Probed: ran the walking-skeleton suite and compared
    `apps/dev/.data-wipe-me/conversations.db` mtime — unchanged. Explicit `start()` config
    keeps conversations in memory; the test's no-disk hermeticity claim holds. The existing db
    file is `vite dev` residue. Worth one sentence in the substrate-inventory review note so
    the claim's evidence is named.
2. **Monorepo/workspace composition.** Canon has no monorepo story (its own admission). The
    repo's composition — library packages export hooks (`useElicitation`), the app owns the
    directive-marked agent module — is forced by the scan being source-root-scoped and matches
    the gherkin-elicitor comment ("a library cannot ship a pre-registered agent"). Accepted;
    this is the §12.1 thin-host doctrine and Flue's layout constraint agreeing.

## Known workarounds, cross-checked

- **Child process because "`@flue/runtime/node` cannot be driven under `bun test`"** — docs
  confirm only Vitest is addressed; no contradiction, no better documented mechanism. Keep.
- **`db.ts` as build-time convention file kept apart from `db-path.ts`** — consistent with
  canon's convention-discovery model; the split exists so the path logic stays `bun test`-able.
  Keep.
- **No-db in-memory eval trick** — canon confirms in-memory default _for the no-`db.ts` case_;
  the start()-doesn't-discover-db.ts half was undocumented and is now probed true (item 16).

## Strain report

Places where the docs are ambiguous or our architecture has no canonical answer — inputs to the
second-binding question (spec §14.2), not defects:

1. **`useAgentStart` firing semantics.** ~~Undocumented~~ **Resolved 2026-08-17**: the
   agent-hooks _guide_ (a page this audit did not fetch — it read the agent-api reference
   instead) states the hook "runs every time a message is delivered to the agent" —
   per-delivery, exactly what the binding relies on (`binding-flue/src/index.ts:47`). The
   agent-api reference's "once per agent instance at first contact" wording is the misleading
   text. Downgraded from undocumented-bet to documented-semantics; the walking-skeleton test
   stays as the pin (cheatsheet, §2). The audit's miss is itself a finding: sampling the
   reference without the guide produced a false "docs are silent".
2. **State-updater composition within a tool batch.** ~~Undocumented~~ **Resolved 2026-08-17**:
   the agent-hooks guide documents the updater rule — the callback "always accesses the latest
   written value, not a stale render snapshot" — which is precisely what the one-live-affordance
   guard depends on. Same downgrade, same retained pin (`secondAskRejected`). Cite the guide at
   the guard when that file is next touched.
3. **The evals guide's provider-credentials assumption.** Canon's eval story assumes real
   provider credentials from the environment; the faux-provider pattern the repo uses (and
   pi-ai ships for exactly this) is undocumented in Flue's own guide. Our CI-hermeticity
   posture therefore rests on pi-ai's contract, not Flue's. Acceptable — pi-ai is the substrate
   family's own test double — but it is a dependency the docs don't underwrite.
4. **Capability 8 (durable entry projection over self-HTTP)** remains the binding's biggest
   docs-unsupported bet: the history projection is documented as an SDK read surface, but
   "read your own projection over self-HTTP from inside the process" appears nowhere in canon.
   FE-1391 will land on this; expect to either find a native lane or write the strain down.

> **Reflection:** The audit's most useful output is a reclassification: the eval harness — the
> part of the repo that _feels_ most improvised — is composed entirely of documented parts and
> honors canon's one constraint (one runtime, one process) more carefully than the canonical
> shape does under a different test runner. Meanwhile the two real risks are invisible in any
> file diff: they are reliance on under-documented runtime semantics, and their only guardrail
> is one integration test. That inverts the usual review instinct — the weird-looking code is
> fine; the ordinary-looking hooks are where the substrate could move under us.

## Sources

Fetched 2026-08-17, all in the framework's `index.md` markdown-mirror form; all eight succeeded:

- https://flueframework.com/docs/guide/project-layout/index.md
- https://flueframework.com/docs/ecosystem/index.md (thin: integration-category directory only)
- https://flueframework.com/docs/reference/agent-api/index.md
- https://flueframework.com/docs/guide/routing/index.md
- https://flueframework.com/docs/guide/database/index.md
- https://flueframework.com/docs/guide/evals/index.md
- https://flueframework.com/docs/reference/configuration/index.md
- https://flueframework.com/docs/guide/models/index.md

Deliberately skipped as not load-bearing for the audited surfaces: getting-started, CLI
overview, SDK overview (its relevant `createFlueClient` options are covered by the evals
guide), cloudflare-target, deploy — node target only, no CLI-driven patterns in this repo.
Caveat: fetches were read through a summarizing intermediary, so doc quotes are close
paraphrases unless marked verbatim; the two strain-report ambiguities (useAgentStart firing,
updater composition) are flagged as ambiguities partly for exactly that reason.
