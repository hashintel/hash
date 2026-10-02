# Eliciting skill: analysis and build log

Companion to [`SOURCE-MAP.md`](./SOURCE-MAP.md), which says where each fragment came from. The recomposed skill is now the `manual` arm's `chat-agent/guidance/manual/skills/eliciting/SKILL.md`. The "draft" in the probe results below is that skill before the opening-battery decision at the end.

## Why the current skill reads as fragments

1. **The names were compressed away.** The lib sources gave each move a heading that said what it was for: "Slice a concrete case", "Deposit and defer", "Press without trapping", "Silent hardening". The app skill fuses two to five headings per bullet and drops the names, so the model gets the content without the handle it would think with.
2. **Workbench vocabulary leaked into the prompt.** "The five roles below are not phases…", "directives govern conduct and selection", "not a register": these describe how the September drafts were organised. The model is never told what a register or role is, and nothing it should do changes.
3. **Inventories stand in for instructions.** The list of states ("unknown, unasked, declined, deferred, ambiguous, corrected, conflicting and context-dependent") appears three times. "Information needs" is about 120 nouns. Lists like these say what exists, not what to do.
4. **Much of it is owned elsewhere in the `manual` arm.**
   - The Ledger vocabulary in `tools/ledger/terms.ts` has dimensions, done criteria and each kind's expected needs. With the coverage receipt from every commit, it already says what the account needs.
   - `prompts/system.md` covers pinning the purpose, breadth before depth, one frame per turn, keeping authorship separate, recording cadence and stopping.
   - `prompts/identity-ledger.md` covers choosing the next question from coverage rather than the latest exchange.
5. **The strongest research-backed moves were lost:**
   - the premortem, which the literature calls the single strongest result;
   - the ACTA newcomer question ("what would a newcomer get wrong?");
   - quantiles rather than minimum, most likely and maximum;
   - "out of how many, over what period" before inferring a rate;
   - the synthesis's exact divergence question ("are you correcting that, or do both hold under different conditions?");
   - press without trapping, and trade concrete outcomes.
6. **The model loads it once.** Every persona run activates `eliciting` and `constructing` once, at the start. The skill body is one early block in context, so its opening and its handles matter far more than its description.

## Direction

- **Make the skill own how to ask.** The Ledger owns what to ask for and `system.md` owns the ground rules. This matches the research's advice to build "a small quiver with variant selectors, not a long menu".
- **Lead with the thesis the research converges on.** The person's knowledge is practical, not general (the say–do problem). So ask about real occasions, choose questions by what they could change in the model's answer (completeness depends on the question, per Sargent), and keep their words apart from yours.
- **Name each move and give its trigger.** "Walk a case", "Ask about the last time", "Sweep one property", "Run a premortem", "Put accounts side by side", and so on. A named move with a "when" is something the model can select; a fused sentence is not.
- **Turn the process cues into one table:** what they say, what to suspect, what to ask. This was the predecessor design's intent ("recognition connects to operations") and the most domain-specific, least compressible material.
- **Keep repairs as named failure→repair pairs,** not a semicolon chain.
- **Cut "Information needs"** in favour of one pointer: "The Ledger's coverage says what the account still needs."

## Build log

### Framing

- **Branches:** opening and pinning the purpose; choosing and asking the next question; handling divergence (correction, conflict, coexistence, consulted material); quantities; impatience and closing.
- **Invocation:** model-invoked. Flue lists the skill and `system.md` says when to load it. Each run activates it once at the start, so its context cost is a single early body, not a per-turn description.
- **Leading words:** the description fires on _interview_. The body uses _case_, _last time_, _sweep_, _premortem_, _deposit_, plus _fog_ for coherence with `system.md`'s fog-of-war wording.
- **Neighbour:** `constructing`. The disambiguating word is _net_: changing the net, or proposing experiments on it. The description now carries a "not for changing the net" clause.

### Intents

| Intent                                                          | Original                               | Activator                                                                                          | Type                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| State the governing idea                                        | Spread over D1–D3 and the opening      | Thesis paragraph: practical knowledge, real occasions, purpose-relative, authorship                | elevate                                                                                                |
| Explain the five-role architecture                              | "The five roles below are not phases…" | —                                                                                                  | cut (exposition)                                                                                       |
| Pin the purpose and levers first                                | D1                                     | Left to `system.md` ("PIN THE PURPOSE")                                                            | cut (duplicate)                                                                                        |
| Breadth before precision; when to chase an ambiguity            | D1                                     | "the part of the operation still in fog"; the ambiguity rule kept                                  | compress                                                                                               |
| Choose by purpose, not the newest gap or Ledger order           | D2                                     | "Ask the question whose answer could most change what the model will answer"                       | elevate                                                                                                |
| Opening battery, then one frame per turn; their words           | D2, D5                                 | One line, following the opening-battery decision                                                   | compress                                                                                               |
| Keep authorship and absence states distinct                     | D3                                     | Thesis plus "Propose for correction"; the absence states are left to the Ledger's `standing` field | compress                                                                                               |
| Record and file Notes                                           | D4                                     | Left to `system.md` and the tools                                                                  | cut (duplicate)                                                                                        |
| Stop honestly                                                   | D6                                     | Left to `system.md`; "Closing" keeps the read-back                                                 | cut (duplicate)                                                                                        |
| Hedges and normative cues                                       | Cues 1–2                               | Table rows                                                                                         | keep                                                                                                   |
| Tension and silence cues                                        | Cue 3                                  | "Put accounts side by side"                                                                        | compress                                                                                               |
| Process cues (waiting, shared, failure, drift, batch, calendar) | Cues 4–6                               | Table rows                                                                                         | keep                                                                                                   |
| Burden, yield, breadth failure                                  | Cue 7                                  | "When the interview goes wrong"                                                                    | compress                                                                                               |
| Walk a case                                                     | M1                                     | **Walk a case**                                                                                    | keep (named)                                                                                           |
| Sweep a property                                                | M2                                     | **Sweep one property**                                                                             | keep (named)                                                                                           |
| Last occurrence, witness, basis                                 | M3                                     | **Ask about the last time**; **Ask for the basis** (newcomer question restored)                    | split                                                                                                  |
| Resource account                                                | M4                                     | Table rows for shared things and things a step needs                                               | compress                                                                                               |
| Contrast and side-by-side                                       | M5                                     | **Contrast**; **Put accounts side by side** (exact question restored)                              | split                                                                                                  |
| Propose for correction                                          | M6                                     | **Propose for correction**                                                                         | keep                                                                                                   |
| Quantities                                                      | M7                                     | "Quantities" (quantiles and "out of how many" restored)                                            | keep                                                                                                   |
| Failure, waiting, mode, grouping probes                         | M8                                     | Table rows                                                                                         | compress                                                                                               |
| Consult                                                         | M9                                     | **Consult**                                                                                        | keep                                                                                                   |
| Deposit; close                                                  | M10                                    | **Deposit and defer**; "Closing"                                                                   | split                                                                                                  |
| Premortem                                                       | dropped in the app skill               | **Run a premortem**                                                                                | restored                                                                                               |
| Trade outcomes                                                  | dropped in the app skill               | **Trade outcomes**                                                                                 | restored                                                                                               |
| Press without trapping                                          | dropped in the app skill               | Last repair line                                                                                   | restored                                                                                               |
| Information needs                                               | lines 46–55                            | "The Ledger's coverage says what the account still needs."                                         | cut (duplicate)                                                                                        |
| Verification restatements                                       | V1, V2, V4                             | —                                                                                                  | cut (duplicate)                                                                                        |
| Cold-reader check                                               | V3                                     | —                                                                                                  | cut: `identity-ledger.md` and the coverage receipt carry it. Restore it if runs show unreadable Notes. |
| Failure→repair pairs                                            | V5                                     | "When the interview goes wrong"                                                                    | keep (un-fused)                                                                                        |
| State a gap by what it prevents                                 | V6                                     | "Closing"                                                                                          | keep                                                                                                   |

### Novel content kept

- The cue table (process language → suspicion → question), specific to operational and Petri-net modelling.
- The rule for recording divergence: a correction is a supersession, a conflict is two contested Notes, coexistence is two Notes with their conditions. It is tied to this arm's Ledger semantics.
- "The Ledger's coverage says what the account still needs": the routing line between this skill and the Ledger.

### Sources activated

The skill names no authors, and every activator is a convergent term or a triangulation phrase. Inversion test for the terms used:

- _Premortem_ comes back to Klein; it is used as a bare term.
- The "last time" question comes back to contextual inquiry (Beyer & Holtzblatt); it is used as the question itself.
- The newcomer question comes back to ACTA (Militello & Hutton); it is used as the question itself.
- _Say–do_ is convergent (Goguen & Linde own it only within requirements engineering); it is used only in this analysis.
- _Quantiles over min/mode/max_ is convergent across expert elicitation; it is used as plain instruction.

### Probe results

Claude Opus 5.5 (the subagents inherited it), 2026-10-01. Two fresh subagents ran one pass each, n=1 per probe, on the same openings and the same `manual` prompts: one with the draft, one with the current skill as a control. Brunch itself runs GPT-5.5, so this checks that the text is legible and the moves get selected; it does not predict persona-run behaviour.

| Probe                            | Draft                                                               | Current skill                                                         |
| -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P1, first message                | Three questions in one turn; `system.md`'s "battery… 3–4" won       | Same; it noted the conflict with the skill's "one answerable opening" |
| P2, "usually free by 6"          | Ask about the last time (fired by name)                             | Asked for a counterexample from the last occurrence                   |
| P3, 4 h versus 12 h proof        | The exact side-by-side question; Notes linked, supersession pending | Similar question, phrased ad hoc                                      |
| P4, "sometimes late, 20 min"     | Asked whether it matters, then "how often, out of the last ten"     | Asked only whether it matters                                         |
| P5, five minutes left            | Named the biggest gap and offered "one question or stop"            | Read back and closed                                                  |
| A1, add a cooling step           | Routed to `constructing`                                            | Routed to `constructing`                                              |
| A2, compare two ovens with three | Routed to `constructing`                                            | Routed to `constructing`                                              |

## Decision: an opening battery, then one frame per turn

`prompts/system.md` asked for a battery of initial questions, three or four at a time, while its lower sections, the old skill and the draft asked for one question frame per turn. The probes showed `system.md` winning. The research leans single (FM-12 opening overload; mental models surface late), but the synthesis listed a shared-frame batch as unresolved.

The `manual` arm now allows one exception. The opening may be a battery of at most three or four questions that pin the purpose, and every later turn asks one question frame. The skill and both of `system.md`'s "one at a time" passages say so. Round 5 tests whether the opening battery overloads the person (FM-12).

## Recovering the sources

The research and drafts no longer exist in the tree:

```sh
git archive 9e9f72a96e^ libs/@hashintel/brunch-agent/docs/research/elicitation | tar -x -C <dir>
git archive da9f926ebb^ libs/@hashintel/brunch-agent/packages/core/_drafts/five-register-synthesis | tar -x -C <dir>
git archive 79529cb12b^ libs/@hashintel/brunch-agent/packages/core/_drafts/ampcode | tar -x -C <dir>
```
