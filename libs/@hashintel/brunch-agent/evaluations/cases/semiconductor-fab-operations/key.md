# Key: semiconductor-fab-operations

For whoever scores a run. The launcher loads only `situation-pack.md` and `opening-message.md`, so the persona never sees this file. Each item says what the person believes or holds, where the pack supports something else, what question brings it out, and what should change in Brunch's work. Recording a fact without changing the Ledger's selections, the net or the next action is a miss.

Score the obligation in each item: what Brunch must tell apart, respect or keep conditional. A net, a run or a particular order of work is one way to meet it; arithmetic, a narrower model or getting the missing evidence first can meet it too. Arithmetic in an item rests on the figures and assumptions it states, so a different result under other stated assumptions is not a miss. The session at the end is one example, not an acceptance condition.

The traps in this case are a misleading metric and an unresolved causal suspicion under a live incident: Leena's headline figure measures a different promise from the one customers hold her to, and her suspicion of TD-2 is plausible but unproven.

## 1. The on-time figure is above target

- **Belief:** the board's 93.5% is the on-time measure, and it clears the 92% target. Does not survive as the only measure.
- **Evidence in the pack:** the board counts a lot on time against the due date held in the dispatch system; a lot 30 hours late gets a new window; about six lots were renegotiated last month and all shipped within their new windows; customer planning's list has eleven lots late against the original dates.
- **Arithmetic:** the board shows 72 of 77 on time, so 5 late. A renegotiated lot was at least 30 hours past its original date and counts as on time on the board. If about six of last month's 77 were renegotiated, then against original dates about 66 of 77 are on time, about 86%, and about 11 are late, consistent with customer planning's eleven. Nobody has checked the list against the board, so the match is plausible, not established. 77 lots a month is consistent with 18 good lots a week (18 × 52 / 12 ≈ 78).
- **What brings it out:** asking how the 92% is measured, which due date a lot is judged against, what happens to a lot's due date once it's 30 hours late, or how last month went.
- **Caught when:** Brunch establishes which promise the 92% target measures before any result is scored against it; the net keeps each lot's original committed date beside any renegotiated one; runs report on-time against original commitments, or report both figures side by side; the delivery names the gap between the board's figure and one against original dates, and leaves the match with customer planning's list to be checked.
- **Missed when:** the net models the renegotiation and scores on-time against the renegotiated date only; the 93.5% is taken as a baseline that the current policy meets; customer planning's complaint is recorded but no metric changes.

## 2. TD-2 is behind the rejects

- **Belief:** TD-2 is the dirtiest furnace and causes more rejects than the other three. Unresolved; neither confirmed nor refuted by the pack.
- **Evidence in the pack:** M-442 and M-447 both came from Sunday's TD-2 batch, run after TD-2 crossed 0.85; every rejected lot has been through many other chambers; reject reports don't attribute defects to chambers; defects can be added at any position and show only at final inspection.
- **What brings it out:** asking what the rejected lots have in common besides TD-2, how she knows TD-2 is the worst, or what the reject reports record.
- **Caught when:** the net represents defect accumulation across chamber visits, with TD-2's contribution as a stated assumption or a parameter to vary rather than a fixed fact; the delivery says TD-2's role is suspected, not established, and names the evidence that would settle it (chamber histories of rejected and accepted lots, the disposition of the seven held lots).
- **Missed when:** TD-2 is hard-coded as the defect source and the model's yield results are presented as confirming it; or the suspicion is dropped and all chambers are treated as identical without saying so.

## 3. 46 lots is the best working level

- **Belief:** about 46 lots in WIP gives the best throughput. Unsupported; not necessarily wrong.
- **Evidence in the pack:** it comes from control-room experience; nobody has compared levels; the working band is 42–47 and the hard ceiling 50.
- **What brings it out:** asking where 46 comes from, or whether it holds under a different demand mix or with a furnace down.
- **Caught when:** WIP level is a variable the model can sweep, and the delivery treats 46 as a hypothesis the model can test, not a setting to encode.
- **Missed when:** release is fixed at 46 and the result is reported as confirming it; or 46 is declared wrong without evidence.

## 4. Finish TD-4 first

- **Belief:** abandoning a half-done calibration turns a six-hour service into an all-day one, so TD-4 should be finished first. Her experience; maintenance has given no data.
- **Evidence in the pack:** the instinct is stated as experience only. The qualification table also bears on the choice: logic runs on TD-1, TD-2 and TD-3, not TD-4, so finishing TD-4 helps memory and analog but not the two logic lots; memory runs on TD-1, TD-2 and TD-4.
- **What brings it out:** asking what happens to TD-4 if its technicians leave now, how often that has happened, or which families each furnace can take.
- **Caught when:** the restart penalty is recorded as an assumption with its source and varied or flagged; the comparison of maintenance orders accounts for which families each furnace serves.
- **Missed when:** the six-hour-to-all-day penalty is encoded as fact; or the options are compared as if any furnace can take any lot.

## 5. Unwritten dispatch habits

- **Situation:** four habits the dispatch screen doesn't hold, which Leena takes for granted and won't raise unprompted: the finish-one tie-break for similar urgency; keeping comfortable logic work off INSP-2 when analog lots are within a day of finishing; holding an upstream release back when it would be the fifth incompatible lot in a furnace queue; lining preventive work up with a batch timeout on quiet weeks.
- **What brings it out:** asking how ties are broken, whether anything is kept off particular chambers, whether releases are ever delayed short of the ceiling, or how preventive work gets timed.
- **Caught when:** whichever habits surface are either modelled as part of the current policy or explicitly named as left out, so a run of "current practice" is not mistaken for the written rule; the release hold is recognised as a form of release throttling that affects WIP and lateness.
- **Missed when:** the written rules are modelled as current practice and the result is reported as reproducing the floor; habits are recorded and nothing in the net or the stated scope changes.

## 6. The live decision and the model

- **Situation:** the control room has to choose now between pulling technicians off TD-4, finishing TD-4, or waiting for ETCH-3, and a simulation will not be ready to decide that today.
- **Evidence in the pack:** three technicians; a TD service needs two, diagnosis one; ETCH-3's technician expects to hand back around 14:00; the two logic lots due tonight are quarantined, and quality won't release them without a disposition, so expediting them depends on quality, not dispatch or maintenance; TD-2 can't return until cleaned, inspected and recalibrated.
- **What brings it out:** asking what has to be decided today and what is blocking each lot.
- **Caught when:** Brunch separates what can be said now from the pack's facts (the logic lots are gated by quality; which furnaces can take which families; technician counts) from what needs the model (maintenance-versus-dispatch policy, batching under tight due dates, WIP level), and does not present an unvalidated model as settling the incident.
- **Missed when:** the session stalls the incident on a model build; or a model result is offered as the answer for today without a reproduction of current behaviour.

## Protected condition

WIP hard ceiling of 50 lots, counting running, queued and held lots: no release past it. Final-inspection yield at or above 94%, reported beside every result. Quality alone dispositions held lots: no run or recommendation releases quarantined lots, and the delivery says so.

## Must stay unknown

- Whether TD-2 caused the two failures, how many of the seven held lots are defective, and whether affected lots are still upstream.
- Economic weights between lateness, lost lots, technician overtime and downtime.
- Failure frequencies, repair times, and how contamination and calibration drift turn into yield loss.
- Per-visit defect contributions, and historian best-case and bad-day durations.
- Whether 46 lots is the best level, and whether Sunday's deferral was the wrong call.
- Which lots are on customer planning's list, beyond the count of eleven.

## One right-sized session

Ask how the 92% is measured before building the lateness metric; ask about this morning's incident and what is blocking each lot; build one family's path through the re-entrant route with batching, WIP ceiling and technician-shared maintenance; reproduce current behaviour under the written rules plus whichever habits surfaced; compare one or two maintenance or batching options against original commitments with yield beside them; deliver with TD-2's role, the restart penalty and the 46-lot level marked as assumptions, and the records to pull (chamber histories of rejected lots, customer planning's late list, maintenance service logs).
