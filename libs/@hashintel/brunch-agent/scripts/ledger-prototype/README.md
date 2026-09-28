# Ledger prototype — throwaway, not production

Question: does an append-only, categorically organized scratchpad help an elicitor preserve evolving accounts, qualifications and potential conflicts without whole-document copying or mechanical reconciliation?

The proposed production design is captured in [`LEDGER-ARCHITECTURE.md`](./LEDGER-ARCHITECTURE.md). The recoverable artifacts and limitations of the first live run are under [`evidence/first-live-run/`](./evidence/first-live-run/). This README documents the throwaway prototype and how to run it.

This directory is independent of the Brunch production packages. It reads Brunch's guidance and case bundles; it does not modify them, start Brunch/Petrinaut, or install an extension into your Pi configuration. Plain Node.js ESM. Core mechanics have no dependencies. The simulation reuses the `pi` installation on `PATH`; `PI_SDK_ROOT` can override its inferred coding-agent package root.

## Reconstruction provenance

This durable project-local copy was reconstructed from the originating Pi conversation after the former `/tmp/brunch-ledger-prototype` directory was lost. The conversation retained the implementation, tests, documentation, architecture artifact, live-run final Ledger, tool receipts, public transcript, and run summary. The original native Pi session files and complete provider-request dumps are not recoverable byte-for-byte and are not represented as if they were.

## Try it

```sh
cd libs/@hashintel/brunch-agent/scripts/ledger-prototype
node --test ledger.test.mjs simulation.test.mjs
node demo.mjs
node simulate.mjs --case inventory-purchasing
node simulate.mjs --synthetic
```

- `demo.mjs`: an original Note and two potentially competing supersessions with `inferred` / `direct` annotations. All remain visible in full, historical, and subtree readback. Not agent-authored evidence.
- Plain `simulate.mjs`: prepares isolated prompts and an empty Ledger only. No model requests, SDK sessions, or credential access.
- `--synthetic`: real Pi SDK session/tool execution with scripted faux model responses. Exercises address refusal/repair and two successors to the same original, with no suppression. This is a wiring proof, not a persona simulation or quality grade.

A live two-agent run requires explicit model and spend choices:

```sh
node simulate.mjs --live --case inventory-purchasing \
  --elicitor PROVIDER/MODEL --persona PROVIDER/MODEL \
  --turns 10 --max-usd 2 --max-requests 80 --timeout-seconds 120
```

The command uses Pi's existing model catalogue and authentication without extension, skill, template, or AGENTS.md discovery. Thinking is low, subject to model capabilities. Both roles have separate native sessions; the elicitor gets only Ledger tools, and the persona gets no tools. The case's `situation-pack.md` reaches only the persona. The public opening is the content below the first standalone `---` in `opening-message.md`. Only conversational reply text passes between roles; neither private background nor the tool trace is handed to the other role by the runner.

`--max-usd` is a soft catalogue-cost guard, checked before each request. A single request can exceed the remaining amount; interrupted or missing usage can leave spend unknown, and the runner stops rather than treating that as zero. It is not an invoice-level or prepaid limit. A request-count limit and per-response deadline also apply. There is no automatic runner replay or resume after failure. Creating this prototype grants no authorization for a live run.

## The experiment

`profile.json` defines 13 addresses derived from the existing SDCPN workpiece template. Every node accepts Notes, including `operational`. Fixed topic paths only: entity and case names go in Notes, not invented path segments. The catalogue is shown in the elicitor prompt and commit-tool description; unknown-address refusals return the allowed paths. Editing this file affects new Ledgers; each Ledger stores its own profile snapshot.

`Ledger.commit(changes, hostContext)` accepts one atomic batch of 1–20 additions. The model-facing tool wraps this as `ledger_commit({ changes })`. Required fields are only `{ op, address, content }`; `disposition` is an optional short free-text annotation.

```js
// First call: the receipt returns a host-generated address, e.g. operational/resources/n1.
{ op: "add", address: "operational/resources", content: "Loading requires two people." }

// Later calls: reuse the actual address from the receipt or compilation.
{ op: "supersede", address: "operational/resources/n1",
  content: "Two normally, three for hazardous loads.", disposition: "inferred" }
{ op: "supersede", address: "operational/resources/n1",
  content: "Three whenever the second loading bay is open.", disposition: "direct" }
```

Both operations append new immutable Notes. `add` takes a configured category. `supersede` takes the full address of an already recorded Note; the host inherits its category and records a `supersedes` reference. Two contributions may supersede the same predecessor, in the same or separate commits. No Note is edited, moved, withdrawn, hidden, or declared the winner. Disposition is an open author-declared vocabulary, for example `inferred; unresolved`, not a validated authority ranking or state machine. Use the operation for a checked supersession reference; other relationships written in annotations or content remain prose.

The host generates `n1`, `n2`, … identities and full Note addresses. It records session, tool invocation, time and, in the simulation, the current public input ID. This identifies where the contribution was recorded, not which utterances substantiate it. No model-authored IDs, titles, source lists, or version preconditions. Receipts use `status: recorded | refused` so tool outcomes are not confused with Note dispositions; `recorded` does not mean semantically settled.

`Ledger.compile({ address?, revision? } = {})` returns `{ ledgerId, revision, scope, markdown }`. Omitted revision selects the latest committed prefix; `0` is empty. Compilation groups all Notes in that prefix by category and preserves their recording order within each category. It shows `[n8 — supersedes n7; inferred]` followed by the full reusable Note address and content. Earlier Notes and potentially conflicting successors all remain visible. An address selects a category subtree or one exact Note; exact-Note reads do not automatically include its relationship closure. Unknown addresses or revisions refuse. Empty categories mean unrecorded, not irrelevant. There is no model call, suppression, ranking, or conflict resolution in compilation.

Only accepted commits advance revision. Unknown categories or targets, malformed input, and conflicting invocation retries refuse the whole batch without writing anything. Storage errors throw. Exact retries return the original receipt and assigned addresses, without another commit. There is no stale-Note condition: every target is immutable and may have any number of declared successors. Referring to an as-yet-uncommitted Note is not supported; get its host-issued address first.

New logs use format 2. Earlier prototype run artifacts are left untouched and their rendered Markdown remains inspectable. The reader explicitly refuses the old format rather than silently reinterpreting it; start a fresh run. There is no migration machinery in this throwaway experiment.

## Watch a run

The terminal prints the public opening, then streams generated text under `ELICITOR` and `PERSONA` labels. Reasoning, private prompts, and raw tool arguments are not printed. Text is provisional while streaming and a failed response may stop partway through. The two sessions still receive only the same completed reply text as before; terminal observation does not change their inputs.

The runner prints the full path to `ledger.md` at startup. Open that file in a Markdown preview beside the terminal: it starts empty and refreshes after every successful `ledger_commit`, even in the middle of an exchange. Each refresh prints `[Ledger rN saved to ledger.md]`; refusals do not refresh it. Per-exchange snapshots are retained separately. These observer-side compilations are not fed to either model.

Live runs default to 10 exchanges—10 elicitor responses and up to 9 generated persona answers following the public opening—not 10 individual provider requests. Spend, request-count, and timeout limits can stop a run earlier; an exchange limit is not a claim that elicitation is complete.

## Artifacts and inspection

Each command creates a fresh ignored directory under `runs/` and prints its path. Simulation artifacts include:

- `ledger.jsonl`: one profile and identity header followed by immutable accepted commit records.
- `ledger.md`: live rendered account, refreshed after each successful commit and at shutdown.
- `ledger-N.md`: retained snapshot after exchange N.
- `conversation.jsonl`: public conversation with host-assigned `uN` input IDs for commit traceability; the model need not copy them.
- `tools.jsonl`: actual tool outcomes, including refusals.
- `elicitor/`, `persona/`: separate native Pi sessions.
- `elicitor-requests.jsonl`, `persona-requests.jsonl`: exact SDK request contexts for checking visibility.
- `elicitor-prompt.md`, `persona-private-prompt.md`: prompts used by the run.
- `configuration.json`, `outcome.json`: run inputs and terminal observation.

The elicitor prompt adapts the existing universal elicitation skill by removing its whole-document storage protocol, and includes the operational-domain profile. This is not production prompt parity. Construction is explicitly out of scope. The persona pack receives an explicit scope override so saved-account review, rather than net construction, can trigger its staged corrections.

Inspect filing choices, Note granularity, helpfulness of disposition annotations, retained qualifications, handling of apparent conflicts, redundant reads, and whether cold compilation makes the evolving account understandable. Compare the compiled account to public utterances for grounding; the private pack tells you what could have been elicited, not what the elicitor was entitled to record. A bounded run ending is not interview completeness. Runs are observations, not automatic grades.

## Deliberate limits

- No Flue integration, browser UI, shared writers, dynamic addresses, or production migration.
- No closed epistemic ontology or passage annotations: author dispositions are opaque text; substantive qualifications stay local in prose. Host conversation linkage is not a semantic-support claim.
- Supersession target existence is checked, not the truth or appropriateness of that declaration. Other Note references remain prose; no transclusion or automatic relationship inference.
- Single-process writer only. The log is logically append-only; atomic file replacement publishes the preserved prefix plus one new record. No cross-process locking, power-loss durability, or exhaustive crash-recovery claim.
- Full-log replay and file copying are acceptable here; no checkpoint or cache machinery.
- The simulation persona composition intentionally matches the recovered prototype. It does not yet include the product persona `SYSTEM.md`; the first live run showed that its case-only persona was too generous and too aware of elicitation needs.
