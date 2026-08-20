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
| A1 | **Core was a schema bag; the suspension protocol lived in the binding.** The second-binding test (spec §14.2) failed in spirit: the affordance id scheme, one-live-affordance rule, reply-binding narration, and instruction assembly were portable harness mechanism in `binding-flue/src/index.ts` | deep-read FE-1389; CONVERGENCE §12.2; topology.md N1 | **Discharged by FE-1422** (`ln/fe-1422-ask-protocol`, 2026-08-18) | `packages/core/src/ask-protocol.ts` now owns minting, guard, signal payload, and instructions; the binding is hook wiring | Done — landed before FE-1391/FE-1392, preserving the accepted spine |
| A2 | FE-1420 findings 1+3: benign tool retry refused as duplicate ask; no relief for an abandoned pending slot (§7.5 `unanswered`) | deep-read FE-1389; FE-1420 | FE-1420 | One-line id-tolerant guard + outcome recording | FE-1392 separately delivered §8.6's derived affordance-bound accounting advisory; retry tolerance, free-text accounting, and abandoned-slot relief remain here. Finding 2 (markdown floor) rides `@flue/react` parts with FE-1385 |
| A3 | **Evidence pointers were caller-supplied; §5/§8.2 require harness derivation.** | CONVERGENCE §5 contradicted row; deep-read FE-1390 | **Discharged by FE-1391** (`ln/fe-1391-entry-projection`, 2026-08-18) | Caller inputs now carry verbatim quotes only; the store resolves them once against the archive and persists harness-owned ordinals | Done — range/source assertions are refused at every evidence-bearing command surface |
| A4 | `resolve-conflict` rejects structured-tap evidence (§8.5 strict reading vs §5.1/C4) — a user who resolves by tapping cannot close the conflict | CONVERGENCE §8.5-adjacent contradicted row | **DECISION** — FE-1395 × FE-1390 seam (cross-comments posted) | Adjudicate when FE-1395 picks the reply encoding; store rule follows the decision | None further; both tickets carry the seam note |
| A5 | Confidence accepts scalar strings (`"0.93"`); spec: qualitative, never a scalar | deep-read FE-1390; CONVERGENCE §5 partial row | **Design discharged by FE-1405; store rule unowned** | FE-1405 settled `firm | hedged | speculative` without changing the envelope; the remaining change is one store rule refusing numeric-parsing confidence strings | Keep the store refusal explicit as residual work; FE-1392 consumes the settled vocabulary but does not widen into that envelope change |
| A6 | Issue `origin` is self-declared; producer unauthenticated (invariant 6 partial) | deep-read FE-1390; CONVERGENCE §6.3 row | **UNOWNED** (FE-1393-adjacent) | Producer identity needs a caller concept that first exists when plugin ops arrive; bind origin to the executing op, not a command parameter | Note for FE-1393's SDK design: the op context should mint the origin |
| A7 | Near-identical advisory fires for string payloads only; §6.2 promises flat-record plugins duplicate detection free | deep-read FE-1390 | **UNOWNED** (FE-1393-adjacent) | Extend `normalizedPayloadText` to flat records (sorted key=value join) when the first flat-record payloads arrive with the gherkin plugin | Note for FE-1393; test with its real payloads, not synthetic ones |
| A8 | Many-sessions-one-target-document unreachable: `chat.tsx` mints a fresh document id per page load (§9.1) | deep-read FE-1389; CONVERGENCE §9.1 row | FE-1396 (+FE-1385 UI half) | Stable target-document identity in the UI (route param), sessions attach to it | Recommend comment on FE-1396: the UI half is prerequisite to proving resume — coordinate with FE-1385 |
| A9 | `plugin.targetDomain` raw slug interpolated into the prompt ("elicit gherkin") | deep-read FE-1389 | FE-1393 (§11.1 plugin ownership) | Plugin declares a human phrase (`displayName` or prompt fragment) | Note for FE-1393 |
| A10 | **Pre-remote gates**: auth + per-conversation authorization (mounted route is public), runtime telemetry, persisted-state versioning/backup, restart durability | cheatsheet reconciliation; tilde analysis; routing table pre-remote row | **FE-1423** (filed 2026-08-17 under FE-1357; FE-1396 blocks it, covering the durability gate) | The ticket carries all four gates as its checklist; blocks remote exposure, not the demo | Done — Lu ratified the gates as **requirements** (2026-08-17); the telemetry gate carries the dual charter (floor: visibility; ceiling: traces feed our feedback/oracles) |
| A11 | Kickoff message is a machine-authored `user` entry (authored non-utterance) | deep-read FE-1389; trace §9.4 | FE-1420 (comment posted) + FE-1385 (`useInitialData` route) | Carry kickoff via `useInitialData`/signal | Done — comments posted on both |

Tracked-but-fine (no action beyond their rows): flat agent file → folders at FE-1385 (audit item 6).
FE-1392 supplied the intended `useInitialData` caller for immutable session-to-target binding
(audit item 13).

## Ledger B — information gaps, by cheapest honest resolution

| # | Question | Why it matters | Mode | Owner |
| --- | --- | --- | --- | --- |
| B1 | Capability 8's contract: what exactly does the durable entry projection's GET surface guarantee (paging, entry kinds, offsets) when read self-HTTP from in-process? | The binding's biggest docs-unsupported bet; FE-1391's archive and anchoring both stand on it | **Resolved and implemented (2026-08-18):** `history()` is one unpaged materialized-message snapshot; updates page at 100 durable batches and the SDK drains them, but chunks are UI-only protocol; 1,000 is an internal store cap, not a wire entry limit. The binding consumes `history()` through a host-injected full URL resolver and transport. See [source-read record](flue-entry-projection-source-read-2026-08-18.md) | **FE-1391 implemented:** archive-owned ordinals, identity-keyed versions, and actual injected-transport read are pinned in binding tests |
| B2 | Does compaction preserve the durable entry projection (history retention through compaction)? | Every long interview; evidence pointers bind to the projection | **Source-settled for Flue 2.0.3 (2026-08-18):** canonical storage is append-only; compaction appends a record and rewrites model context only; public history and persistent state survive. Reshape FE-1386 to one behavioral upgrade pin rather than an open-ended spike. See [source-read record](flue-entry-projection-source-read-2026-08-18.md) | **FE-1386:** separate narrow behavioral pin; deliberately not folded into FE-1391/FE-1392 |
| B3 | Exact private model-call surface for sweep extraction — previously paraphrased as direct `useSubagent` invocation | FE-1392 needs private structured extraction without granting pointer authority | **Resolved and implemented (2026-08-18):** installed 2.0.3 types and official docs show `useSubagent` is declarative/model-driven through `task`; `harness.prompt(..., { result })` is the direct private structured call inside a harness tool. FE-1392 uses it inside a durable tool with `step.do` boundaries | **FE-1392 implemented** |
| B4 | Can a skill-bearing agent run under `start()` in our node child process (Vite-graph resolution outside `vite build`)? | Decides whether FE-1403/06 card content is testable in our harness or needs fixture-grade copies | **Local probe**, hour-scale, when cards first compile | FE-1403/FE-1406 |
| B5 | The evals guide never documents the faux-provider pattern; our CI hermeticity rests on pi-ai's contract | A pi-ai breaking change silently breaks the hermetic gate | Pin pi-ai deliberately; **upstream question** to Flue (docs suggestion: the fetch-shim + faux pattern is worth documenting) | UNOWNED (small; ride any FE-1383 slice) |
| B6 | `dist/app.mjs` embedding contract, if the demo shell needs a custom host | Demo-shell chartering | **Raw-doc verification** at demo-shell design time; likely moot (recommended shape is the standard layout) | Demo shell (FE-1357-side, post-gate) |
| B7 | Load-bearing signatures generally: everything in the cheatsheet is paraphrase-grade unless marked | Silent API drift between paraphrase and reality | Standing rule (routing table, upgrade row + cheatsheet header): **raw-doc or node_modules types check at implementation time**, per feature, not as a batch | Standing — no ticket |

> **Reflection:** Ledger B's common thread is narrower than "lack of information" — every row is
> a place where we know *that* an affordance exists but not its *contract*. That is the
> paraphrase-grade residue of doing doc research through a summarizer, and the resolution modes
> sort cleanly by cost: types in node_modules < raw page < probe < spike. The routing table's
> upgrade row already encodes the general rule; B1–B4 are just that rule applied before the
> four tickets that need it. B1/B2 demonstrated the intended economy: the source read removed
> the architectural spike, leaving one compatibility pin rather than another discovery loop.
