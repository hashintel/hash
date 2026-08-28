Self-contained canonical capture repository for upcoming missions: what we currently think we
know about what to do next — ideas, observations, questions, and named mechanisms already raised.
Not execution authority. Implement against [`MISSION.md`](MISSION.md). Do not promote this file
wholesale. Do not keep two live missions.

Plausible future missions are the ordered `# Mission N — …` headings. Imperative, Throughline,
Proof, and Status wait until a cluster is cut into `MISSION.md`. Constraints, fog, and stop lines
appear where prior discussion already earned them. Spikes, standing lock / out-of-scope decisions,
and a live mission's leftovers get unnumbered headings — they are not fake missions. Update this
file while planning context is active; it must carry full capture fidelity without relying on a
transcript. When cutting or regrouping, compare this draft before and after: every item must either
move into the live mission or remain here at the same fidelity.

Live Mission 3 is the runbook / template / headless / off-canvas-PN experiment. Archived Mission 2
is the mechanical capture pipe. Neither is restated here as a mission.

```text
M1 chat (done)    M2 pipe (archived)    M3 runbook (live)
├─ M4 host continuity and choice
│   ├─ two brains, same panel
│   ├─ net create/save/load = session discriminator
│   └─ compaction reconstructs panel + transcript
└─ Brunch elicitation
    ├─ M5 typed map + Petrinaut R/W
    └─ M6 capture improvement (observer, maybe types, maybe subagents)
LATER / parallel — OTel/eval, watch-sims, HarnessAgent
```

Two trunks, one live `MISSION.md`. Parallel means stacked branches or worktrees, not two
authority files. Keeping two live missions at once was rejected.

# Capture and runbook stay independent

Not a mission. A standing constraint on every elicitation cut.

Capture (archived Mission 2) and the runbook / IR path (live Mission 3) were brought in
together so strain is visible. There is **no designed join**. Whether they converge, and if
so where, when, and in what form, is an open later question. Do not wire them in order to
tidy the list.

Three premature convergence shapes were refused:

- **Designed two-artifact join.** Capture store as provenance ledger, template as workpiece,
  and Mission 6 as the point where ledger entries grow types that match Mission 5's map.
- **One artifact.** Sweep's opaque payload *is* the template update.
- **Idle capture store.** Mission 3 ignores the capture store and Mission 2's store sits idle
  until something typed exists.

**Why the typed-capture kernel failed (observation, not a plan).** The sweep mechanism with
typed captures became too complex and demanded too much LLM judgment to use it and to map
each part. The most recent real test was incredibly slow; the headline catastrophic outcome
was ordinary question turns taking upwards of two minutes. Progressive reintegration is how
the threshold becomes visible: re-admit pieces of that design until the mechanism is
untenable again, and notice where.

Runbooks and templates are **not yet connected** to the capture sweep. They are a prompting
experiment: how far a comprehensive runbook goes **without typed claims at capture**, pulling
in the research and design modeling already on disk. Template fill is not a sweep. Sweep
means capture-store apply.

**Strain threshold to watch** (condition 5): typed mapping, in-loop LLM judgment, question
turns on the order of minutes. Stop lines that carry forward from M2: producing captures
requires a model call; a sweep tool appears on the interviewer; kinds / slots / fold or the
plugin / repertoire YAML runtime re-enters as the teaching vehicle; the runbook or IR template is wired
to the store; ordinary turns return to condition-5 latency.

# Mission 4 — host continuity and choice

Later cut. Does not need the capture pipe. Does not need a runbook. Compaction sits here
because it is the same reconstruction family as save/load, not because it is prompting.

OTel may ride this trunk if it is in flight; it must not sequence the elicitation ladder.
Voice is a git parent, not a cluster here.

## Two brains, same panel

A person using the Petrinaut demo should be able to choose the stock modeller or the Brunch
Flue agent without relaunching. Today the switch is `yarn dev` vs `yarn dev:brunch`.

**Locked.** Brunch is a second assistant, not the new Petrinaut modeller. Panel stays
`useChat` / `onToolCall`. Do not splice conversations. Stock must work with brunch-agent
down. HASH embed stays stock unless opted in. Do not rewrite the panel onto `@flue/react`.

**Fog, unasked.** How both backends share an origin; where the picker lives; whether you can
switch mid-net or only at start. These were never grilled. They are unanswered questions,
not a thin cut.

## Net create/save/load is the session lifecycle

**Working assumption.** Petrinaut net id discriminates one Flue conversation per principal.
Prove create / save / load is also the session lifecycle: save/load keeps the same
conversation; a new net id mints a new one. If net ids regenerate or collide, drop the
assumption and rekey.

**Facts.** Conversation ids today are a localStorage map keyed by `netId`. New session =
mint another conversation id; resume = reload the same net. Archived Mission 2 already keys
the capture store by Flue conversation identity (principal + conversation id) until this
proof lands.

**Locked.** Net id is only the conversation discriminator. A distinct Brunch target-document
stays later. Do not collapse "one net *is* the target-document" — that is an unearned product
ontology and would leak into HASH entity vs demo localStorage. Two alternatives were rejected:
collapsing the net into the target-document, and sweeping into a throwaway store to splice later.

## Compaction

Prove the panel and transcript still reconstruct across a real Flue compaction boundary
(`compaction-vs-durable-history` / FE-1386). Compaction is Flue-default and unpinned.
Product control to compact, or to show a summarized range, only after that pin.

Moved here from the original M3 batching: it is history reconstruction, not a prompting
concern.

## Voice (git parent, not this cut)

Stack on `kostandin/h-6763-openai-canonical-speech` when that branch is the parent. Same
`POST /api/chat` dock Mission 1 named. Resolve UUID-per-net vs `petrinaut-preview:${netId}`,
stolen vs configured `/api/chat`, and `submitText` with no `brunch_ask`. Brunch owns no
provider audio. Not a mission.

# Mission 5 — typed map and Petrinaut read/write

After live Mission 3. FE Petri-net generation from some kind of IR, at the minimal typing
sophistication necessary: what maps to what. The flue agent must be able to generate a PN
using tools, given an IR.

**Why this cluster exists.** FE generation is the consumer that can reject a vague shape,
and it is how you learn the target BE capture has to converge on. It is also a chance to
iterate on the PN tools and see whether many changes can land at once.

**Locked.** Brunch agent read/write of the live net via existing panel `onToolCall`, not by
absorbing the stock modeller or its 46-tool set. Second assistant, not a replacement
modeller. No canvas mutation tools before this cut — they waited here so Mission 3 could
not draw nets from vibes. The retired Mission 3 side quest exercised six tools only in an
immutable headless construct mode; ordinary panel conversations remained unchanged. Which
tools and lifecycle belong on the live panel is still not decided.

**IR at this cut.** Mission 3's IR is a markdown template (skill supporting file), structured
but not strictly typed; generation uses inference. This cut introduces the typed map (which
fields become places / transitions / arcs). Rejected alternatives were to make Mission 3 use
core kind/slot tables with the template only projecting the fold, or to skip the document
template and begin the typed IR in Mission 3. The first would put the full plugin IR back on
the door too early.

**Teaching vehicle.** Standing decision, not this cluster's: see "Teaching mechanism" under
Standing decisions.

**Headless vs canvas.** Headless JS-API drive (`createFlueClient` → `send` → `wait` →
`history()`) is how you iterate a runbook; it belongs with Mission 3, not as a sibling of
R/W. Two alternatives were rejected: keeping read/write in Mission 3, and treating runbook
work as unbounded ongoing edits rather than a mission.

**Headless bridge finding.** The side quest proved that the built production agent can
mount exactly `getLatestNetDefinition`, `addType`, `addParameter`, `addPlace`,
`addTransition`, and `addArc` from immutable Flue `initialData`; a headless client can
execute those canonical Petrinaut callbacks and resume by call id; and
`parseSDCPNFile({ title, ...definition })` accepts the callback-produced document. The
hermetic run also proved canonical Zod rejection and correction of a zero-weight arc.

The one real-model run falsified the proposed schema-language bridge. A Valibot
`looseObject` + `rawTransform` can preserve canonical Zod validation and error paths, but
mechanically placing Zod JSON Schema in the description does not give the provider a
shape-aware tool schema. The model encoded `addType.elements` as a string nine times and
never reached a non-empty net. The parser accepted the empty file, which is not semantic
success.

Mission 5 must therefore require a mechanical, provider-visible schema path — preferably
Flue accepting Standard Schema or supplied JSON Schema, otherwise a shape-preserving
Zod-to-Valibot conversion. Do not copy Petrinaut payload fields into Brunch. Its acceptance
gate must combine parser success with a non-empty and semantically inspected net; parser
acceptance alone is vacuous. The full run and $0.24699 cost are recorded in the Mission 3
proof.

# Mission 6 — capture improvement

After the typed map, or after the runbook path has shown what it can do without types.
This is where latency and judgment re-enter **on purpose**, so the untenable threshold is
visible. Maybe typed payloads that match the FE map; maybe not, if the runbook path is
winning.

## Observer agent as the sweep mechanism

Not a harness counter parked as a label. The observer **is** the sweep mechanism.

**When (from the Pi-extension precedent).** Count tokens — no model call to decide *whether*
to sweep. Arm after N tokens (precedent: on the order of 10,000). Fire on the next settled
turn. Anything that does not require an LLM call to decide when to trigger is a latency saving.
The trigger is not the interviewer calling a tool.

This observer was deliberately kept out of Mission 2: a token counter is a scheduler, and putting
it in the pipe proof would make "did we pick the right N?" look like a sweep failure. Two Mission 2
alternatives were rejected: including the observer with a low threshold so a short chat crosses
it, and landing it as a bonus hook on the same `apply-sweep`.

**Calls.** Fire-and-forget, **queued**, **retried on failure**.

**Fold gate.** Cannot fold unless the queue is valid.

**Ordinary turns.** The elicitor mostly follows tip / heuristic / situation / example
guidance and **does not consult the fold**. A periodic **re-group every XX tokens** lets
the queue settle, fold, and see what is still needed.

**Fold semantics** as generic as we can possibly get away with.

**Scheduler vs model.** Binding can still *run* apply-sweep; the model is not the scheduler.
A sweep tool on the interviewer is an LLM decision about *when*, which is the latency mechanism
to keep off the path until this cut admits judgment on purpose. This constraint carries forward
from Mission 2.

## Extraction thickness (reintegration ladder)

Mission 2 proved the pipe with no extraction model: one envelope per user utterance, quote
= that text, payload `{}`. That stays the floor.

Progressive re-entry after the pipe is green, when you are trying to notice the threshold:

1. Stub envelopes (done).
2. A **separate** cheap extraction call (not the interviewer) that emits quotes / opaque
   blobs only — no slot types, no mapping to kinds; not yet admitted.
3. Typed claims / plugin proposal catalog (`statement-noted`, SDCPN slots, …) — the
   condition-5 failure mode. Re-enter only to see the threshold, not as the teaching vehicle.

Mission 2 chose the first rung: no extraction model. The second and third rungs belong on this
path, not earlier.

## Subagents

Undecided as a go-ahead. The idea is specific: subagents for **micro-cognitive tasks** that
help **decisioning and decomposition**. Not a floating maybe, and not the M2 teaching stub.

# Later / parallel

Not sequenced on the elicitation ladder. May ride along a live mission if the throughline
already has the hook. Not a numbered mission.

## Observability / eval / tracing

Node OTel SDK → HASH collector / Tempo. Flue `instrument(...)` already in `app.ts` but
nothing exports. Prove `gen_ai.conversation.id` = Flue instance id. `dispatch()` (the
`/api/chat` path) does not propagate `traceparent`. Content capture stays off until a
privacy policy. FE-1505 / FE-1423 stay production gates.

Do this on Mission 4 if that trunk is in flight; do not let it sequence the elicitation ladder.
Do not make OTel a proof bullet of the first Brunch or host mission. The original idea to prove it
in Mission 2 was retracted.

## Watch simulated conversations

Parallel spike, not a mission. The product itch: there is not yet a way to visually observe
simulated conversations. That dissatisfaction is the reason this spike exists; it is not
on the critical path.

**Locked.** Driver: `@flue/sdk` JSON (`createFlueClient` → `send` → `wait` → `history()`),
not PTY poll. Human observer: the same conversation URL. `:4321` already
follows a conversation (`useFlueAgent`) but only paints text — render `dynamic-tool` /
`data-*` / skill activation. The missing piece is a **second observer on the same
conversation URL**, not a new protocol. Herdr panes are PTYs, not browsers; herdr cannot
embed that page. A pane can at most open the URL or tail the transcript CLI.

**Rejected.** Waiting for a Herdr webview / JSON pane as the real product would block on Herdr.
Watching sims in the Petrinaut panel, including a client-tool stand-in, would couple every sim to
panel client tools unnecessary for elicitation rehearsal. `HarnessAgent` is not this surface.

## AI SDK 7 `HarnessAgent`

Undecided. Converse of the current door (resume a harness session by chat id). Flue already
owns that session; `transport-aisdk` is the UI adapter. A Pi / Claude Code harness would be
another substrate — what `binding-flue` isolates — or a Flue replacement. Left as LATER,
not as the watch-sims surface.

# Mission 3 leftovers

Live Mission 3 locked one off-canvas PN JSON result (Petrinaut validation, manual load OK) and
no canvas tools. These did not make that cut:

- Original Mission 3 discussion also allowed **periodic** PN generation from a filling template
  ("one-shot at end, or periodic"). The live mission locked one-shot generation so the runbook
  experiment has a score. Periodic generation remains a later idea.
- "Maybe wire PN JSON into the app programmatically" — manual load is enough to score
  whether the template contained enough. Programmatic load is leftover, not a Mission 3
  proof item.

The live mission now consumes
[`docs/specs/structurally-typed-elicitation-runbooks.md`](docs/specs/structurally-typed-elicitation-runbooks.md):
one agent, a concise always-on router, one runbook skill, and disclosed resources for elicitation,
the IR template, PN construction, and checks. Exact heading and resource boundaries remain live
Mission 3 fog, not successor work.

# Standing decisions

Not missions.

## Teaching mechanism

One real Flue skill is the teaching mechanism (Mission 2 landed `defineSkill` / `useSkill` /
`activate_skill`). Do not grow a skill catalog. A concise always-on instruction routes to the skill;
its body carries lifecycle procedure and its supporting resources disclose elicitation teaching,
the IR template, PN construction, and checks as needed. Flue `useSkill` is not always-on
`useInstruction`, and the runbook may incorporate repertoire content without re-admitting the core
YAML runtime or plugin keys onto this door.

Cross-cuts the live runbook path and the capture-improvement elicitor guidance; it belongs
to no single future cluster, so it stands here.

## Locked, not a mission

- Keep the AI SDK adapter. Do not rewrite the Petrinaut panel onto `@flue/react`.
- `@flue/react` stays appropriate for brunch-agent's local debug UI.
- `binding-flue` stays a package even if it is the only binding.
- Exploded-view net prototypes belong on petrinaut-website host routes, not on `:4321`.
- When `ChatAgent` leaves the app: `packages/<chat-agent>/` in libs; app remains the shell.
- Conditions 1 / 2 / 4 / 5 exist as batch jobs; condition 5's runner is broken on this app
  (deleted elicitor imports). The useful drive loop is `createFlueClient` → `send` → `wait`
  → `history()`. No TUI. Mission 3 restores that drive pattern, not the old SDCPN elicitor.

## Out of scope

- A HASH embed path that talks to Brunch.
