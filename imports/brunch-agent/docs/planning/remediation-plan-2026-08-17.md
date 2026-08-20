# Remediation & resolution plan — 2026-08-17

The consolidated read of everything the remediation sweep produced: the FE-1419 queue (executed),
the deep-reads, the capture-store rendering, the patterns audit (as corrected), the architecture
cheatsheet (+ tilde reconciliation), and the routing table. Two ledgers: **A** — what is still
wrong or fragile in the implementation, with owners and plan corrections; **B** — what we don't
know, with the cheapest honest way to find out. Rows leave this document by landing in a commit,
a ticket, or a decision — per the legibility protocol, this file is a consolidation target, not
a terminus.

## Ledger A — wrong-or-fragile, still open

| # | What | Evidence | Owner | Fix shape | Plan correction needed |
| --- | --- | --- | --- | --- | --- |
| A1 | **Core is a schema bag; the suspension protocol lives in the binding.** The second-binding test (spec §14.2) fails in spirit: the affordance id scheme, one-live-affordance rule, reply-binding narration, and instruction assembly are all portable harness mechanism, written in `binding-flue/src/index.ts` | deep-read FE-1389; CONVERGENCE §12.2 contradicted row; topology.md N1 | **FE-1422** (filed 2026-08-17, blocks FE-1392) | Extract a pure `ask-protocol` module into core (mint, guard, signal payload, instructions); binding becomes hook wiring. Best done immediately before FE-1392, which otherwise doubles the mechanism-in-binding debt | Recommend: new FE-1383 sub-issue ("the ask protocol is substrate-portable"), scheduled ahead of FE-1392 |
| A2 | FE-1420 findings 1+3: benign tool retry refused as duplicate ask; no relief for an abandoned pending slot (§7.5 `unanswered`, §8.6 advisory) | deep-read FE-1389; FE-1420 | FE-1420 | One-line id-tolerant guard + outcome recording | Already corrected: finding 2 (markdown floor) now rides `@flue/react` parts with FE-1385 — comment posted |
| A3 | Evidence pointers are caller-supplied; §5/§8.2 say harness-derived. Latent — safe only while no sweep tool exists | CONVERGENCE §5 contradicted row; deep-read FE-1390 | FE-1391 | Anchoring at sweep application becomes the only pointer source; `EvidenceSpan` inputs stop accepting ranges from the model side | Recommend comment on FE-1391: its anchoring work is not additive — it must *remove* the caller-supplied-range path, or the contradiction survives it |
| A4 | `resolve-conflict` rejects structured-tap evidence (§8.5 strict reading vs §5.1/C4) — a user who resolves by tapping cannot close the conflict | CONVERGENCE §8.5-adjacent contradicted row | **DECISION** — FE-1395 × FE-1390 seam (cross-comments posted) | Adjudicate when FE-1395 picks the reply encoding; store rule follows the decision | None further; both tickets carry the seam note |
| A5 | Confidence accepts scalar strings (`"0.93"`); spec: qualitative, never a scalar | deep-read FE-1390; CONVERGENCE §5 partial row | **UNOWNED** (FE-1405-adjacent) | One store rule (refuse numeric-parsing confidence) once FE-1405 settles the envelope-adjacent vocabulary — premature to pick the picklist before it | Fold into FE-1405's outputs; note on its inputs list when it starts |
| A6 | Issue `origin` is self-declared; producer unauthenticated (invariant 6 partial) | deep-read FE-1390; CONVERGENCE §6.3 row | **UNOWNED** (FE-1393-adjacent) | Producer identity needs a caller concept that first exists when plugin ops arrive; bind origin to the executing op, not a command parameter | Note for FE-1393's SDK design: the op context should mint the origin |
| A7 | Near-identical advisory fires for string payloads only; §6.2 promises flat-record plugins duplicate detection free | deep-read FE-1390 | **UNOWNED** (FE-1393-adjacent) | Extend `normalizedPayloadText` to flat records (sorted key=value join) when the first flat-record payloads arrive with the gherkin plugin | Note for FE-1393; test with its real payloads, not synthetic ones |
| A8 | Many-sessions-one-target-document unreachable: `chat.tsx` mints a fresh document id per page load (§9.1) | deep-read FE-1389; CONVERGENCE §9.1 row | FE-1396 (+FE-1385 UI half) | Stable target-document identity in the UI (route param), sessions attach to it | Recommend comment on FE-1396: the UI half is prerequisite to proving resume — coordinate with FE-1385 |
| A9 | `plugin.targetDomain` raw slug interpolated into the prompt ("elicit gherkin") | deep-read FE-1389 | FE-1393 (§11.1 plugin ownership) | Plugin declares a human phrase (`displayName` or prompt fragment) | Note for FE-1393 |
| A10 | **Pre-remote gates**: auth + per-conversation authorization (mounted route is public), runtime telemetry, persisted-state versioning/backup, restart durability | cheatsheet reconciliation; tilde analysis; routing table pre-remote row | **FE-1423** (filed 2026-08-17 under FE-1357; FE-1396 blocks it, covering the durability gate) | The ticket carries all four gates as its checklist; blocks remote exposure, not the demo | Done — Lu ratified the gates as **requirements** (2026-08-17); the telemetry gate carries the dual charter (floor: visibility; ceiling: traces feed our feedback/oracles) |
| A11 | Kickoff message is a machine-authored `user` entry (authored non-utterance) | deep-read FE-1389; trace §9.4 | FE-1420 (comment posted) + FE-1385 (`useInitialData` route) | Carry kickoff via `useInitialData`/signal | Done — comments posted on both |

Tracked-but-fine (no action beyond their rows): flat agent file → folders at FE-1385 (audit item 6);
`useInitialData` has no caller yet — FE-1392 is the intended consumer (audit item 13).

## Ledger B — information gaps, by cheapest honest resolution

| # | Question | Why it matters | Mode | Owner |
| --- | --- | --- | --- | --- |
| B1 | Capability 8's contract: what exactly does the durable entry projection's GET surface guarantee (paging, entry kinds, offsets) when read self-HTTP from in-process? | The binding's biggest docs-unsupported bet; FE-1391's archive and anchoring both stand on it | **Source exploration** — `@flue/runtime` routing + SDK types in node_modules, before any code | FE-1391 (pre-work) |
| B2 | Does compaction preserve the durable entry projection (history retention through compaction)? | Every long interview; evidence pointers bind to the projection | **Source exploration first** (durability internals in node_modules may answer it for free), **then the FE-1386 spike** only for what source reading can't settle | FE-1386 — recommend adding the source-read step ahead of the live spike |
| B3 | `useSubagent`'s exact surface (model override, what returns, error shape) — paraphrase-grade today | FE-1392's sweep executor design builds on it | **Raw-doc verification** (fetch the actual subagents page + types) at FE-1392 start | FE-1392 |
| B4 | Can a skill-bearing agent run under `start()` in our node child process (Vite-graph resolution outside `vite build`)? | Decides whether FE-1403/06 card content is testable in our harness or needs fixture-grade copies | **Local probe**, hour-scale, when cards first compile | FE-1403/FE-1406 |
| B5 | The evals guide never documents the faux-provider pattern; our CI hermeticity rests on pi-ai's contract | A pi-ai breaking change silently breaks the hermetic gate | Pin pi-ai deliberately; **upstream question** to Flue (docs suggestion: the fetch-shim + faux pattern is worth documenting) | UNOWNED (small; ride any FE-1383 slice) |
| B6 | `dist/app.mjs` embedding contract, if the demo shell needs a custom host | Demo-shell chartering | **Raw-doc verification** at demo-shell design time; likely moot (recommended shape is the standard layout) | Demo shell (FE-1357-side, post-gate) |
| B7 | Load-bearing signatures generally: everything in the cheatsheet is paraphrase-grade unless marked | Silent API drift between paraphrase and reality | Standing rule (routing table, upgrade row + cheatsheet header): **raw-doc or node_modules types check at implementation time**, per feature, not as a batch | Standing — no ticket |

> **Reflection:** Ledger B's common thread is narrower than "lack of information" — every row is
> a place where we know *that* an affordance exists but not its *contract*. That is the
> paraphrase-grade residue of doing doc research through a summarizer, and the resolution modes
> sort cleanly by cost: types in node_modules < raw page < probe < spike. The routing table's
> upgrade row already encodes the general rule; B1–B4 are just that rule applied before the
> four tickets that need it.
