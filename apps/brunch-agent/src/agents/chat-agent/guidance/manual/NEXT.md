# vocabulary harmonization

## judgments to review:

1. **`source`/`basis`/`standing` → `origin`/`status`.** The fields section now teaches the schema's own terms with their schema descriptions (origin: stated/evidenced/inferred/assumed; status: confirmed/tentative/conflicted/open/out-of-scope, confirmation only on the USER's words). v1's `basis` (observed/documented/practiced/estimated), `precision` and `qualifier` have no ledger2 fields — I directed those distinctions into claim text, beside what they qualify.
2. **`inapplicable` → `out-of-scope`, imperfectly.** v1's inapplicable standing meant "this need doesn't apply to this model"; ledger2's `out-of-scope` means "the USER agreed it stays outside the model". That's the closest status, but it requires USER agreement where inapplicable could be a joint judgment — worth a look at the rewritten paragraph in system.md's "Building up the model".
3. **Coverage is gone, not translated.** ledger2 returns no coverage receipt, so "choose where to go next from that coverage" became: choose from the compiled map and the purpose — an entity missing what its kind needs, an open/conflicted claim the measure depends on, or a needed placeholder. The "needs" idea survives as an interviewing heuristic rather than a tool-returned artifact; `eliciting`'s "The Ledger's coverage says what the account still needs" now points at the map.
4. **The empty `### addresses` placeholder** in `system.md` became a "records and routes" section teaching the commit contract: four routes, system-assigned IDs and turns, `e23`/`c45`/`$index` references, queue-aligned receipt.
5. **"contested Notes" → conflicted claims; "construction Notes" → reflections** anchored to net elements, claims and entities (matching `vReflection`'s anchoring check); "Note ids" → receipt record IDs; "consulted material standing" → `evidenced` origin with the USER's position carried in status.

## residual "why" — what no field description can carry

These are the categories the schema structurally cannot express, because they're policy _over time and across calls_, not semantics of one artifact:

- **Cadence** — when to commit: record-as-you-go, at most one follow-up on the same thread, correction/completed-thread/topic-change as checkpoints, a refused commit blocks the move. The schema permits an empty queue; it can't say when a non-empty one is due.
- **Selection** — what deserves a record at all: a clean check is not a record, a consequential deferred gap becomes an `open` claim, something merely named becomes a placeholder entity, precision only to what the purpose needs.
- **Steering** — what the ledger is _for_ between commits: choose the next question from the compiled map plus the purpose, not the newest gap; depth is purpose-relative. The schema has no concept of "next".
- **Diagnosis before encoding** — the schema says _how_ to supersede; only guidance can say _when_ a divergence is correction (supersede) vs conflict (`conflicted`, marking each) vs contextual coexistence (separate claims with selecting conditions). That's the eliciting skill's "put accounts side by side" move.
- **Temptation control** — don't harden hedges, don't average conflicts, assent to your wording isn't the USER's evidence, fluency/ledger-size isn't completion. These police the model's behavior, not the payload.
- **Cross-tool choreography** — commit before read-back, compile when IDs leave context, say "recorded" only after the tool confirms, reflections accompany accepted net changes in the same commit.

# rhizomatic actualization

This exchange lands squarely on the manual arm's design, so let me ground the consideration in what the guidance actually says before reacting.

Read , lines 1 to 130

Read

Read

Searched for files matching `**/apps/brunch-agent/src/agents/chat-agent/guidance/manual/**/checks.md`, 1 match

Read , lines 1 to 100

This exchange is unusually relevant to read against the manual arm, because the guidance already contains the sentence "Work in a rhizomatic fashion rather than an arborescent one" — and the rest of the corpus is, in effect, a test of the response's own warning that the word risks becoming "a decorative synonym for 'iterative'" unless operationalized. Having re-read `system.md`, eliciting/SKILL.md, constructing/SKILL.md, and `checks.md`, here is my read.

## Most of the response's operationalization already exists — as machinery, not prose

The exchange's four deliverables map almost one-to-one onto what the arm has built, and in each case the arm's version is stronger because it is _operational state_ rather than an end-of-task document:

| The response asks for                                                                       | The manual arm has                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Working relational map, separate from the formal net"                                      | The Ledger + `ledger_compile` map, explicitly distinct from the Petrinaut draft ("Hold the emerging model... in the Ledger and in the draft together")                    |
| "Distinguish documented facts, observations, inferences, assumptions, hypotheses"           | The `origin` field (`assumed`/`inferred`/`evidenced`/`stated`) plus basis-in-text discipline                                                                              |
| "Decision and revision record... consequential alternatives, challenges, changes"           | Append-only commits, claim supersession, reflections anchored to net elements with "what the choice affects and how it could be checked"                                  |
| "Analysis and limitations report; earlier results attached to the version and assumptions"  | The three evidence rungs ("a lower rung is never reported as a higher one") and behavioral evidence recording "the exact definition revision, scenario, initial state..." |
| "Counterexample is evidence about the model before the plant"                               | "A property of the draft is not operational fact"; "Use the account and inspected draft to question each other"                                                           |
| Next-activity rule: "which unresolved relationship could most materially change the answer" | eliciting: "Ask the question whose answer could most change what the model will answer... not the newest gap, the next entity kind in the map"                            |
| "Provisional scope freeze"                                                                  | `out-of-scope` status + delivery with gaps/assumptions/conflicts visible                                                                                                  |
| "Correction vs conflict vs contextual coexistence" (the response's "accounts side by side") | The three divergence encodings, verbatim                                                                                                                                  |

The key structural difference: the response imagines the map, rationale, and limitations as _deliverables produced alongside_ the net. The ledger makes them the _steering input_ — the compiled map chooses the next question. That's a tighter loop than the exchange asks for.

## The genuine deltas — where the exchange is ahead of the guidance

**1. The reframing diagnostic is the sharp one, and the arm doesn't clear it.** "Can the agent discover that its original account of the system was wrong — not just incomplete — and change that account?" The ledger supports every _local_ revision: supersede a claim, update an entity, mark conflict. But the guidance treats the PURPOSE as something you **pin** early and then serve. Nothing licenses or prompts the move where evidence shows the pinned question itself was mis-framed — the response's "the changed boundary might reveal that the original verification question was too narrow." Goals/constraints/levers are entities, so the mechanism exists (supersede the purpose-claims); what's missing is the authority and the trigger. Right now an agent that discovered the framing was wrong would have to improvise whether reframing is even its move to make versus a question to put to the USER. That's one sentence of guidance: a framing contradiction is a consequential divergence like any other — surface it, let the USER settle it, record the supersession.

**2. The CPS conflation family is absent from the checks.** The response's most concrete contribution is its reflective checklist: physical state vs latest available measurement; command issuance vs delivery vs acceptance vs physical effect; measurement freshness. `checks.md` covers consumed/reserved/read, resource release, waiting, continuous dynamics — but not the observation/actuation conflations, which are _the_ canonical CPS modelling failure (its water-tank example turns entirely on "level is low" ≡ "controller received a low-level report"). This would slot naturally as a Fragment-review bullet and/or a row in eliciting's "What process language usually hides" table: _they say "the system knows / the sensor shows" → suspect divergence between physical and informational state → ask about staleness, delivery, and what acts on which_.

**3. A managed tension worth knowing about: kinds as containers.** The response warns against categories becoming "the containers into which findings must be placed." The 19 entity kinds plus compiled-map gap steering could induce exactly that — and system.md's "an entity still missing what its kind needs... is usually a better next question" mildly pulls toward checklist traversal, while eliciting explicitly pulls back ("Questions following entity kinds or net structure: return to a case"; "Sweep properties, never headings"; depth is "PURPOSE-relative, not an obligation to fill every available category"). The antibody exists; whether it wins is an empirical question about model behavior, not a prose question.

**4. Small gap: revision doesn't explicitly invalidate stale behavioral results.** `checks.md` stamps behavioral evidence with the definition revision, but the Revision checks don't require "rerun the analysis or argue the result is preserved" after a consequential change. Cheap to add.

## One reflexive observation

The lone "rhizomatic/arborescent" sentence in `system.md` is now the _decorative_ token the response warns about — the operational content lives in the materiality-based question selection, the origin/status discipline, and the revisability machinery around it. By the same division-of-labor principle we applied to the schema overlap, that sentence either earns its place as a compact gloss or could be cut; the fog-of-war image beside it probably does more actual steering work.

## If you want to act on any of this

The highest-value items, in order: (a) the framing-revision license (one or two sentences in system.md/eliciting); (b) the CPS conflation checks (a table row + a fragment-review bullet); and — most interesting given what we just unblocked — (c) **the diagnostic as a persona case**: seed a scenario whose supplied decomposition is subtly wrong (e.g. the water tank, where the account conflates measurement with state) and run `yarn brunch:persona --case <case> --guidance manual` to see whether the arm revises its account or merely elaborates it. That would test rhizomatic behavior rather than rhizomatic vocabulary.
