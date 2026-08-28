# Side quest — validated construction from a filled IR

## Status

Side quest, not a mission. Created 2026-08-28 from the Mission 2+3 talkthrough
review (assumptions, tensions, gaps; see `HANDOFF.md` and
`docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md`).

- It services Mission 3's one residual failure (real-model construct rejected by
  `parseSDCPNFile`) and produces design input for Mission 5
  (`MISSION.next.md`, "typed map and Petrinaut read/write"). It is not Mission 5.
- It does not supersede `MISSION.md`. Mission 3 remains the live mission until a
  human accepts or closes it; this file does not archive it.
- Bounded, hypothesis-testing, one paid run unless the user re-budgets. When it
  ends, its outcome is recorded here and in the mission chain, and this file is
  retired.

## Ownership split (review decision, 2026-08-28)

- **Prompting is ours.** How-to-build guidance (interview policy, composition
  teaching, "how to build a Petri net" description) is authored by Brunch. The
  latest `petrinautAiPrompt` on `main` (post-FE-1516) is the reference for what
  that guidance must cover — Brunch resources may teach from it but never hand-
  copy it. Its interview/escape-hatch policy stays out of the runbook's
  elicitation discipline.
- **Contracts are Petrinaut's.** TypeScript API contracts and payload shapes
  concerning Petri nets and Petrinaut (zod schemas in
  `@hashintel/petrinaut-core/src/action-schemas.ts`, the net definition shape,
  code-surface field names) are owned by Petrinaut. Brunch consumes them via
  import/generation; hand-duplicating them into Brunch-authored resources is
  forbidden. FE-1516 drifted a prose copy within a day of landing — that is the
  standing counterexample.

## Imperative

Prove that Run 2's filled runbook IR can drive Petrinaut's validated
construction API through a minimal tool subset inside the headless proof
runner, producing a document that `parseSDCPNFile` accepts, and inspect the
result's semantic fidelity against the IR. Isolate the serialization boundary
from elicitation quality: no interviewing, the IR is the only input.

## Throughline

`reuse runbook-headless-2026-08-28T11-03-53-683Z .ir.md → minimal tool subset mounted on the ChatAgent's construct phase → headless Petrinaut client executes validated mutations → parseSDCPNFile(definition.get()) → semantic inspection against the IR`

The headless runner has no browser; it acts as the client by creating a core
`Petrinaut` instance over `createJsonDocHandle` and executing the same
callbacks the browser dispatcher would. Tool subset:
`getLatestNetDefinition`, `addType`, `addParameter`, `addPlace`,
`addTransition`, `addArc`. No elicitation turns, no `brunch_ask`, no sweep, no
capture-store write.

## Spikes

1. **Schema bridge.** Flue tools in this repo mount valibot schemas;
   `petrinautAiTools` are zod with no Flue `run`. The bridge must keep
   Petrinaut's canonical zod contract the single source of truth. Options to
   adjudicate, cheapest surface first: (a) transform zod → valibot preserving
   descriptions; (b) move one side to Standard Schema so either engine
   validates; (c) generate/emit JSON Schema from the zod sources and mount
   schema-agnostically. Decision criteria: no drifting hand-duplicate of
   Petrinaut-owned shapes; the zod sources remain canonical; the transformation
   is mechanical, not maintained prose.
2. **Headless instance.** `createJsonDocHandle` + `createPetrinaut` + mutations
   + `parseSDCPNFile` round-trip on its own before any model is involved.

## Proof

1. The reused IR drives the validated tools to a document `parseSDCPNFile`
   accepts (`ok: true`) without the model emitting free-form net JSON at any
   point.
2. Every tool call is schema-validated; any rejected call returns to the model
   and is corrected in-loop. Record the count, classes, and cost of
   corrections.
3. Semantic inspection: places, transitions, exclusive modes, and weights in
   the built net correspond to the IR's claims; the IR's named losses and
   unknowns are still named, not silently hardened.
4. The run writes no capture store and performs no elicitation turns.

## Constraints

- One model-facing agent, the production door, Flue happy paths; no second
  server, TUI, workflow engine, or skill catalog.
- Do not grow into Mission 5: no panel integration, no interactive tool
  widgets (`applyAutoLayout` prompt), no client-side diagnostics correlation
  (`getNetCompilationErrors` may be omitted this quest), no canvas-position
  quality bar — dummy or omitted positions are fine if the parser accepts
  them.
- No hand-duplicated Petrinaut payload shapes anywhere in Brunch resources or
  prompts.
- One paid run. A miss becomes a recorded finding, not a second run, unless
  the user re-budgets.

## Stop or reorient

Stop and surface evidence before continuing if:

- the bridge requires maintaining a hand-duplicate of canonical schemas rather
  than mechanically transforming or generating them;
- construction demands material the IR does not contain — that falsifies the
  IR-suffices assumption; surface it, do not re-interview;
- the quest begins absorbing Mission 5 surface (panel, widgets, diagnostics);
- `parseSDCPNFile` still rejects a document built exclusively through validated
  mutations — that would implicate the file-format vs action-schemas alignment
  gap, which is a Petrinaut-core question, not a Brunch one.

## Expected outcome and what it decides

- Expected (inferred, high confidence): tool-backed construction removes the
  serialization failure entirely; the quest converts that inference into
  evidence and measures the correction loop.
- It decides whether Mission 5's mechanism should be pulled forward as the
  construction path, and what Mission 5's design must include (bridge shape,
  headless client pattern, IR fidelity findings).
- If construction demands IR changes, record them as Mission 3/Mission 5
  design input, not as runbook edits.
