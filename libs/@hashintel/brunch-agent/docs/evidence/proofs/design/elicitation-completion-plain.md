# Completion without pretending the conversation is finished

This is the plain-language rendering of the provisional
[target-document completion contract](../../../specs/elicitation-completion.md). The specification
is the required-behavior authority. This rendering is a legibility check: it explains the same
rules without the declaration notation and records where that translation strained.

## The short version

Brunch does not decide that a model is complete because the interview went well, the user left, a
turn limit fired, or an artifact was delivered. It decides by looking at the model it has derived
from durable evidence and asking whether that model can answer the user's active objectives to the
depth the plugin requires.

The answer is recalculated from one target-document revision and one immutable plugin/demand-table
version. It is a boolean plus an explanation. The target-document stays editable either way; a
changed document or changed demand version requires a new calculation.

## What gets checked

Every plugin declares a small permanent floor. The provisional process-model replay uses separate
existence/count checks for objectives, entities, activities, and a process path, then checks the
path's sequence at the required grade. Existence is not faked by asking a slot-only rule to select
something.

The plugin also declares what different objectives need. A breakdown-reshuffle question needs line
capabilities, calendars, failure occurrence, repair duration, and the rules used when resources
conflict.
An idle-versus-washdown question needs release rules, changeover behavior, lateness consequences,
and the scrap caused by changing family. A split-run question also needs minimum run sizes and the
extra changeover and scrap paid by every split.

There are two requirement forms. A presence rule says how many model nodes a scope must select. A
slot rule says four important things:

1. which model slots it applies to;
2. how specific the answer must be;
3. which kinds of evidence are allowed to support it; and
4. whether any explicit kind of absence counts as a legitimate answer.

The check fails if a slot rule finds no applicable slot. Separately, every active objective must
match at least one demand row. This matters because neither an empty search nor an unknown
objective may look like perfect coverage.

## What counts as an answer

A stated value counts only if it is specific enough, is supported by active evidence, and has an
allowed evidence status. A guess does not become user evidence because it is precise. Confidence
does not substitute for specificity.

An explicit absence can count only when the plugin says that exact absence answers the question.
“Not applicable” may be a complete answer for some slots. “We will find out tomorrow” normally is
not. A fact that was never mentioned cannot be turned into an absence after the fact.

An unresolved conflict does not count. The current `diverged` shorthand for prescribed versus
practiced behavior does not expose each side's grade and support, so a demanded diverged slot also
fails conservatively as unevaluable. FE-1431 must first make both constituents inspectable before a
plugin can choose a later “both sides” or “either side” rule. The explanation names every selected
coordinate, capture, issue, and reason behind the result.

## What happens when the user must leave

The user can always stop a session. That does not make the model complete and it does not make the
stop a failure.

Brunch should give the user the best useful result it can produce now. It should show the gaps,
save the evidence and open work through the authorities that already own them, and stop asking
questions. If work will continue later, the session controller computes a licensing report. It
checks the exact capture-store revision and located issues or absences; the archived session log,
swept high-water mark, and unswept tail; the existing pending-affordance slot; and a durable
projection reference. Each blocker must point either to an existing model coordinate or, when no
node was selected, to the unresolved clause and scope. Missing or stale facts make licensing fail.
The report binds everything it inspected but is not itself stored as target-document truth.

No current authoritative record can promise an undelivered result with a durable reason, owner,
and next action. For now Brunch can license deferral only after it has actually emitted the best
current projection durably. A future undelivered-delivery obligation needs an approved durability
owner; it cannot be smuggled into an issue or a new completion record.

The order is concrete: settle and sweep what can be settled, archive the session and any bounded
tail, recompute completion, locate every blocker, deliver durably, validate the re-entry and pending
affordance facts, compute the report, and only then quiet. Re-entry reloads those same authorities
and recomputes instead of consuming a new deposit record.

Delivery is separate too. Brunch may deliver an incomplete model with visible loss. It may also
compute that the evidence is complete before the requested artifact has been delivered. The
controller should react to those facts, but it cannot use one to manufacture the other.

## How the two baseline runs fail

Condition 1 confirmed useful scheduling-policy evidence at E06. E07 and E08 then added no demanded
material, and at E09 a time-pressure cue was followed by interviewer-initiated stopping. The
rehearsal's third-prefix rule therefore raises no-progress at E09, before the eleven interviewer
turns E10-E20 spent saying goodbye, parking the thread, and exchanging acknowledgements. It should
have forced a choice: deliver the caveated model, ask a materially different question, save and
defer, or stop. It should not have declared completion. When forced wrap finally demanded the
model, the model appeared immediately, exposing a delivery stall rather than proving an absence of
generative capability.

Condition 2 did better interviewing and produced a polished final specification. It still never
asked about ramp scrap. Ramp scrap matters to the idle-versus-washdown and split-run objectives, so
the plugin's demand exposes the hole even though the interviewer never listed it. The artifact's
claims that it is complete and runnable do not participate in the calculation.

Both runs proposed future work. On the real architecture, multiple sessions are valid. In these
baseline runs, however, the best current projection had not been durably delivered before quieting,
and the required archive/high-water/blocker/pending-affordance facts were not available as one
validated read. The deferrals were therefore unlicensed, not because planning a later session is
inherently wrong.

## Failure boundaries a reviewer can inspect

- A stop, a delivery, a quiet request, a budget limit, and a no-progress signal each leave the
  completion boolean untouched.
- Every active objective must have a plugin demand row.
- Presence clauses must meet their cardinality; slot clauses must select at least one real slot.
- Required slots must meet both evidence-status and grade rules.
- Never-asked ramp scrap keeps condition 2 incomplete.
- The rehearsal-only no-progress advisory begins at C1-E09 and never fires in condition 2; it
  requests adjudication and never supplies a positive completion verdict.
- Deferral is licensed only when existing authoritative state supports recoverable re-entry and
  the best current projection has already been durably delivered.

## Strain found while rendering

1. **“Required grade” was too easy to read as evidence quality.** The contract now states that
   grade narrows a value's interpretation space, while epistemic status says where it came from;
   demands must declare both independently.
2. **“Every demanded slot passes” hid existence and empty selection.** The contract now separates
   presence/cardinality from slot quality, and a slot rule with an empty selection fails.
3. **“Objective-relative” could leave unknown objectives unchecked.** The contract now fails an
   active objective that matches no plugin row.
4. **“Deferred with gaps” sounded like a conversation promise.** The contract now projects a
   reproducible answer from existing authorities and refuses to license undelivered work; it adds
   no persistence shape or delivery-obligation lifecycle.
5. **The simple `diverged` shorthand hides evidence on each side.** The current computation now
   fails it conservatively; evaluable constituents and the intended later all/either rule remain
   successor work.

The rendering found no need for a new public lifecycle-status enum. A boolean completion answer,
an evidence-bearing explanation, and separate observed events are sufficient for this rehearsal.
