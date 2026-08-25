# Where the interviewer's craft was supposed to live

> An audit of every form one idea has taken in this context: that some of what the interviewer
> is taught — how to open, when to walk one case and when to sweep, how to probe, how to vary
> with the expert's appetite, where not to dig, how to close — belongs to the harness and not to
> any one plugin. Produced 2026-08-25 from three full-read sweeps (specs, ADRs, and control
> surfaces; archive and reference; evidence, evaluations, inbox, agent protocols, and source
> prose) plus the Linear record of FE-1360, FE-1364, FE-1397, FE-1403, FE-1406, and FE-1407. It
> feeds [ADR-0007](../../../adr/0007-harness-teaching-meets-plugin-content-at-fixed-move-headings.md)
> and is evidence, not authority: where it quotes a document, that document governs. Counts are
> case-insensitive occurrence counts over the named trees at the audit date.

## The question

Brunch has always had a clear answer for _what to notice_: that is the plugin's job, keyed to the
kinds of its target formalism. It has never had a settled answer for _how to interview_. The idea
that the how-to is generic — owned by the harness, the same for `gherkin` and `sdcpn` — has been
written down at least fifteen times since 2026-08-06, under eight vocabularies, assigned to five
different layers, and designed zero times. Each restatement shrank the obligation without
answering it. The most recent (2026-08-25) reduced it to moving five table rows.

## The forms it took

Each entry: when, where, what the idea was called, which layer it was put in, what moves it
enumerated, and what became of it.

**2026-08-06 — the two intake documents.** The agentic-elicitation challenges and criteria
papers (`docs/reference/agentic-elicitation-*.md`) call the craft _lenses_ plus a
_DialoguePolicy_: "the agentic part is primarily deciding which lenses are relevant, what to ask
next, and when to stop." Plugins "contribute domain knowledge without independently taking over
the conversation"; the runtime decides "whether this matters" and "how to phrase the question."
Layer: plugin content, runtime arbitration. Enumerated: eight lenses; a policy with issue
prioritisation, question budget, confirmation thresholds, stop conditions. Fate: lenses became
"agent-native observe"; the question budget was rejected the next day.

**2026-08-06/07 — kernel issues 04, 05, 07.** The craft becomes _kernel cards_ (Detects / Goal /
contrastive Questions / Artifacts) inside the plugin's ElicitationPack, with the principle that
"agents do better with behavioural guidance than procedural" — refined into **Principle v2**:
_procedure for mechanism, anchors for judgment, shapes for output_, designed against sprawl,
negation-steering, no-ops, and judgment-as-procedure. Issue 05 refuses to mechanise economy:
"economical interviewing is implemented through strategy and judgment guidance in pack kernel
cards." Layer: plugin owns the cards; the harness owns card activation and pack loading. Fate:
the card is retired (ADR-0006); Principle v2 survives as the authoring standard for prose.

**2026-08-10 — kernel spec §11.1, §11.2, §11.4.** Pack = cards + annotated shapes + completion
contract + _clarification hints_. §11.4 adds brunch-inherited _pattern guidance_: hash-pinned,
ablatable prompt directives ("a load-bearing prompt paragraph as a versioned, testable
artifact") and a private scratchpad that is "not harness session state." Layer: plugin, with an
operator-prompt register for §11.4. Fate: §11.1 superseded → partial; §11.2 superseded →
pending; §11.4 never built, never retracted.

**2026-08-11 — kernel spec §11.5, added on review.** The split rule is coined: **"guidance
ownership follows vocabulary ownership."** Cards that teach what to notice in a domain are plugin
content; cards that teach "how to work an interview situation the envelope can name" (conflicts,
alternatives, ambiguity, weak or missing evidence, absence clusters) "may ship with the harness as
a **generic strategy quiver**, composed by plugins at authoring time." Explicitly "named, not
designed: milestone one ships all guidance in plugin packs." Reference shapes: brunch's
`ln-grill`, `ln-disambiguate`, and the `elicitation_style: interrogate | disambiguate | propose`
trichotomy. Layer: harness, by rule; plugin, by deployment. Fate: never retracted, never
designed. `SPEC-LEDGER.md` still carries it as "**pending** — was orphaned … now FE-1406."

**2026-08-11 — the expert meeting.** No in-house interviewing practice existed to harvest ("we
didn't actually do any pattern elicitation"). Dora's requirement — "can we build an architecture
whereby we can update the way the elicitor asks these questions easily" — is recorded as direct
validation of a swappable guidance layer. Fate: activated the literature fallback (FE-1360).

**~2026-08-12 — the v0 prompt, condition 2.** Self-described as "the degenerate plugin: the
smallest possible pack content, with no machinery behind it." It is the first and still the
clearest enumeration of the moves, as headings: **Objectives first · Slice, then sweep · Probe;
don't settle for the first answer · Ask for absences explicitly · Batch breadth, sequence depth ·
Keep an assumption ledger · End properly.** Layer: operator prompt standing in for the plugin.
Fate: merged nearly verbatim into the SDCPN plugin file's `Moves` on 2026-08-25; the prompt
itself is sealed evaluation input.

**2026-08-12 — grilling inputs.** The first explicit inversion toward the harness. _Facets_
(declarative, plugin-filled) are separated from _motions_ (procedural, "harness-generic"):
**slice motions** ("one case end-to-end first … slice before sweep") and **sweep motions** ("make
one property hold across one stratum — every activity a duration, every contention point a
policy") and _impact/leverage order_. "Most interviewing-strategy value is generic
(harness / strategy-quiver layer); the CPS plugin is a comparatively thin domain shell." The note
observes that "the motion vocabulary appears original — no KA/RE/conceptual-modelling equivalent
found." Layer: harness. Fate: archived as a planning input, never ticketed.

**~2026-08-12 — the FE-1360 literature deposit.** Some thirty imports, each filed under the
recurring heading "pack-content candidates" and written as cards (opening-five, mean-or-tail
router, knowledge-audit sweep, premortem, exception sweep, definition-of-done, an explicit
anti-card "do not synthesise from the catalogue", probe-depth policy, anti-batching guard,
vagueness guard). Two rules bear on layering: "build a small quiver with variant selectors, not a
long menu," and one universal follow-up ("how would you know that?") that "upgrades every other
card." Four cognitive stopping rules, with the warning that representational stability — stop
when the model stops changing — is the one an LLM will implement by default and one of the two
associated with premature stopping. Layer: pack, with the generic inversion implicit. Fate:
active reference; most cards later dispositioned out at the desk.

**2026-08-13 — IR Layer B and the baseline readout.** Two decisions cut in opposite directions.
The IR keeps the _motif quiver_ "in the ElicitationPack as question guidance only — scaffold yes,
generator no," and makes interview **ordering a derived consequence of question-relative
completion rather than a taught sequence**, replacing PRO-98's fixed category order. FE-1397's
routing verdicts formalise §11.5: "routes only the _technique_ to the generic quiver … the _kind_
stays in each plugin's catalog," and "a kind migrating to the harness is a finding, not a
failure." The same day the readout concludes that "everything both conditions still get wrong …
is a thing a prompt cannot fix and the harness/plugin design claims to." Layer: technique to
harness, kind to plugin, adjudication to machinery. Fate: the ordering decision became ADR-0006
decision 3 and completion rule 5; the quiver routing was never acted on.

**2026-08-14 — penciled directions.** The richest single form. A plugin manifest with twelve
keys — `licenses`, `techniques`, `movements (slice_moves, sweep_moves)`, `scopes_and_motifs`,
`rabbit_holes`, `failure_modes`, `smells`, `lenses`, `checks`, `tools`, `ontology`, `schema` — and
an **ownership sort per key**: "generic licenses and failure modes are quiver/harness-side; domain
instances are plugin-side … 'you may press a busy expert' is an envelope-vocabulary license
(quiver-side) while 'press on tint-qualification claims' is the same key plugin-side." Three
prompt mechanisms (license, technique, attention). Two core modes — objectives capture with a
slice-and-trace bias and systematic extraction with a sweep bias — that "must present as
postures, not a state machine." An incorporation rubric whose hardest axis is _trigger accuracy_:
"a card that can't say when it fires is sprawl." And the observation that "`rabbit_holes` is
quietly the most novel key: anti-guidance — where _not_ to dig — which nothing in the imported
literature covers." Layer: split per key. Fate: the `firesWhen` and `technique` hook points
landed in the declarative contract and were retired with it; `rabbit_holes` appears nowhere else
in the corpus.

**2026-08-17 — the Flue cheatsheet and ADR-0002 N2.** The delivery mechanism is decided: "Flue
skills _are_ the card-delivery mechanism … do not invent a card loader inside the harness."
Topology rule N2: plugin content ships from plugin packages; "quiver (FE-1406) content is
harness-shipped: same rule, exported from core (or a `packages/quiver`)"; never per-agent
`skills/` directories in the app, and the boundary gates enforce it. Layer: binding delivers,
harness ships. Fate: active and gated; the content it would deliver was never written.

**2026-08-18 — ADR-0003.** The plugin contract becomes purely declarative — model schema,
proposal catalog, fold table, demand table. This version has no guidance surface at all.

**2026-08-19/20 — FE-1406 scope settled; FE-1403 and FE-1407 framed.** FE-1406's body is the
sharpest statement of the harness half. Kickoff "is a form the agent fills implicitly": objective,
why, boundaries, and "the interaction posture inferred from available time, intended use,
required confidence, and tolerance for agent-proposed assumptions." **"Strategy varies with the
inferred posture: explore openly when appetite is high; synthesise and invite correction when it
is constrained; propose low-risk structure and question only high-impact uncertainty in mixed
cases."** The shared capability set is ask, propose, contrast, expose assumptions and gaps,
capture corrections, stop with visible gaps; "the quiver says how to combine those capabilities …
the agent chooses among applicable strategies." FE-1403 tags cards `envelope-generic` "so they can
graduate to the harness quiver instead of being lost in the CPS pack," with the admission test
"does it fire at a moment where the baseline demonstrably failed, or where the bare model already
succeeded?" FE-1407's catalogue assigns every failure an accountable layer — disposition,
technique, or machinery — and finds twelve of fifteen are machinery; technique owns **FM-12
opening overload, FM-14 unresolved-ambiguity bypass, FM-15 unlicensed influence**. Layer:
harness for the quiver, with graduation staged through the plugin. Fate: the FE-1406 text was
moved under a "Superseded" banner on 2026-08-25.

**2026-08-24 — S-005 and the completion rehearsal.** The teaching is split three ways as queue
items: FE-1403 domain guidance, FE-1406 quiver, FE-1404 instrument with an activation matrix. The
rehearsal fixes the machinery side: "completion, delivery, stopping, deferral, and no-progress
remain separate computed or observed facts. Guidance owns none of their adjudication."

**2026-08-25 — FE-1403's desk replay, then ADR-0006 and S-007.** Of the card candidates, six
survive and eleven are rejected as redundant-with-instinct, untestable-at-desk, or superseded by
machinery; the one generic survivor (GEN-Q02, bound a question batch) is "a candidate for FE-1406,
not already-graduated harness strategy." The same day ADR-0006 collapses everything into one
sectioned file per target formalism: cards become `Patterns` rows; clarification hints become
`Moves` steps; `Moves` are job runbooks — "kickoff, trajectory, checks, and stopping" — and
"harness-generic patterns may later lift into a harness repertoire (FE-1406, gist: strategy
quiver)." The `domain` tag is ruled a mis-tag. FE-1406 is rescoped to moving P06, P09, P10, P11,
P12 into "a harness-level repertoire document." Completion rules 15–19 move stopping into session
control. In the production path, harness-owned teaching is the ask, settlement, and completion
instruction fragments in `packages/core` — about eight sentences — followed by the plugin file's
prose, concatenated.

## The words

The same concept under different names, in order of appearance. Counts are across the
documentation and source trees at the audit date.

| Concept | Names it has carried | Where it stands |
| --- | --- | --- |
| The unit of guidance | kernel card (27 in archive/reference, 11 in canon) → interview card → attention / technique / license card → pattern row (`Patterns`, ~190) | Card retired; pattern row is the unit, kind-indexed, "surfaced, never mandated" |
| The harness-generic half | DialoguePolicy → generic strategy quiver (5) → motions, "harness-generic" (9) → quiver-side manifest keys → harness repertoire (2) | Named in §11.5; ledger "pending"; FE-1406 reduced to five rows |
| The ordered part | clarification hints (6) → `Moves` steps → runbook (kickoff · trajectory · checks · stopping; 5) | Container defined; contents plugin-authored |
| Slice and sweep | "Slice, then sweep" (v0) → slice motions / sweep motions → `movements (slice_moves, sweep_moves)` → `Moves` steps 2 and 3 | Never in canon; only in the v0 prompt, two archived planning notes, and the plugin file. `sweep` collides with the harness capture operation (~280 mechanism hits against ~50 for the move) |
| Where not to dig | `rabbit_holes` (2, one line pair) → "redundant-with-instinct" dispositions → negations inside `Moves` steps ("do not sweep before it", "Do not ask the expert what you have failed to ask") | Named once as a key; survives only as negation-steering |
| The listener | question budget (rejected) → appetite / interaction posture → `elicitation_style` trichotomy → "postures, not a state machine" → "batch two to four" | Settled in FE-1406 on 08-19; superseded 08-25 |
| Stopping | End properly → Close honestly → `HINT-RESPECTFUL-CLOSE` → completion rule 15 | Whether one _may_ stop is session control; how to close well is prose |
| The trigger | Detects (21) → `firesWhen` (11, retired) → `when` column | Hardest slot to fill (penciled rubric); conversational triggers have no machine form |
| Zero hits | `runbook` before 08-25 · `rabbit-hole` outside the penciled note · `fixed heading` before ADR-0006 · `trick` · `tangent` · `interviewing craft` · `operator prompt` | — |

## Where the layer was put, by date

| Date | Source | Layer for the how-to |
| --- | --- | --- |
| 08-06 | intake papers | plugin content, runtime-arbitrated |
| 08-06/07 | kernel issues 04, 05 | plugin cards; harness activates |
| 08-10 | kernel §11.1–11.4 | plugin; §11.4 operator-prompt register |
| 08-11 | kernel §11.5 | **harness by rule** (envelope vocabulary), plugin by deployment |
| 08-12 | v0 prompt | operator prompt ("degenerate plugin") |
| 08-12 | grilling inputs | **harness** (motions), plugin (facets) |
| 08-13 | IR Layer B, FE-1397, readout | technique → harness; kind → plugin; adjudication → machinery; ordering derived, not taught |
| 08-14 | penciled manifest | split per key by ownership sort |
| 08-17 | ADR-0002 N2, cheatsheet | binding delivers; **harness ships quiver content** |
| 08-18 | ADR-0003 | no guidance surface |
| 08-19/20 | FE-1406, FE-1403, FE-1407 | **harness** (posture-varied strategy); plugin stages generics for graduation; machinery owns 12/15 failures |
| 08-24 | S-005 | three queue items: domain spec, harness quiver, evaluation instrument |
| 08-25 | ADR-0006, S-007 | **plugin file** under fixed headings; harness repertoire "later"; FE-1406 → five rows |
| 08-25 | completion rules 15–19 | stopping → session control |

The trajectory: plugin (08-06 → 08-11) → harness by rule (08-11 → 08-20, four independent
restatements) → machinery absorbs adjudication (08-13, 08-20, 08-24) → plugin file absorbs the
prose (08-25). The harness half was affirmed at every station and built at none.

## What never found a home

1. **The split rule is canon and was never designed.** §11.5's "guidance ownership follows
   vocabulary ownership" (08-11) was reaffirmed by FE-1397 (08-13), ADR-0002 N2 (08-17), FE-1406
   (08-19), and the kernel supersession map (08-25: "unchanged in principle"). It has an owning
   issue and a ledger row. Each rescoping shrank the deliverable — from a designed quiver, to
   graduated cards, to five relocated rows — while the rule itself stood.

2. **The moves were never enumerated in canon.** Specs, ADRs, and control surfaces name the
   container (`Moves`, runbook, kickoff/trajectory/checks/stopping) but never the moves. The four
   documents that do — the v0 prompt, the grilling inputs, the penciled manifest, and the SDCPN
   plugin file — are respectively sealed evaluation input, archived, archived, and one plugin.

3. **The SDCPN construct runbook is mostly harness craft filed in a plugin.** Of its six steps,
   Open with objectives is generic in method (the `objective` kind is the only formalism-specific
   word); Slice is generic; Sweep is the generic move over the plugin's kinds; Probe is generic;
   Keep the ledger and Close honestly restate harness rules. A `gherkin` plugin written to the
   same contract would repeat five of six steps — the exact outcome FE-1403's tagging was meant to
   prevent.

4. **Two dimensions were always present and never separated.** One is _sequence_: open, then
   slice, then sweep, then close — Principle v2's "procedure for mechanism." The other is
   _selection_: which probe to use, whether to slice or sweep now, how to phrase the next question
   for this expert's appetite — "the agent chooses among applicable strategies," "postures, not a
   state machine." The v0 prompt listed both kinds as sibling headings; the manifest sorted keys by
   owner but not by this axis; the runbook glossary names only the sequence.

5. **Anti-guidance was named once and lost.** `rabbit_holes` (08-14) — "where _not_ to dig" — is
   the one key the literature does not cover and the baseline's budget-burning argues is real.
   It survives only as negations inside steps, which is the negation-steering Principle v2 warns
   against when a warning has no place of its own.

6. **The delivery mechanism is decided; the content was never written.** ADR-0002 N2 fixes where
   harness-shipped guidance lives and gates it mechanically. What ships today is eight protocol
   sentences.

7. **Selection needs an input, and kickoff was designed to produce it.** FE-1406's 08-19 text
   made posture a kickoff output that strategy varies with. The 08-25 rescope dropped both
   halves.

8. **The failure catalogue already says which failures are the harness's to teach against.**
   FM-12 (opening overload), FM-14 (ambiguity bypass), and FM-15 (unlicensed influence) are the
   three technique-owned failures; they correspond to how to open, how to probe, and what one is
   licensed to do — not to any kind or slot.

## Strain

Places the record disagreed with itself or resisted a single reading during this audit.

- **`sweep` means two things.** The harness capture operation and the interview move share one
  word at roughly six to one. Any heading that names the move must say which it is.
- **`card` means two things.** The guidance unit and the UI question affordance
  (`product-description.md`).
- **Three sizes of one obligation.** FE-1406's title today ("Lift harness-generic patterns into a
  strategy repertoire"), the ledger row ("§11.5 pending"), and the supersession map ("any
  harness-generic guidance would take the same `Patterns`/`Moves` shape") describe the same
  obligation at three sizes and prejudge its shape.
- **ADR-0006 decision 2 makes `Moves` plugin-owned by mechanism.** "Every other section
  concatenates into the interviewer's instructions" leaves no place where a harness cell and a
  plugin cell could meet; decision 5's "may later lift" has no mechanism to lift into.
- **Repertoire content is not pattern-shaped.** FE-1406's rescoped done-when has the parser
  reading the five rows with stable ids under the surfacing rule, but P06 (a vague quantifier)
  and P10 (an expert who does not know) trigger on conversation, not node state; the harness
  cannot match them. They are probe forms, not patterns.
- **The glossary asserts the shape before the design.** `CONTEXT.md`'s retired Kernel card entry
  says the quiver "becomes harness-generic patterns lifted out of plugin files."
- **The most explicit teaching text is sealed evaluation input.** The v0 and condition-3 prompts
  carry the fullest prose; the production path carries the least.
