# Condition 5 — turn latency assessment and recommended actions

> **Provenance.** Agent-authored diagnosis, 2026-08-26, of the first condition-5 run
> (2026-08-25, [transcript](transcripts/cycle-1/condition-5.md),
> [raw record](transcripts/cycle-1/condition-5.raw.json),
> [folded store](transcripts/cycle-1/condition-5-captures.json)). Commissioned by Lu after the read-out
> showed 2.4 minutes per interviewer turn: "not going to be viable at all, for a working
> application". Inputs: the raw record's per-turn tool calls, signals, sweep results, and usage
> totals; the runner [`harness-run.ts`](../../../../evaluations/protocols/legacy-baseline/harness-run.ts);
> `packages/core/src/sweep-protocol.ts`; `packages/binding-flue`'s sweep and settlement path; the
> Flue `OperationOptions`, `turn` event, and `DurabilityConfig` types in `node_modules/flue`.
> Status: **evidence and recommendation, not authority** — nothing here changes a spec, a key, or
> a sequencing cut by itself; STEERING carries the concern and the decision. The numbers are from
> one run and are existence evidence, not a rate estimate. Per-call wall-clock was **not
> recorded** (see §2); every timing claim below is derived from the run window and the token
> counts, and is marked as such.

## 1. Headline

The shipped SDCPN elicitor, run through the production Flue path against the simulated
coatings-plant expert, took **29 minutes for 12 interviewer turns** (run started
`2026-08-25T19:21:21Z`; artifacts written `19:50:21Z`): a mean of **~145 seconds per turn**,
expert reply included. The expert accounts for almost none of it (11 `claude-sonnet-5` calls,
3,478 output tokens in total). The interviewer made **37 model calls** — three per turn — and
emitted **152,204 output tokens**, of which roughly **4,300 are the interview** (the questions
and framing the expert reads) and roughly **148,000 are extraction**: 267 typed captures across
8 applied sweeps, plus three refused sweep batches re-emitted after repair. Input cost is not
the problem: 969,818 tokens were served from cache against 74 uncached input tokens.

In one sentence: **about 97% of what the interviewer generated was the capture store, and the
capture store was generated on the critical path between the expert's answer and the next
question, on the most expensive model, with thinking on.**

A human expert waits for a question; a working application needs the question in seconds. No
latency target has been set yet; §5 proposes one so the spike has something to pass or fail.

## 2. What was and was not measured

Measured, in the committed raw record:

- Per turn: the interviewer's text, `brunch_ask` calls, `brunch_sweep` results (applied /
  refused, applied capture ids, dedup skips, advisories), appended signals, tool errors, and the
  read-time completion over the store after the turn.
- Run totals: interviewer and expert usage (input, output, cache read, cache write, call count).
- The run window, from `startedAt` in the record to the artifact write time.

Not measured — the instrumentation gaps this document exists to close:

- **Per-call `durationMs`.** Flue's `turn` event carries `durationMs`, `request`, and
  `response.usage`; the runner subscribes to it for usage but does not record duration. So the
  split of the 145 s between the interviewing call, the sweep call, the repair call, and the
  expert cannot be stated from evidence. It can only be inferred from output volume (§3).
- **Per-call purpose.** Usage is summed per turn; the runner does not tag which of the three
  calls was the question, the sweep, or the repair. Flue's `LlmTurnPurpose` distinguishes
  `agent` from compaction but not our sweep from our ask; the tag has to come from the harness's
  own signal ordering.
- **Time to first visible question.** In the runner, `send`/`wait` returns when the agent's
  turn finishes, which includes settlement and sweep. Whether the production UI could show the
  ask before the sweep completes is a property of binding-flue's settlement ordering that this
  run did not observe.
- **Thinking tokens.** Output totals include reasoning where the provider bills it as output;
  the record does not separate them. The elicitor ran `claude-opus-5` at the model's default
  thinking level for every call, extraction included.

## 3. Anatomy of one turn

Each interviewer turn in the record has the same shape (turn 6 is the worst case, with three
sweep attempts):

1. **The interviewing call.** The elicitor reads the expert's reply, writes a short framing
   paragraph, and calls `brunch_ask` with the next question. Across 12 turns the visible text
   and questions total ~4,300 output tokens — a few hundred per turn. This is the only part the
   expert needs before answering.
2. **The settlement check.** The harness appends a `settlement-check` signal; the elicitor
   decides whether the unswept tail is settled and, if so, calls `brunch_sweep` with proposals
   for the whole unswept range. This is where the volume is. The unswept tail grows with the
   expert's answers, and the sweep proposes one capture per fact per slot.
3. **Apply, then advisories or refusal.** `apply-sweep` is atomic per batch. Applied batches
   return `appliedCaptureIds`, `skippedDedupKeys`, `advisories` (167 `possibly-equivalent`
   advisories over the run) and the completion report. A batch with one unresolvable quote is
   **refused whole** (`evidence-quote-not-found`; turns 6 and 10) and a `sweep-repair` signal
   asks the elicitor to re-emit it. Three batches were refused and repaired in the same turn —
   the verbatim floor worked — at the price of regenerating the whole batch each time.

Applied sweep sizes, from the capture deltas in the run log: 15, 28, 39, 32, 35, 32, 47, 39
captures (267 total). Growth is the wrong direction: the last full turns swept more than the
first, because the tail carried more and because nothing told the sweep which facts the store
already held.

### What a capture costs to emit

From the folded store (`store.captures`, 267 entries, 512,601 JSON characters — on the order of
146,000 tokens, which matches the extraction share of the output almost exactly):

| Field the model emits          | Mean size | Note                                                                                         |
| ------------------------------ | --------: | -------------------------------------------------------------------------------------------- |
| `evidence[]` (verbatim quotes) |  409 chars | The user's words re-typed by the model; one or more quotes per capture; resolved by harness   |
| `assertion.value`              |  145 chars | The fact, in the model's words — frequently restating the quote                              |
| `rationale`                    |   61 chars | Present on most captures; rarely load-bearing                                                 |
| `node`, `slot`, `kind`, `type` |   ~85 chars | The typed address; this is the part the fold and completion actually consume                 |
| `precision`, `confidence`, `epistemicStatus`, `sourceRegime` | ~30 chars | Enumerations                                                                    |

The harness-derived fields (`id`, `pointer`, `dedupKey` at 968 chars mean) are not emitted by
the model and cost nothing at generation time. So roughly **two thirds of each emitted capture
is text that restates text the harness already holds**: the quote, which the archive has
verbatim, and an assertion that paraphrases the quote. The typed address — what completion
needs — is a small minority of the envelope.

### Duplication

167 `possibly-equivalent` advisories against 267 captures, 30 open conflicts, and 7 objective
nodes for two objective questions say that a large fraction of the sweep's emissions restated
facts already captured, under slightly different node names. Every such capture was paid for
in full at generation time and then flagged after application. The fold has no identity step
that would let the sweep say "same node, supersedes" cheaply, and the sweep prompt does not
show the model the store's current node index.

## 4. Causes, ranked by share of the 145 s

Ranking is by output volume, since wall-clock per call was not recorded; the spike in §6
replaces this ranking with measurements.

1. **Extraction on the critical path.** The question is not delivered until the sweep (and any
   repair) completes. Even if extraction cost nothing to improve, the expert would still wait
   for it. This is a sequencing choice in binding-flue's settlement path, not a model cost.
2. **Extraction volume.** ~148k output tokens for 267 captures: whole-tail sweeps, ~350 tokens
   per capture, two thirds of it restated text, and ~40k tokens of whole-batch re-emission after
   three refusals.
3. **Extraction on the interviewing model at default thinking.** Structured transcription of a
   settled tail into a fixed schema does not need the interviewer's model or its reasoning
   budget. Flue's `OperationOptions` (`model`, `thinkingLevel`) on `harness.prompt` allow the
   sweep prompt to use a different model and thinking level from the interview; the elicitor
   does not set them.
4. **Duplication.** The sweep re-captures known facts because it cannot see the store's
   identity, so batches grow and completion cannot converge (46 unsatisfied at close, largely
   through conflict rather than absence).
5. **Three serial calls per turn.** Ask → settlement/sweep → (repair) are sequential
   round-trips on one conversation. With 1–4 fixed, this matters less; it still bounds the
   floor at three provider latencies per turn.

Not a cause, on this evidence: input size (cache hit rate is near total), the expert model, the
runner itself (in-process, `app.fetch`, no network beyond the provider), or Flue durability
timeouts (default 1 h; the aborted first run hit it only because of a network outage).

## 5. Recommended actions

Ordered by cost and by how much of the 145 s each is expected to remove. R0 is the
precondition for judging the others; R1 changes what the expert experiences without touching
extraction quality; R2–R4 shrink extraction; R5 addresses the growth.

**R0 — Instrument before optimising** (small; the runner and one dependency).

- Record `durationMs` from Flue's `turn` events per interviewer turn, tagged by purpose
  (interview / sweep / repair) from the harness's own signal order, plus the expert call's
  wall-clock, as a JSONL beside the transcript and as a column in `condition-5.md`'s turn
  header. This turns §4's ranking into a measurement.
- Install `@flue/opentelemetry` in `apps/brunch-agent` (it is referenced by Flue but not
  installed) so the same spans are visible when the app is observed under `herdr` rather than
  through the runner — Lu's "stop doing desk proofs" concern.
- Set a **target** so the spike can fail: proposed — question visible to the expert within
  **10 s** of their reply at p50; sweep settled in the background within **60 s**; a turn's
  total model output under **5k tokens** at steady state. These are proposals for Lu to set
  or replace; they are chosen so that a five-turn review-and-revise loop (the acceptance
  proof) fits in a few minutes, not a quarter of an hour.

**R1 — Take the sweep off the critical path** (medium; binding-flue settlement ordering).

Deliver the `brunch_ask` to the client as soon as the interviewing call emits it; run
settlement and sweep after delivery, so the expert reads and answers while extraction runs.
The cue for turn _n+1_ then reads a fold that may lag by one sweep, which the completion spec
already tolerates (completion is derived, never a gate). Risk to verify: the runner's
`send`/`wait` currently treats "agent turn finished" as "question available"; the production
binding must expose the ask earlier and the runner must measure from that point. Expected
effect on perceived latency: from ~145 s to the interviewing call alone — to be measured under
R0, plausibly one to two orders of magnitude.

**R2 — Run extraction on a cheaper, faster model with low thinking** (small; one option on
the sweep prompt).

Set `model` and `thinkingLevel` on the sweep and repair prompts via `OperationOptions` —
`claude-sonnet-5` or `claude-haiku-4-5` at low/no thinking — leaving the interview on
`claude-opus-5`. The spike (§6) measures whether typed-address agreement with the committed
store survives the change; the verbatim floor already catches misquotes mechanically, so the
risk is in kind/node/slot assignment, not evidence.

**R3 — Shrink the envelope and stop re-emitting whole batches** (medium; core sweep
protocol, §8.2 preserved).

- Emit `rationale` only when the expert gave a reason. It is already optional in core
  (`elicited-model.ts`); the SDCPN plugin's `ontology.attributes` invites it "on any kind", and
  the sweep supplied one on 196 of 267 captures, mostly restating the assertion. A one-cell
  wording change in `plugin.yaml`, not a schema change.
- Allow **abbreviated verbatim quotes** — an exact prefix, an ellipsis, an exact suffix — that
  the harness resolves to one archive span; this keeps the verbatim floor (§8.2: the model
  cites quotes, never pointers) while removing most of the 409 chars per capture. Ambiguous
  abbreviations refuse exactly as ambiguous quotes do today.
- **Partial application** of a sweep batch: apply the proposals whose quotes resolve, refuse
  only the ones that do not, and ask for repair of those alone. Atomicity per proposal, not
  per batch. This removes the ~40k tokens of re-emission seen in turns 6 and 10 and is a
  contained change to `apply-sweep`'s refusal path.

**R4 — Sweep selectively and against the store's identity** (medium; sweep prompt +
fold).

- Show the sweep the store's current **node index** (kind → node names, a few hundred tokens,
  cached) so it emits `supersedes` or skips rather than re-capturing under a new name. This
  attacks both the volume and the 167 possibly-equivalent advisories that block completion.
- Sweep **what the cue needs first**: proposals for the unsatisfied `Must know` rows before
  colour, so a truncated or lagging sweep still advances completion.
- Consider sweeping every second turn, or when the unswept tail exceeds a size, rather than
  on every settlement; the atomic, range-based sweep already supports it.

**R5 — Bound growth** (follows from R4; watch, do not build yet).

Captures per applied sweep rose from 15 to 47 over the run. With R4's identity index the
expectation is that late-turn sweeps shrink to genuinely new facts; if they do not, the growth
is a plugin-content finding (slots too fine) for the authoring lane, not a harness one.

### What not to do

- Do not lower the verbatim floor to free text; the three in-turn repairs are the one
  mechanism in the run that demonstrably kept the store honest.
- Do not move extraction into the same call as the question to save a round trip; that puts
  the volume back on the critical path and couples interview quality to extraction load.
- Do not tune before R0; a ranking from token counts is a hypothesis about time.

## 6. The spike, as proposed and deferred

Deferred by Lu on 2026-08-26 ("I'm not ready to run that spike right now"). Recorded so it
can be run without re-deriving it.

**Question.** How much of the 145 s per turn is extraction, and how much of extraction cost
can R2 and R3 remove without losing typed-address agreement with the committed store?

**Method.** Replay the frozen unswept tails of turns 3, 6 and 9 (taken from
`condition-5.raw.json` history) against `brunch_sweep` in isolation, through the shipped
sweep prompt, under a small grid: `claude-opus-5` at default thinking (the run's condition),
`claude-sonnet-5` and `claude-haiku-4-5` at low thinking; with and without R3's abbreviated
quotes and partial application. Record `durationMs`, output tokens, refusals, and, against
the committed store's captures for the same range, agreement on `kind`/`node`/`slot` and on
the count of possibly-equivalent advisories. One replay per cell; existence evidence.

**Instrumentation prerequisite.** R0's `durationMs` per purpose in the runner. Without it the
spike can report tokens and refusals but not the time split, which is the question.

**Decision the spike informs.** Which of R1–R4 the next arc builds first, and what latency
target STEERING carries. If extraction on the cheaper model agrees with the opus store on the
typed address at or above the run's own duplication rate, R2 is a one-line change and goes
first; if agreement drops, R1 and R3 carry the load and R2 waits for a better sweep prompt.

## 7. Consequences already recorded elsewhere

- STEERING lists per-turn latency as an immediate concern with this document as its source,
  a belief row on where the time goes, and a stop trigger if the next run over the harness
  does not measure time per purpose.
- The baseline protocol's condition-5 instrument list is extended to record `durationMs`
  per turn purpose when R0 lands; until then the transcript header carries tokens only.
- The `stalled` stop label the runner applied to this run is an instrument defect (the
  interviewer stopped itself after the impatience probe; three no-ask turns then fired
  `stalled`); rename to `closed-by-interviewer` when the runner is next touched. Recorded here
  so the read-out is not misread as a hang.
