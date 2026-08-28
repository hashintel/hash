Draft of upcoming missions, and the record of what we currently think we know about what to
do next — ideas, observations, questions, and named mechanisms already raised. Not execution
authority. Implement against [`MISSION.md`](MISSION.md). Do not promote this file wholesale.
Do not keep two live missions.

Likely future missions are the `#` headings that name a cut. Imperative, Throughline, Proof,
and Status wait until a cluster is cut into `MISSION.md`. Constraints, fog, and stop lines
appear where the 2026-08-27 grill (Q1–Q17) already earned them. Spikes that are not missions,
and standing lock / out-of-scope decisions, are not fake missions.

Provenance for the grill: [`docs/inbox/2026-08-27-mission-close-and-next.md`](docs/inbox/2026-08-27-mission-close-and-next.md).
Live Mission 3 is the runbook / template / headless / off-canvas-PN experiment. Archived
Mission 2 is the mechanical capture pipe. Neither is restated here as a mission.

```text
M1 chat (done)    M2 pipe (archived)    M3 runbook (live)
├─ Host (uncut)
│   ├─ two brains, same panel
│   ├─ net create/save/load = session discriminator
│   └─ compaction reconstructs panel + transcript
└─ Brunch elicitation
    ├─ M4  typed map + Petrinaut R/W
    └─ M5  capture improvement (observer, maybe types, maybe subagents)
LATER / parallel — OTel/eval, watch-sims, HarnessAgent
```

Two trunks, one live `MISSION.md`. Parallel means stacked branches or worktrees, not two
authority files. Q1-C (two live missions at once) was rejected.

# Capture and runbook stay independent

Not a mission. A standing constraint on every elicitation cut.

Capture (archived Mission 2) and the runbook / IR path (live Mission 3) were brought in
together so strain is visible. There is **no designed join**. Whether they converge, and if
so where, when, and in what form, is an open later question. Do not wire them in order to
tidy the list.

Q12 A/B/C were all refused:

- **A (refused).** Two artifacts with a designed join: capture store as provenance ledger,
  template as workpiece, M5 when ledger entries grow types that match M4's map.
- **B (refused).** One artifact: sweep's opaque payload *is* the template update.
- **C (refused).** M3 ignores the capture store; M2's store sits idle until something typed
  exists.

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
requires a model call; a sweep tool appears on the interviewer; kinds / slots / fold /
plugins / repertoire re-enter as the teaching vehicle; the runbook or IR template is wired
to the store; ordinary turns return to condition-5 latency.

# Host trunk

Later cut. Does not need the capture pipe. Does not need a runbook. Compaction sits here
because it is the same reconstruction family as save/load, not because it is prompting.

OTel may ride this trunk if it is in flight; it must not sequence the elicitation ladder
(Q4-B). Voice is a git parent, not a cluster here.

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

**Locked (Q3-A).** Net id is only the conversation discriminator. A distinct Brunch
target-document stays later. Do not collapse "one net *is* the target-document" — that is an
unearned product ontology and would leak into HASH entity vs demo localStorage. Q3-B
(collapse) and Q3-C (sweep in a throwaway store, splice later) were rejected.

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

# Typed map and Petrinaut read/write

After live Mission 3. FE Petri-net generation from some kind of IR, at the minimal typing
sophistication necessary: what maps to what. The flue agent must be able to generate a PN
using tools, given an IR.

**Why this cluster exists.** FE generation is the consumer that can reject a vague shape,
and it is how you learn the target BE capture has to converge on. It is also a chance to
iterate on the PN tools and see whether many changes can land at once.

**Locked.** Brunch agent read/write of the live net via existing panel `onToolCall`, not by
absorbing the stock modeller or its 46-tool set. Second assistant, not a replacement
modeller. No canvas mutation tools before this cut — they waited here so Mission 3 could
not draw nets from vibes. Which tools, when: not decided.

**IR at this cut.** Mission 3's IR is a markdown template (skill supporting file),
structured but not strictly typed; generation uses inference. This cut introduces the typed
map (which fields become places / transitions / arcs). Q8-B (M3 already uses core kind/slot
tables; the template is only a projection of the fold) and Q8-C (skip the document
template; typed IR starts in M3) were rejected. B would put the full plugin IR back on the
door too early.

**Teaching vehicle.** Q2-A: one real Flue skill is the cheap proof that the teaching
*mechanism* works (Mission 2 landed `defineSkill` / `useSkill` / `activate_skill`). Do not
grow a skill catalog. Iterate the runbook body (which may live inside that one skill, or as
instruction text). Flue `useSkill` (progressive-disclosure `SKILL.md` catalogs,
`activate_skill`) is not always-on `useInstruction` / the agent's return string, and is not
Brunch repertoire (core YAML, off this path). Q2-C (re-admit repertoire/plugin keys onto
this door) was rejected.

**Headless vs canvas.** Headless JS-API drive (`createFlueClient` → `send` → `wait` →
`history()`) is how you iterate a runbook; it belongs with Mission 3, not as a sibling of
R/W. Q7-A (keep R/W in M3) and Q7-C (runbook is just ongoing edits, not a mission) were
rejected.

# Capture improvement

After the typed map, or after the runbook path has shown what it can do without types.
This is where latency and judgment re-enter **on purpose**, so the untenable threshold is
visible. Maybe typed payloads that match the FE map; maybe not, if the runbook path is
winning.

## Observer agent as the sweep mechanism

Not a harness counter parked as a label. The observer **is** the sweep mechanism.

**When (from the Pi extension, and Q11).** Count tokens — no model call to decide *whether*
to sweep. Arm after N tokens (Pi precedent: on the order of 10,000). Fire on the next
settled turn. Anything that does not require an LLM call to decide when to trigger is a
latency saving. The trigger is not the interviewer calling a tool.

Q11-A locked this observer out of Mission 2: a token counter is a scheduler, and putting it
in the pipe proof would make "did we pick the right N?" look like a sweep failure. Q11-B
(M2 includes the observer; lower N so a short chat crosses it) and Q11-C (bonus hook on the
same `apply-sweep` in M2) were rejected.

**Calls.** Fire-and-forget, **queued**, **retried on failure**.

**Fold gate.** Cannot fold unless the queue is valid.

**Ordinary turns.** The elicitor mostly follows tip / heuristic / situation / example
guidance and **does not consult the fold**. A periodic **re-group every XX tokens** lets
the queue settle, fold, and see what is still needed.

**Fold semantics** as generic as we can possibly get away with.

**Scheduler vs model.** Binding can still *run* apply-sweep; the model is not the
scheduler. A sweep tool on the interviewer is an LLM decision about *when*, which is the
latency mechanism to keep off the path until this cut admits judgment on purpose (Q15-A,
carried forward from M2).

## Extraction thickness (reintegration ladder)

Mission 2 proved the pipe with no extraction model: one envelope per user utterance, quote
= that text, payload `{}`. That stays the floor.

Progressive re-entry after the pipe is green, when you are trying to notice the threshold:

1. Stub envelopes (done).
2. A **separate** cheap extraction call (not the interviewer) that emits quotes / opaque
   blobs only — no slot types, no mapping to kinds (Q14-B, not yet admitted).
3. Typed claims / plugin proposal catalog (`statement-noted`, SDCPN slots, …) — the
   condition-5 failure mode (Q14-C). Re-enter only to see the threshold, not as the
   teaching vehicle.

Q14-A was M2's cut (no extraction model). B and C belong on this path, not earlier.

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

Q4-B: do this on Host if that trunk is in flight; do not let it sequence the ladder. Not
C (OTel as a proof bullet of the first Brunch or Host mission). The original "prove this
too, in mission 2" was retracted.

## Watch simulated conversations

Parallel spike, not a mission. The product itch: there is not yet a way to visually observe
simulated conversations. That dissatisfaction is the reason this spike exists; it is not
on the critical path.

**Locked (Q9-A).** Driver: `@flue/sdk` JSON (`createFlueClient` → `send` → `wait` →
`history()`), not PTY poll. Human observer: the same conversation URL. `:4321` already
follows a conversation (`useFlueAgent`) but only paints text — render `dynamic-tool` /
`data-*` / skill activation. The missing piece is a **second observer on the same
conversation URL**, not a new protocol. Herdr panes are PTYs, not browsers; herdr cannot
embed that page. A pane can at most open the URL or tail the transcript CLI.

**Rejected.** Q9-B: wait for a herdr webview / JSON pane as the real product (blocks on
herdr). Q9-C: watch sims in the Petrinaut panel, including a client-tool stand-in (couples
every sim to panel client tools you do not need for elicitation rehearsal).
`HarnessAgent` is not this surface.

## AI SDK 7 `HarnessAgent`

Undecided. Converse of the current door (resume a harness session by chat id). Flue already
owns that session; `transport-aisdk` is the UI adapter. A Pi / Claude Code harness would be
another substrate — what `binding-flue` isolates — or a Flue replacement. Left as LATER,
not as the watch-sims surface.

# Mission 3 leftovers

Live Mission 3 locked a one-shot desk net (PN JSON, petrinaut validate, manual load OK) and
no canvas tools. These did not make that cut:

- Original M3 also allowed **periodic** PN generation from a filling template ("one-shot at
  end, or periodic"). Q13-B locked one-shot for Mission 3 so the runbook experiment has a
  score. Periodic generation remains a later idea.
- "Maybe wire PN JSON into the app programmatically" — manual load is enough to score
  whether the template contained enough. Programmatic load is leftover, not a Mission 3
  proof item.

Teaching ingredients (placement still fog on the live mission; recorded so a later cut does
not re-invent the bundle): some system prompting, some skill prompting, instructions on how
to interpret the runbook (system or skill), and a template resource that is the IR.
Bundling them in the skill is allowed. Growing a catalog is not.

# Standing decisions

Not missions.

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
