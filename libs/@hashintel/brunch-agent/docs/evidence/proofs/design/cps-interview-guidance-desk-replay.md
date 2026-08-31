# FE-1403 CPS interview-guidance desk replay

Status: **fixed manual desk evidence** over the two FE-1361 baseline transcripts. No pack, plugin,
model, detector, or runtime was executed. Prefixes use FE-1402's rule: `C2-E11` includes every user
utterance available before condition 2's eleventh interviewer response.

## Fixed inputs and method

- guidance under test: [`cps-interview-guidance.md`](../../../archive/specs/cps-interview-guidance-2026-08-25.md) (archived 2026-08-25; its cards are now patterns in [`plugin-sdcpn/plugin.yaml`](../../../../packages/plugin-sdcpn/plugin.yaml))
- completion oracle: `cps-baseline-replay/2026-08-24.3` from the FE-1402 rehearsal
- failure signatures: the reviewed FE-1407 catalogue
- transcripts: FE-1361 condition 1 and condition 2, one run each

For each card and condition, this replay records the first useful firing point, the clause or slot,
the evidence available at that prefix, and the expected delta if the card were applied. "Expected"
is a testable design prediction, not an observed counterfactual result. A no-fire verdict is valid
when no matching objective or diagnostic exists.

The replay does not use the hidden situation pack to supply an answer. The FE-1402 DemandTable may
identify a missing coordinate; only transcript evidence may populate it.

## Per-card replay

### CPS-Q01 — Separate failure occurrence from repair

| Condition | Prefix and firing | Target | Expected evidence delta | Verdict |
| --- | --- | --- | --- | --- |
| C1 | `C1-E02`: the breakdown objective exists but no line-failure slot is selected, so none of the card's declared slot-state predicates can fire. At `C1-E03`, selected filler and motor coordinates exist: "every week or two" and "half an hour to half a shift" are explicit ranges for the filler, while "rare" is explicit verbal motor-occurrence evidence and one four-day motor incident is explicit point-grade repair evidence. | `BR-OCC`, `BR-REPAIR` | **No fire at E02; first mechanical fire at E03.** Ask occurrence and repair separately for each failure mode. Preserve filler occurrence/repair as explicit ranges, motor occurrence as explicit verbal evidence, and motor repair as explicit point evidence; seek the missing demanded ranges/quantiles without dropping weaker support. | **fires-where-instinct-fails at E03**; the baseline asked both in one broad item and later hardened them. The card is expected to address FM-06/FM-07/FM-14; no prevention effect was run. |
| C2 | `C2-E02`: the four-day motor incident activates the breakdown row without occurrence evidence. At `C2-E08`, filler occurrence and repair improve, but motor occurrence stays unaddressed and motor repair stays point-grade. | `BR-OCC`, `BR-REPAIR` | The card would keep the filler and motor coordinates separate and request calibrated repair distributions. Status stays explicit where Marta answered; grade changes only when the answer narrows the quantity. | **fires-where-instinct-fails**; carried failures remain after the baseline's quantitative probe. The FM-06/FM-14 mapping is predictive. |

### CPS-Q02 — Elicit changeover loss, including ramp scrap

| Condition | Prefix and firing | Target | Expected evidence delta | Verdict |
| --- | --- | --- | --- | --- |
| C1 | `C1-E02`: Marta explicitly says ramp scrap exists and is worse after big washdowns, but cannot give quantities by type. At `C1-E03` she accepts an interviewer-created threshold; at `C1-E04` she offers a future floor observation. | `IW-SCRAP`, `CH-SCRAP` | Ask by from/to family for an ordinary range or route to the named observation while the clause stays failing. Do not capture the interviewer's "40 units" as user evidence. Expected immediate delta may be only a better evidence request; the unavailable absence locator supplies no slot delta. | **fires-where-instinct-fails**; the baseline noticed the topic but supplied its own threshold. FM-06/FM-07 are predictive mappings. |
| C2 | `C2-E02`: idle/washdown, changeover-accounting, and split-run objectives are active. Ramp scrap is never asked or named through `C2-E23`, while the interviewer's own gap list omits it. | `IW-SCRAP`, `CH-SCRAP`, `SP-SCRAP` | Clause diagnostics would cue the question despite the interviewer's self-inventory. Expected delta is a direction-scoped range; if the expert cannot answer, the clauses stay failing while the question routes to an identified source. | **fires-where-instinct-fails**; canonical FM-08 instance, with FM-09/FM-13 as predictive mappings. |

### CPS-Q03 — Bound the split-run policy

| Condition | Prefix and firing | Target | Expected evidence delta | Verdict |
| --- | --- | --- | --- | --- |
| C1 | `C1-E02` has no split-run objective. `C1-E03` mentions a minority pack-size split, but the active objective rows do not demand a split policy. | `SP-*` | None. Do not activate a full split interrogation merely because "split" appears in incidental evidence. | **no fire**; objective-relative scoping predicts that the card stays out of this path. |
| C2 | `C2-E02` explicitly activates the run-size/split objective. `C2-E06` supplies batch structure and line eligibility, but `SP-MIN` and `SP-POL` remain unaddressed; `C2-E20` names splitting as future work without evidence. | `SP-BATCH`, `SP-MIN`, `SP-POL`, `SP-CO`, `SP-SCRAP` | Ask the minimum accepted run, contiguity/interleaving rule, and one real split comparison; then explicitly elicit ordinary low-to-high counts for extra changeovers/cleans and ordinary low-to-high repeated ramp-scrap quantities. Expected deltas are structured batch/policy values and ranged thresholds/costs, each scoped to product and line; promises do not change evidence. | **fires-where-instinct-fails**; the baseline knows the gap yet defers it. FM-08/FM-13/FM-06 are predictive mappings. |

### CPS-Q04 — State the order-release gate

| Condition | Prefix and firing | Target | Expected evidence delta | Verdict |
| --- | --- | --- | --- | --- |
| C1 | `C1-E02`: the idle/washdown objective selects `IW-REL`, but the release condition is unaddressed and is never asked in the run. | `IW-REL` | Ask which observable state makes an order runnable. Expected delta is a structured practiced release condition or an honest unresolved coordinate. | **fires-where-instinct-fails**; a never-asked objective dependency. Addresses FM-08/FM-13. |
| C2 | `C2-E02`: "not ready to release till the next morning" is verbal and below grade. `C2-E11` identifies ERP status plus credit/allocation hold, truck confirmation, and clean paperwork. | `IW-REL` | The card would ask for the structured conjunction and observable status. The native interview already supplies that evidence; the FE-1402 replay records the clause passing at `C2-E11`, so no further firing is justified. | **fires then retires**; this is a positive native-success boundary and a replay oracle for card deactivation. The FM-06/FM-14 mapping is predictive. |

### CPS-Q05 — Elicit the resource-conflict rule

| Condition | Prefix and firing | Target | Expected evidence delta | Verdict |
| --- | --- | --- | --- | --- |
| C1 | `C1-E02`: the breakdown objective activates `BR-POL`, but the shared-resource conflict rule is unaddressed and remains so through the transcript. | `BR-POL` | Ask who or what wins when simultaneous demands compete for the shared changeover crew, then elicit overrides, tie-breaks, and one practiced borderline case. Expected delta is a structured, scoped priority rule rather than schedule-shaped inference. | **fires-where-instinct-fails**; C1 never asks for the who-wins rule. FM-08/FM-13/FM-06/FM-14 are predictive mappings. |
| C2 | `C2-E02`: `BR-POL` is unaddressed. The v0 prompt explicitly directs conflict-point probing; native evidence supplies the structured crew-priority rule at `C2-E14`. | `BR-POL` | Fire while the rule is unaddressed, preserve the practiced rule and exceptions at their actual status/grade, and retire when the clause passes at E14. | **fires then retires**; C2 is prompted success, not evidence that conflict-point probing is redundant with native instinct. |

### GEN-Q02 — Bound a conversational question batch

| Condition | Prefix and firing | Target | Expected evidence delta | Verdict |
| --- | --- | --- | --- | --- |
| C1 | Before `C1-E02`, the opening contains 29 independent questions. | `SF-OBJ` and objective proposal slots first | Ask two to four objective questions, then choose later batches from diagnostics. Expected delta is answerability and lower burden; no semantic-coverage improvement is assumed. | **fires-where-instinct-fails**; observed FM-12. |
| C2 | Before `C2-E02`, the opening contains four related objective/scope questions; later groups are generally three to five. | `SF-OBJ`, then active rows | No opening fire. A five-question batch is a soft strain, but one run does not justify rejecting the baseline's shape. | **no fire at opening**; condition 2 is the positive boundary. |

## Respectful-close replay

`C1-E09` is the first explicit burden cue. The expected action is to stop opening topics, state the
best useful result and the failing clauses, and durably deliver that result. Instead the transcript
enters acknowledgements through `C1-E20`; FE-1402 raises its rehearsal-only no-progress advisory at
`C1-E09`. At `C1-E21`, forced wrap produces the artifact. The close fragment would not declare
completion and could not license deferral because no durable current projection or re-entry facts
exist.

`C2-E09` contains the same time cue, after which the user explicitly agrees to a bounded later
continuation. Later prefixes add demanded evidence at `C2-E11`,
`C2-E14`, `C2-E15`, and `C2-E18`. The fragment permits the user to stop without equating the stop
with completion. At `C2-E21`–`E23`, it would require best-current delivery with named gaps;
deferral still cannot be licensed from the baseline's absent durability facts. This distinction
targets FM-01 through FM-05 without claiming that guidance owns their prevention.

## Candidate disposition record

| Candidate | Tag / mechanism | Disposition | Evidence |
| --- | --- | --- | --- |
| Objectives-first | envelope-generic / attention | **redundant-with-instinct; omit** | Both conditions open on objectives; the research-patterns audit explicitly records this migration into model disposition. |
| Penalty-weight probing | domain / attention | **redundant-with-instinct; omit** | Both conditions co-construct decision stakes and trade-offs without a dedicated card. This does not establish native conflict-rule elicitation. |
| Conflict-point probing | domain / attention | **retain as `CPS-Q05`** | C1 leaves `BR-POL` unaddressed; C2 passes only after the v0 prompt explicitly directs conflict-point probing. The comparison supports a C1 miss and prompted C2 success. |
| Clearinghouse self-inventory | envelope-generic / technique | **rejected for coverage detection** | Condition 2's gap inventory misses ramp scrap; FM-08 establishes that untouched categories leave no residue. It may remain a courtesy question, never an omission detector or completion input. |
| CDM incident timeline | envelope-generic / technique | **untestable-at-desk; omit from surviving set** | Imported primary-source procedure, but neither baseline runs the timeline/deepening sequence. Runtime or a new controlled replay is needed. |
| ACTA knowledge audit | envelope-generic / technique | **untestable-at-desk; omit from surviving set** | Imported probe catalogue; no matching baseline application or counterfactual oracle. |
| Premortem | envelope-generic / technique | **untestable-at-desk; omit from surviving set** | Primary literature supports prospective hindsight, but the baselines do not test a premortem against a relevant miss. |
| Taxonomy/laddering/triadic probes | envelope-generic / technique | **untestable-at-desk; omit from surviving set** | The case contains family vocabulary but no deliberate taxonomy procedure to compare. |
| Branch-local clarification / compatible-evidence preservation | envelope-generic / technique | **redundant-with-instinct or machinery; omit** | Both runs natively move `CH-CREW` from verbal to structured evidence. C2's E19 provenance problem has no legal clause diagnostic after E09, and capture/fold machinery already owns preservation. Carry E19 only as an FE-1404 residual until a real diagnostic exists. |
| Teachback and generic consistency probe | envelope-generic / technique | **redundant-with-instinct; omit** | Both runs restate, challenge, and reconcile user statements without a dedicated card. |
| Definition-of-done / reflective completeness card | envelope-generic / attention | **superseded by machinery; omit** | FE-1402 completion evaluates the versioned model and demands. A guidance card must not re-adjudicate it. |
| Source router | envelope-generic / attention | **fragment only** | Useful inside CPS-Q02 when the expert lacks ramp-scrap data, but too broad to retain as a separately desk-tested card. |

## Research and source ledger

| Source searched | Claim used here | Limit retained |
| --- | --- | --- |
| FE-1407 failure catalogue | Failure signatures, layer ownership, and especially the ramp-scrap self-inventory failure | Catalogue mechanisms and prevention grades remain design claims; n=1 per condition. |
| FE-1402 completion spec, rehearsal, and plain rendering | Clause IDs, status/grade separation, prefix evidence, close/deferral boundary, compatible `CH-CREW` support | Replay DemandTable is provisional; no runtime detector or store ran. |
| FE-1405 plugin contract and CPS IR | Typed proposal/slot vocabulary, seven `firesWhen` predicates, card hook, grade ladders, absence-locator seam | Final CPS contract and `where(...)` scopes are not implemented; absence location is unresolved. |
| FE-1360 elicitation strategy literature | IDEA interval-first script, SHELF bisection, ACTA 3–6-step opener, technique-mixing and no-bare-why cautions | Imported populations/settings differ; broad techniques without baseline tests are disposed as untestable. |
| FE-1360 interviewing source catalogue | Ambiguity/clarification, overload, premature close, novice-human instrument limits | Novice-human findings are floor checks, not frontier-model completion evidence. |
| Research-patterns audit | Instinct/redundancy verdicts and the v0-versus-IDEA strain | It is a legibility rendering; underlying research deposits remain authoritative. |
| FE-1361 transcripts, raw logs, models, and readout | Exact prefix observations, baseline successes/failures, and one-run interaction comparison | Counterfactual evidence deltas are predictions; no rates or activation reliability follow. |

No web search was required. The indexed repository corpus contained the imported primary-source
findings and the fixed baseline evidence needed for every retained or rejected candidate.

## Result and limitations

Six cards survive: five domain cards and one envelope-generic card. Two clarification/close
fragments travel with them. The generic card is a candidate for FE-1406, not already-graduated
harness strategy.

The cards' evidence-backed diagnostic disjunctions do not compile losslessly through FE-1405's
singular `ProposalType.affordance.firesWhen` field. FE-1431 owns the binding-multiplicity versus
card/proposal-splitting decision. This replay therefore hands off tested content plus a concrete
authoring seam; it does not claim a compilable manifest.

The claim is narrowed to **desk discrimination**: the set points at observed clause-level misses,
deactivates on positive boundaries, and makes unsupported candidates visible. FE-1404 must test
whether the cards actually activate and improve condition 3 without regressions. No categorical
claim here is mature enough to promote to an executable oracle beyond reusing the fixed prefix and
clause expectations in that evaluation.
