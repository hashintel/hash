# Construction guidance review

A review of the prompt, skill and tool guidance Brunch receives, prompted by the live Ledger runs in [`scripts/ledger-prototype/evidence/live-product-runs/FINDINGS.md`](../../scripts/ledger-prototype/evidence/live-product-runs/FINDINGS.md), 2026-09-29.

## What the runs showed

Every run, typed or open, recorded a construction blocker in 73–84% of its turns. Two failure modes recur.

- **The net limits what follows it.** In the scripted typed replay, Brunch built an uncoloured order-status fragment at turn 4. At turns 9, 10, 19 and 22 it then recorded, as `settled` Notes, that the current net could not carry the ordering rule, the production gate or expiry, and left all three in the Ledger. The original Sol typed run followed the same shape: a small fragment at turn 4, then 33 turns with four further builds.
- **The Ledger becomes an attention sink.** The follow-up audit found that the next question usually targets the newest blocker's first askable item. Blockers followed each turn's topic rather than the purpose, so the interview narrowed on whatever came up last instead of mapping the operation. The open arm did better only when its rolling blocker happened to narrow to one askable fact (the supplier minimum at turn 12), and it still waited 11 turns to build anything.

Independent runs on `ln/pn-tooling-remediation`, before the Ledger replaced the workpiece, show the same stall. Construction happened at turns 2 and 7, then not again until turn 32, when the persona authorised illustrative values.

## Where the guidance produces this

Brunch's own guidance is about 95 KB across ten Markdown files, mounted beside Petrinaut's capability guidance of about 25 KB. Those ten files hold about 95 prohibitions and about 45 uses of "invent", "default" or "authorise". What to do when a fact is missing is scattered and hedged.

### A sanctioned outcome for doing nothing

`plugin-sdcpn/src/prompts/APPEND_SYSTEM.md:9` and `sdcpn-modelling/SKILL.md:32` require one of three dispositions after every meaning-bearing answer: changed, already represented or blocked. Blocked is satisfied by writing a Note, which makes it the cheapest of the three, and `APPEND_SYSTEM.md` adds that the record "does not open another disposition cycle". Its trigger, "the target cannot represent it", was read in the replay as "the current net cannot represent it".

### Unknowns forbidden, the escape closed

"Do not invent operational facts without authorisation" appears in `SYSTEM.md`, `APPEND_SYSTEM.md`, `SKILL.md:36`, `pn-construction.md:5` and `:11`, `checks.md` and `experiment-configuration.md:79`. `SKILL.md:36` also says that labelling an unsupported default as an assumption does not authorise it. The devices that let construction proceed without inventing facts do exist: a named parameter for an unknown rate (`pn-construction.md:108`), and an external source or event for an unknown trigger (the gate pattern). But they appear as "potentially acceptable" exceptions, not as the default move. Sol open used externally supplied events on its own; neither typed run did after turn 4.

### Authorisation required but never offered

Petrinaut's stock assistant carries an escape hatch (`petrinaut-core/src/ai.ts:294`): whenever it asks questions it offers "make it up" or "use sensible defaults". Brunch mounts `petrinautAiCapabilityGuidance` without that behavioural frame, and its own guidance requires explicit authorisation for defaults, so the model waits for permission it never asks for.

### Restructuring discouraged by a stale conditional

`pn-construction.md:128` says: without update or remove tools, apply only additive changes, otherwise "stop after analysis". Brunch mounts Petrinaut's full set of update and remove tools, so the condition never holds. The paragraph still frames the existing net as structure to preserve. Nothing says the net is a draft to reshape when a new rule does not fit it.

### Preconditions before construction

`pn-construction.md:7` ("Construction boundary") and `checks.md:25` ("Before construction") list what to confirm before building a fragment. Either can end in asking before building (`pn-construction.md:11`, `checks.md:38`). Each item is sensible; together they gate construction on completeness instead of checking what was built.

### Depth-first pressure from the Ledger and the interview

- `SYSTEM.md:31` says to record consequential gaps as Notes. `LEDGER_FIELDS.md:3` and `elicitation/SKILL.md:52` say to split each answer into a settled Note and an open one. The blocked disposition adds a gap Note most turns.
- `elicitation/SKILL.md:14`, `:36` and `:102` repeat "deepen one answerable thread" and "select the smallest consequential absence".
- Nothing asks for a low-resolution map of the whole operation early. Petrinaut's stock frame (`ai.ts:286`) asked for states, events, measures and scenarios before building.

The newest gap Note therefore tends to supply the next question, and the interview narrows on the latest topic.

### Repetition

Commit cadence, the invention prohibition and the three dispositions are each stated in two to six layers. The repetition weights the prohibitions far above the enabling guidance, and a change in one layer is overridden by the others.

## Recommended direction

These are hypotheses to test, not settled fixes.

1. **Build first.** Remove "blocked" as a disposition. Each meaning-bearing answer extends or reshapes the net. The reasons not to build are an unresolved contradiction or the person asking not to.
2. **Visible stand-ins without authorisation.** A named parameter with a placeholder value, an externally supplied event or input, or a labelled approximation keeps construction moving without asserting a fact. Record each as a construction Note and name it to the person when it matters to the result. What stays forbidden is presenting a stand-in as elicited.
3. **Offer defaults.** When stand-ins accumulate, or the person is terse, offer to use sensible values and proceed.
4. **The net is a draft.** When a rule does not fit the current representation, change the representation with the update and remove tools. Delete the stale additive-only paragraph.
5. **Breadth early.** Sketch the whole operation within the first few turns, as a skeleton net whose gaps are stand-ins, then deepen where the purpose needs it.
6. **Gaps do not steer.** Record a gap Note only when deferring it with a return path. Choose the next question from the purpose and the skeleton's stand-ins, not from the latest Note.
7. **Consolidate.** State each rule once, in the layer that owns it. Replace pre-construction checklists with checks of what was built.

The opposite failure is invented content presented as elicited. Evaluation therefore pairs the construction measures with a fidelity audit: does every value, trigger and rule in the net trace to the person, or to a stand-in labelled as one? The scripted replay (`scripts/replay.sh`) and a free-persona run give the same comparison points as the earlier runs.
