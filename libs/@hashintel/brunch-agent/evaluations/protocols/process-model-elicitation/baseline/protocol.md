# Baseline control — experiment protocol (FE-1361)

What does one-shot / guided AI elicitation already achieve, and what changes when reviewed
completion diagnostics drive the guidance? The read-out lives in the immutable
[evaluation evidence](../../../../docs/evidence/evaluations/process-model-elicitation/baseline/readout.md).

**Status (2026-08-25).** Conditions 1 and 2 are frozen reference evidence: they are rerun only if
the instrument itself changes (expert pack, probes, turn budget), never per design cycle. Condition
3 is retired, never run; its preregistration and lock stay as the record of what was planned (see
the amendment atop [condition-3-preregistration.md](condition-3-preregistration.md)). Conditions 4
and 5 are the live arms of the ADR-0007 convergence cycles: 4 measures the teaching layer as text,
5 measures the shipped harness around that text. Each design cycle reruns both.

## Conditions

| #   | Interviewer     | System prompt                | Approximates                                                                                                                                           |
| --- | --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `claude-opus-5` | none                         | the incumbent: a strong model told to interview-then-build (the Petrinaut assistant's prompt already mandates interview-first, per the FE-1358 survey) |
| 2   | `claude-opus-5` | [v0-prompt.md](v0-prompt.md) | the degenerate plugin: the seven-category elicitation surface as pure guidance, no machinery                                                           |
| 3   | _retired_       | [condition-3-prompt.md](condition-3-prompt.md) | **retired 2026-08-25, never run**: the FE-1402/FE-1403 completion-and-guidance treatment with a test-only operator projection. Superseded by ADR-0007, whose completion machinery is the shipped harness that condition 5 exercises; the hand-run operator would have measured a projection of it |
| 4   | `claude-opus-5` | [condition-4-prompt.md](condition-4-prompt.md) + the harness's rendering of `repertoire.yaml` and `plugin-sdcpn/plugin.yaml` | the ADR-0007 teaching layer as prompt only (fixed keys, repertoire default, plugin cells, `construct` runbook); no captures, fold, or completion machinery. Its 2→4 delta measures what the keys and repertoire buy over the seven-category prompt |
| 5   | `claude-opus-5` | the shipped SDCPN elicitor's own instructions (binding-flue composes the ask protocol, the settlement protocol, and the same rendering as condition 4) | the harness in the loop: the real `brunch-sdcpn-elicitor` agent in the Flue runtime with `ask`, the settlement nudge, private `sweep` extraction into the capture store, fold, and computed completion. The 4→5 delta measures what the machinery buys over the text; the store is the deliverable |

Conditions 1, 2, 4, and 5 receive the identical opening user message
([opening-message.md](../../../cases/process-model-elicitation/baseline/opening-message.md)); the
v0 system prompt is the only difference between conditions 1 and 2, so the 1→2 delta measures what
pack content alone buys. Condition 3 would have used the same base opening plus its preregistered
single-session treatment sentence and the corrections and instrument recorded in
[condition-3-preregistration.md](condition-3-preregistration.md); it was retired before its first
model call.

## Subject and interviewee

Subject: **Production Process Scheduling** (Notion use-case DB, the mature spec'd case with a
reference model — FE-1363 retained it as the flat-baseline testbed). The interviewee is a
simulated expert per the FE-1363 resolution: `claude-sonnet-5` role-playing a master scheduler,
defined by
[situation-pack.md](../../../cases/process-model-elicitation/baseline/situation-pack.md). The pack
was authored from the use case's
operational prose (problem & context, data requirements, commercial angle) and never from the
model outline — pack and reference model sit on opposite sides of the information wall. Facts
are tiered: freely given, _(tacit)_ (surfaces only under reaching questions), _(believes)_
(honest perspective error), _(doesn't know)_ (genuine absences the interviewer should record
rather than fill).

## Mechanics ([run.ts](run.ts) for conditions 1–4; [harness-run.ts](harness-run.ts) for 5)

- Alternating API calls; each side sees only its own history. The interviewer never sees the
  situation pack; the expert never sees the v0 prompt.
- In condition 3 (retired), a separate operator would have seen only transcript-visible evidence
  and the frozen FE-1402 DemandTable, emitting a judgment trace after every expert answer while the
  interviewer received only the selected diagnostic; the code remains in `run.ts`, sealed.
- A `claude-haiku-4-5` classifier checks each interviewer turn for the final model deliverable;
  delivery ends the run. Condition 5 has no classifier: the deliverable is the capture store,
  folded, and the interviewer ends its own turn-taking by replying without a question. The
  condition-4 read-out records a classifier false negative on a gap-declaring delivery; that
  instrument weakness is one reason condition 5 reads the harness's facts instead of judging text.
- **Condition 5 loop**: the runner starts the Flue runtime in-process with the shipped
  `SdcpnElicitor` (its model overridden to `claude-opus-5` through `BRUNCH_SDCPN_MODEL`) and drives
  it through the SDK client over the app's own router. After each interviewer turn it reads durable
  history — visible text, `brunch_ask` questions, `brunch_sweep` results, harness signals, submission
  settlements — and folds the capture store into the elicited model with the harness's own
  `foldElicitedModel`/`evaluateCompletion`. The expert sees the interviewer's visible text and its
  pending question; its reply is dispatched as the next user message, which the binding binds to the
  pending ask. When the interviewer ends a turn without a question the expert replies to the
  statement as a plain dispatch. Interviewer tokens come from Flue's `observe()` turn events, never
  hand-counted. Nothing is interpolated into the interviewer's instructions.
- **Condition 5 stop rules**: `closed-complete` (no question pending and the harness reports the
  model complete); `closed-incomplete` (no question pending after the forced wrap); `stalled` (three
  consecutive interviewer turns without a question before the wrap); `submission-failed`/`-aborted`
  (the runtime settled short of a reply); `hard-stop` (24). The forced wrap is dispatched in place of
  an expert reply from turn 20 onward.
- **Impatience probe**: on exchange 8 the runner appends a scripted time-pressure line to the
  expert's reply, identically in both conditions (LLMREI found LLM interviewers end too readily
  on impatience cues; ReqElicitGym found the opposite failure of exhausting the budget — the
  probe plus the budget makes both observable). Conditions 1 and 2 retain that inherited placement;
  condition 3 triggers it on the first expert reply after the static floor passes and one objective
  row is active.
- Condition 3 raises a test-only `NP` advisory after three consecutive non-material expert frames
  and ends questioning after five, then permits exactly one interviewer response to deliver the best
  supportable result and explicit gaps. Only a new/replacement demanded evidence quote from the new
  expert turn resets the streak; regrading, row drift, quote order/duplication, and array length do
  not. It keeps completion unchanged and logs the intervention.
- **Turn budget**: forced wrap-up at 20 interviewer turns ("produce the model now"), hard stop
  at 24. Delivering only at the forced wrap is itself a stopping-discipline finding. Condition 5
  keeps the same numbers and the same impatience line at turn 8.
- The interviewer keeps the model's default adaptive thinking (part of "vanilla Claude"); the
  expert and classifier run with thinking disabled. When a final delivery is cut off at the
  response budget, the legacy runner stitches continuation responses into one message
  (`--continue-final` repairs an already-finished run the same way). Condition 3 instead preserves
  each truncation seam and writes seal-bound resume/continuation output to a new numbered segment,
  leaving its source raw checkpoint and marker unchanged. A checkpoint is written after every
  exchange.
- Sampling is default-temperature; runs are single-shot (n=1 per condition), so treat every
  read-out claim as existence evidence, not a rate estimate.

Rerun from the HASH root with
`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 1` /
`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 2` /
`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 4` (needs `ANTHROPIC_API_KEY`;
condition 4 imports the harness's built output, so `turbo run build --filter '@hashintel/brunch-agent'`
first, and writes the assembled system prompt beside its transcript as `condition-4-system.md`).
Condition 4 otherwise uses conditions 1–2's mechanics: the legacy impatience placement, turn
budget, and delivery classifier. Condition 5 runs from the application package, which owns the
agent composition: `turbo run baseline:harness --filter '@apps/brunch-agent'` (builds the workspace
first; writes `condition-5.md`, `condition-5.raw.json`, `condition-5-model.md`,
`condition-5-captures.json`, and `condition-5-system.md`). Condition 3's `-- 3` entry point remains
in `run.ts` but is retired; its lock no longer matches `protocol.md`, so it refuses to run.
Production transcripts land in
`docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/`. Tests set
  `BRUNCH_BASELINE_TEST_OUTPUT_DIR` to an isolated directory and never write committed evidence;
  the condition-5 test additionally swaps both models for stand-ins
  (`BRUNCH_BASELINE_ANTHROPIC_MODULE`, `BRUNCH_BASELINE_INTERVIEWER_PROVIDER_MODULE`).

## Instruments (scored in the read-out)

1. **Bano/Ferrari 34-mistake taxonomy**, via the operationalized Likert questionnaire
   (verbatim in
   [interviewing-literature-source-catalog.md](../../../../docs/reference/research/elicitation/interviewing-literature-source-catalog.md)),
   scored per LLMREI practice: Question Formulation, Question Omission, Order of Interview,
   Communication Skills, Customer Interaction (Analyst Behaviour and Teamwork & Planning
   dropped as inapplicable to a text-only single agent).
2. **Seven-category surface coverage**: per category — asked? probed past the first answer?
   present in the output? (objectives, structure, taxonomy, rates & distributions, policies at
   conflict points, constraints incl. unwritten, boundary conditions).
3. **Silent-assumption audit**: every load-bearing value or rule in the output model traced
   back to a transcript utterance; anything untraceable and unlisted is a silent assumption
   (Dora's explicit-list requirement).
4. **Structural sanity of the output net**, judged against the Petrinaut format facts from the
   FE-1358 survey (scenario-or-dead-net, PascalCase identifiers, no timing fields, arc shape).
5. **Stopping discipline**: reaction to the impatience probe; self-stop vs. forced wrap. In
   condition 5 also: whether the interviewer's self-stop coincides with the harness's computed
   completion, and how it uses the completion cue and the settlement nudge.
6. **Excavation checks**: did the interviewer surface the _(tacit)_ facts, correct the
   _(believes)_ errors, and record the _(doesn't know)_ absences as absences?
7. **Turn cost (condition 5 only)**: tokens per turn by purpose (interview, sweep, repair) and,
   once the runner records Flue's `turn` event `durationMs`, wall-clock per purpose and time to
   the visible question. The first run recorded tokens and the run window only; see the
   [turn latency assessment](../../../../docs/evidence/evaluations/process-model-elicitation/baseline/condition-5-turn-latency.md).

## Threats to validity (acknowledged)

- n=1 per condition; single-shot sampling. Findings are qualitative evidence for design, not
  statistics.
- The simulated expert shares a model family with the interviewer; an oversharing simulator
  would inflate coverage in both conditions equally, but absolute coverage numbers should not
  be read as human-interview performance.
- The v0 prompt was written by the same team that will score the transcripts. The mistake
  questionnaire is the external check.
- Condition 1 approximates the incumbent rather than driving the actual Petrinaut assistant
  (different provider/model, no tools). The FE-1358 survey's prompt excerpt is the bridge; the
  incumbent's tool-driven build loop is exactly the machinery this experiment holds constant.
