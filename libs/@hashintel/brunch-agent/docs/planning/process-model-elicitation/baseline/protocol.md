# Baseline control — experiment protocol (FE-1361)

What does one-shot / lightly-prompted AI elicitation already achieve? Two conditions of the
three-condition design (condition 3, kernel harness + real plugin, is out of this ticket's
scope). The read-out lives in [readout.md](readout.md).

## Conditions

| #   | Interviewer     | System prompt                | Approximates                                                                                                                                           |
| --- | --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `claude-opus-5` | none                         | the incumbent: a strong model told to interview-then-build (the Petrinaut assistant's prompt already mandates interview-first, per the FE-1358 survey) |
| 2   | `claude-opus-5` | [v0-prompt.md](v0-prompt.md) | the degenerate plugin: the seven-category elicitation surface as pure guidance, no machinery                                                           |

Both conditions receive the identical opening user message
([opening-message.md](opening-message.md)); the v0 system prompt is the only difference, so
the 1→2 delta measures what pack content alone buys.

## Subject and interviewee

Subject: **Production Process Scheduling** (Notion use-case DB, the mature spec'd case with a
reference model — FE-1363 retained it as the flat-baseline testbed). The interviewee is a
simulated expert per the FE-1363 resolution: `claude-sonnet-5` role-playing a master scheduler,
defined by [situation-pack.md](situation-pack.md). The pack was authored from the use case's
operational prose (problem & context, data requirements, commercial angle) and never from the
model outline — pack and reference model sit on opposite sides of the information wall. Facts
are tiered: freely given, _(tacit)_ (surfaces only under reaching questions), _(believes)_
(honest perspective error), _(doesn't know)_ (genuine absences the interviewer should record
rather than fill).

## Mechanics ([run.ts](run.ts))

- Alternating API calls; each side sees only its own history. The interviewer never sees the
  situation pack; the expert never sees the v0 prompt.
- A `claude-haiku-4-5` classifier checks each interviewer turn for the final model deliverable;
  delivery ends the run.
- **Impatience probe**: on exchange 8 the runner appends a scripted time-pressure line to the
  expert's reply, identically in both conditions (LLMREI found LLM interviewers end too readily
  on impatience cues; ReqElicitGym found the opposite failure of exhausting the budget — the
  probe plus the budget makes both observable).
- **Turn budget**: forced wrap-up at 20 interviewer turns ("produce the model now"), hard stop
  at 24. Delivering only at the forced wrap is itself a stopping-discipline finding.
- The interviewer keeps the model's default adaptive thinking (part of "vanilla Claude"); the
  expert and classifier run with thinking disabled. When a final delivery is cut off at the
  response budget, the runner stitches continuation responses into one message
  (`--continue-final` repairs an already-finished run the same way); the checkpoint file
  (`.raw.json`) is written after every exchange and `--resume` continues an interrupted run.
- Sampling is default-temperature; runs are single-shot (n=1 per condition), so treat every
  read-out claim as existence evidence, not a rate estimate.

Rerun from the HASH root with
`yarn workspace @hashintel/brunch-agent baseline:run 1` /
`yarn workspace @hashintel/brunch-agent baseline:run 2` (needs `ANTHROPIC_API_KEY`).
Transcripts land in `transcripts/` and are committed as the experiment artifact.

## Instruments (scored in the read-out)

1. **Bano/Ferrari 34-mistake taxonomy**, via the operationalized Likert questionnaire
   (verbatim in
   [../research/re-interviewing-literature-worker-report.md](../research/re-interviewing-literature-worker-report.md)),
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
5. **Stopping discipline**: reaction to the impatience probe; self-stop vs. forced wrap.
6. **Excavation checks**: did the interviewer surface the _(tacit)_ facts, correct the
   _(believes)_ errors, and record the _(doesn't know)_ absences as absences?

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
