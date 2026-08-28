# Elicitation strategy: what the literature already knows

Resolves the research half of FE-1360. Companion to
[open-questions-elicitation-design-2026-08-11](../../archive/design/open-questions-elicitation-design-2026-08-11.md)
(the question inventory) and
[expert-meeting-findings-2026-08-11](../../evidence/proofs/research/expert-meeting-findings-2026-08-11.md)
(which established that there is no in-house interviewing practice to elicit from, activating
the literature fallback).

---

## Executive summary (10 lines)

1. The literature's answer to "what are the first questions" is emphatic and contradicts the instinct to open with structure: **objectives first, model content last**, because content is _derived_ from what the model must answer (Robinson; Sargent).
2. Completeness is **question-relative** and stated normatively — Sargent: if a model answers several questions, "the validity of the model needs to be determined with respect to each question." Elicit the questions first; they are the completion criterion.
3. **Four probe catalogues are now in hand verbatim** — the CDM deepening and what-if sweeps, the ACTA knowledge audit, and a 35-type interview-question typology — which together are the single largest importable body of pack content available.
4. The team's "bad day" question is a rediscovery of **prospective hindsight** (imagining the failure has already happened raises correctly-identified causes ~30%) and of incident-based CDM probing.
5. **Structured beats unstructured elicitation by roughly an order of magnitude** in propositions per minute (Hoffman), and contrived tasks need a prior overview interview — which prescribes a concrete two-phase interview architecture.
6. Quantities must be elicited as **quantiles, never as min/mode/max**: the three-point-triangular habit overstated a real measured quantity by ~69% in a published comparison, where a distribution fitted to the same elicited middle value landed within 1%.
7. A motif catalogue is well supported as an **interview scaffold** and poorly supported as a model generator — and Börger's reduction argument (126 catalogued patterns collapse to 8 parameterised schemes) says to build a **small quiver with variant selectors, not a long menu**.
8. The formalism ladder needs correcting: **colour is a folding, not a capability**, whereas **stochasticity has a genuine quantitative earning test** via the VUT/Kingman relation.
9. **Logs settle fitness but cannot settle precision-versus-generalisation**, and four things are structurally absent from any log — off-system behaviour, rationale, resource reality, and the case notion — which is exactly the territory the interview must own.
10. On AI-conducted interviews the load-bearing finding is that **mental models surface late, not first** — depth of probing is the differentiator, which argues against question batching and supplies a measurable evaluation proxy.

---

## How to read the source labels

| Label   | Meaning                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **[V]** | Verified — citation _and_ substantive content checked against a retrieved primary or authoritative source, in most cases full text read. |
| **[C]** | Citation verified (authors/year/venue/title confirmed); content from background knowledge, source not read.                              |
| **[R]** | Recalled — citation from background knowledge, not verified. Check before shipping as pack content.                                      |

Verification improved substantially late in the work: several parallel literature threads recovered
after failures and delivered primary sources, so most of what was previously recalled is now
verified. The residual **[R]** items are flagged in "Where the literature is thin" at the end.

---

## Section 1 — How does model-building actually start?

### 1.1 What are the actual inputs, in what proportion?

**Grounded answer.** The only direct empirical evidence found is a survey of 102 practising
simulation modellers **[V]**: model coding took roughly **twice** the time of any other
activity; activities occurred in recognisable blocks but overlapped heavily rather than running
in sequence; and in most projects the conceptual model was **changed during later tasks, usually
by adding complexity**. That last finding matters more than the proportions: it says elicitation
does not terminate before building starts, and that the drift is one-directional. An elicitor
designed around a clean "elicit-then-build" handoff is designed around something practitioners
do not do.

The literature does **not** give a breakdown of documents vs. data extracts vs. conversations
vs. site visits. That proportion appears undocumented, and the honest answer to Yannis is that
his guess is as good as any published one.

What the literature _is_ prescriptive about is that the first activity is not content-gathering:
Robinson's first framework activity is "understand the problem situation" **[V]**, and Law's
process begins with problem formulation plus an information-collection phase whose output is an
**assumptions document**, not a model **[V]**.

The team's "prime from documents before questioning" idea aligns with contextual inquiry's
insistence that understanding comes from the work setting **[R]** — though note the actual claim
is stronger and less convenient: observation is held to be irreplaceable, not substitutable by
documents. See also §9: a large fraction of what documents and logs _can_ answer is now
mechanically extractable, which changes what the interview should spend its time on.

**Key sources.**

- Brooks, R. & Wang, W. (2015) "Conceptual modelling and the project process in real simulation projects: a survey of simulation modellers", _Journal of the Operational Research Society_ 66(10):1669–1685, doi:10.1057/jors.2014.128 **[V]**.
- Robinson, S. (2008) "Conceptual modelling for simulation Part I: definition and requirements", _JORS_ 59(3):278–290 **[V]** (full text obtained via Loughborough figshare). Part II, "a framework for conceptual modelling", _JORS_ 59(3):291–304, doi:10.1057/palgrave.jors.2602369 **[C]** — genuinely closed access, no OA copy exists; its framework specifics below come from Robinson's own WSC tutorials, which reproduce it.
- Law, A.M., "How to build valid and credible simulation models", WSC tutorial — 2022 version read in full **[V]**.
- Beyer, H. & Holtzblatt, K. (1998) _Contextual Design: Defining Customer-Centered Systems_, Morgan Kaufmann **[R]**.

**Pack-content candidates.**

- **"Expect the model to grow" policy card**: the elicited description is a living artifact; support post-build additions rather than treating handoff as closure.
- **Document-priming card**: ingest documents to _generate propositions to confirm_, not to skip questions. Document-derived facts enter at lower confidence than spoken confirmations.

### 1.2 The first five questions, and what each feeds

**Grounded answer.** Clear and defensible, and it is not "ask about structure". Robinson's
framework orders the work as **[V]**:

1. understand the problem situation;
2. determine the **modelling objectives** (and general project objectives);
3. identify the **model outputs / responses** — what the model must report;
4. identify the **model inputs / experimental factors** — what the user will vary;
5. determine the **model content**: scope and level of detail, recording **assumptions** and **simplifications**.

A defensible first five, with the model element each feeds:

| #   | Question                                                                                  | Feeds                                                                |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | "What decision is waiting on this? What will you do differently depending on the answer?" | Objectives; and whether a model is warranted at all                  |
| 2   | "What would you have to see reported to believe it?"                                      | Responses/outputs — and hence which quantities must be **emergent**  |
| 3   | "What are you allowed to change in the real system?"                                      | Experimental factors — hence what must be explicit and parameterised |
| 4   | "How close is close enough, and against what would you check it?"                         | Accuracy bar and validation data                                     |
| 5   | "What's deliberately out of scope — what would you refuse to be held responsible for?"    | Scope boundary; assumptions and simplifications register             |

Only then does structure become answerable, because scope and level of detail are _consequences_
of 1–4. Sargent states the accuracy point verbatim **[V]**: "The amount of accuracy required
should be specified prior to starting the development of the model or very early in the model
development process."

Two independent supports for broad-to-narrow ordering: the **funnel sequence** from interviewing
methodology **[R]**, and ACTA's bounded opener, which is worth stealing outright **[V]**: _"At
the most basic and simple level, can you break down your process into between three and six
steps?"_ The bounded count does real work — it fixes an initial level of abstraction instead of
inviting whatever detail comes to mind.

A caution from the mistake literature (§5.1): **"incorrect opening of interview" was observed in
15 of 28 interviews** and "incorrect ending" in 19 **[V]**. Openings and closings are the two
most error-prone moments, not the middle.

**Pack-content candidates.**

- **Opening-five card** (the table above), with the explicit rule: _do not ask about structure in the first exchange_.
- **Bounded task-diagram opener**: three-to-six steps, before any detail.
- **Responses-before-structure guard**: refuse a structural claim until at least one response variable is on record.

### 1.3 Dependency order of questions

**Grounded answer.** Robinson's ordering _is_ the dependency order, and the dependencies are
real: objectives determine responses; responses determine which quantities must be endogenous
(and therefore cannot be supplied as inputs); those two together determine scope and level of
detail **[V]**.

Three concrete switch points where an early answer changes what to ask next:

- **Is the quantity of interest a mean, or a tail/percentile/service level?** A tail answer forces distributional elicitation and a stochastic model; a mean answer may not. Highest-value branch, and grounded quantitatively (§6).
- **Is a named quantity a response or an experimental factor?** Throughput offered as an input is a mis-scoping; throughput is a response. Robinson's factor/response distinction detects this mechanically **[V]**.
- **Does the decision involve changing a resource count, or a policy?** If yes, resources and the contention rule must be explicit; if no, they can often be folded into a service-time distribution.

**Pack-content candidates.**

- **Mean-or-tail router card**: one early cheap question that switches the whole downstream quantitative strategy.
- **Factor/response classifier**: every elicited quantity is tagged input-or-output; an output offered as an input raises an issue.

### 1.4 Numbers vs. distributions vs. stories

**Grounded answer.** The literature partitions these by what kind of thing is being asked for.

- **Numbers** for quantities checkable in principle — capacities, counts, shift calendars, batch sizes. The discipline is Howard's **clairvoyant test** **[V]**: a quantity is well enough defined only if a clairvoyant — someone with perfect knowledge of all events and measurable quantities past, present and future, _but exercising no judgment_ — could answer it. That "no judgment" clause is the load-bearing part, because it is what separates definitional disagreement from factual disagreement (§5.3).
- **Distributions** for durations, inter-arrival times, failure and repair behaviour. Elicit by **quantiles**. See below — this is where the strongest single quantitative finding in the review sits.
- **Stories** for anything rare, and for anything whose absence from the event log is the point (§9). This is where CDM lives and where the "bad day" question belongs (§2.2).

**The three-point habit is measurably wrong.** DES practice commonly elicits minimum / most
likely / maximum and fits a triangular distribution. In a published comparison against measured
emergency-department length-of-stay, a triangular built from SME triples **overstated the real
mean by about 69%** (339.6 vs. 201 minutes actual), while a skewed beta that read the elicited
middle value as a _mean_ rather than a mode landed within 1% **[V]**. The paper also documents
the mode/mean confusion as the mechanism, and notes the hard structural constraint that a
triangular's mean must lie in the middle third of its range — so the shape cannot represent the
skew that real service times have. This is the most directly actionable number in the review.

**What to do instead**, from structured expert judgment:

- The classical model elicits **quantiles — typically 5%, 50% and 95%** — and this is confirmed verbatim as the format used across the entire TU Delft study series **[V]**.
- SHELF's **quartile (bisection) method** asks for a median first, then conditional quartiles, and the protocol is reproduced verbatim in EFSA's guidance **[V]**. A written/remote adaptation exists with a nice two-step median: ask first for a "typical value", then have the expert adjust it until they are comfortable that the quantity is equally likely to fall above or below **[V]**.
- The **IDEA protocol's four-step question** is the most transplantable script found, verbatim **[V]**: (1) "Realistically, what do you think the lowest plausible value for [X] will be?" (2) "…highest plausible value…" (3) "Realistically, what is your best guess for [X]?" (4) "How confident are you that your interval, from lowest to highest, could capture the true value of [X]? Please enter a number between 50% and 100%." Note the order — interval before best guess — and note that step 4 is what makes the interval usable: responses are standardised to a common credible interval afterwards.
- The **roulette / chips-and-bins** method is the alternative for experts who prefer drawing to numbers; EFSA recommends ten bins over the plausible range, twenty chips, end bins left empty **[V]**.
- Do **not** ask directly for means, variances or "the distribution", and do not anchor on extremes without the confidence question **[V]**.

**When to ask for a specific bad day rather than an average.** Two grounded triggers: (i) the
model's question concerns a tail, a resilience property or a threshold breach, so an
average-based answer is answering a different question; and (ii) the phenomenon is rare enough
to be absent or unrecognisable in the logs, so no data channel can supply it (§9). The team
already reached (ii); (i) is the addition.

**Key sources.**

- Howard, R.A. (1988) "Decision analysis: practice and promise", _Management Science_ 34(6):679–695, doi:10.1287/mnsc.34.6.679 **[V]**; Morgan, M.G. & Henrion, M. (1990) _Uncertainty_, Cambridge University Press, p.50 **[V]**.
- Holm & Barra, "Input modelling with expert opinion" comparison, _Proceedings of the 2011 Winter Simulation Conference_ (informs-sim.org/wsc11papers/324.pdf) **[V]** — the 69% / 1% result.
- Colson, A.R. & Cooke, R.M. (2017) "Cross validation for the classical model of structured expert judgment", _Reliability Engineering & System Safety_ 163:109–120, doi:10.1016/j.ress.2017.02.003 **[V]**; Cooke, R.M. & Goossens, L.H.J. (2008) "TU Delft expert judgment data base", _RESS_ 93(5):657–674, doi:10.1016/j.ress.2007.03.005 **[V]**.
- EFSA (2014) "Guidance on expert knowledge elicitation in food and feed safety risk assessment", _EFSA Journal_ 12(6):3734, doi:10.2903/j.efsa.2014.3734 **[V]** — the single most usable protocol document found; contains the SHELF quartile script and filled-in elicitation forms.
- Speirs-Bridge, A. et al. (2010) "Reducing overconfidence in the interval judgments of experts", _Risk Analysis_ 30(3):512–523 **[V]** (origin of the four-step format); Hemming, V. et al. (2018) IDEA protocol, _Methods in Ecology and Evolution_ 9(1):169–180 **[V]**; Hemming, Walshe et al. (2018) _PLoS ONE_ 13(6):e0198468 **[V]** (standardisation formula).
- O'Hagan, A. et al. (2006) _Uncertain Judgements: Eliciting Experts' Probabilities_, Wiley **[R]**; Tversky & Kahneman (1974) _Science_ 185:1124–1131 **[R]**; Alpert & Raiffa (1982) **[R]**.

**Pack-content candidates.**

- **Quantity-type router card**: classify each needed quantity as number / distribution / story _before_ asking, then use the matching script.
- **Four-step interval card** (IDEA wording verbatim) as the default distribution script, with the quartile/bisection method as the deeper alternative when the quantity is load-bearing.
- **Anti-triangular guard**: if a min/mode/max triple arrives unprompted, do not fit a triangular to it — ask the confidence question and record whether the middle value is a mode or a mean.

---

## Section 2 — How do you reach what nobody wrote down?

### 2.1 Phrasings that elicit taxonomies, penalty weights, unwritten constraints

**Grounded answer.** These are three different problems with three different mature techniques.

**Taxonomies (e.g. product families) — laddering, verbatim.** A correction to a common
misconception first: laddering-up phrased as _"why is that important?"_ belongs to the
means-end-chain tradition in consumer research, **not** to knowledge-engineering laddering, and
the two should not be conflated **[V]**. The knowledge-engineering laddered-grid prompts are
**[V]**:

| Move                      | Prompt                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| DOWN the domain knowledge | "Can you give examples of \<ITEM\>?"                                                           |
| ACROSS                    | "What alternative examples of \<CLASS\> are there to \<ITEM\>?"                                |
| UP                        | "What have \<SAME LEVEL ITEMS\> got in common?" · "What are \<SAME LEVEL ITEMS\> examples of?" |
| Essential properties      | "How can you tell it is \<ITEM\>?"                                                             |
| Discrimination            | "What is the key difference between \<ITEM 1\> and \<ITEM 2\>?"                                |

Two of those are quietly the most valuable. _"How can you tell it is X?"_ elicits the
recognition criteria — which for a product family is the actual operational definition nobody
wrote down. And _"What is the key difference between X and Y?"_ is the discrimination probe that
turns a flat list into a typed taxonomy with guards attached. The elicitor moves around the
domain map in whatever order is convenient, building the network as it goes — it is explicitly
**not** a fixed question sequence.

**Card sorting** and **repertory grid / triadic elicitation** ("in what way are two of these
alike and different from the third?") complement laddering by surfacing attributes the expert
uses without having named **[V]**. The repertory grid has a second use worth noting: comparing
one expert's grid with another's highlights areas of consensus and difference **[V]** — a
mechanical route into §5.3.

**Penalty weights and objectives** belong to decision analysis, which the team's corpus does not
currently reflect. Keeney's devices **[V]**: ask for a **wish list** (how would you rank options
if constraints were removed?); name a particularly good and a particularly bad outcome and say
what makes each so; enumerate **shortcomings of the status quo**; ask what consequences would
**change** an option's desirability; ask what objectives **other stakeholders** would name. For
the weights themselves, **swing weighting** has the expert compare the swing from worst to best
level on each attribute rather than state a weight directly **[V]** — the same methodological
move as eliciting quantiles instead of variances.

**Unwritten constraints** ("that product always runs on line 2"). The best framing is
work-as-imagined vs. work-as-done **[V]**: what procedures say happens is systematically
different from what happens, and the gap is normal rather than deviant (the ETTO principle —
people trade thoroughness for efficiency as a matter of course). This reframes the question from
"what are the undocumented rules?", which invites denial, to "where does the written procedure
not survive contact with the day?", which invites description. Yannis's manuals-vs-event-logs
observation is the same distinction; process mining's de facto/de jure framing is its third
instance (§9).

One directly usable phrasing for this from the question typology is the **negative balance
question** **[V]**, which is built to counteract the tendency to describe the idealised version:
"You seem to be very efficient. Do you remember any occasions in which you had problems that
slowed you down?"

**Key sources.**

- Shadbolt, N.R. & Smart, P.R. (2015) "Knowledge elicitation: methods, tools and techniques", in Wilson & Sharples (eds) _Evaluation of Human Work_, 4th ed., CRC Press **[V]** — full text read; source of the laddering, card-sort and repertory-grid procedures above. **Citation correction**: the earlier chapter is Shadbolt, N. & Burton, M. (1990) "Knowledge elicitation", in Wilson & Corlett (eds) _Evaluation of Human Work: A Practical Ergonomics Methodology_, 2nd ed., pp.406–440, Taylor & Francis — _not_ "Knowledge elicitation: a systematic approach"; the 3rd-edition chapter is Shadbolt (2005) "Eliciting expertise" **[V]**.
- Corbridge, C. et al. (1994) — laddering in knowledge engineering **[C]**; Reynolds, T.J. & Gutman, J. (1988) "Laddering theory, method, analysis and interpretation", _Journal of Advertising Research_ 28(1):11–31 **[V]** — the _other_ laddering, cited here only to keep them separate.
- Kelly, G.A. (1955) _The Psychology of Personal Constructs_ **[R]** (repertory grid).
- Keeney, R.L. (1992) _Value-Focused Thinking_, Harvard University Press **[V]**.
- Hollnagel, E. (2014) _Safety-I and Safety-II_, Ashgate; Hollnagel (2015) "From Safety-I to Safety-II: A White Paper" **[V]**; Hollnagel (2009) _The ETTO Principle_ **[R]**.
- Zaremba, S. & Liaskos, S. (2021) "Towards a typology of questions for requirements elicitation interviews", _RE'21_, pp.384–389, doi:10.1109/RE51729.2021.00042 **[V]**.

**Pack-content candidates.**

- **Taxonomy card**: card sort → "what do these share, and what is the grouping for?" → the five laddering prompts verbatim → triadic probe on any group the expert hesitates over. Emphasise "how can you tell it is X?" and the key-difference probe.
- **Objectives-and-weights card**: Keeney's five devices, then swing weighting. Never ask "what weight would you give it?"
- **Work-as-done card**: negative-balance phrasing, then "who decides that?" and "who would notice if you didn't?"

### 2.2 Other questions of the "bad day" type

**Grounded answer.** The richest importable seam in the review. The team's single question is the
tip of three catalogues, all now in hand verbatim.

**Prospective hindsight / the premortem** is the strongest single result **[V]**: imagining an
event _has already happened_ increases correctly-identified reasons for it by about **30%**
(Mitchell, Russo & Pennington 1989), operationalised by Klein as the premortem. Applied here:
_"It's a year from now and this line missed its worst month on record. Tell me what happened."_
Strictly stronger than "what keeps you up at night?", because it licenses concrete causal
narration rather than anxiety report.

**The CDM deepening sweep, verbatim.** The probe table below is reproduced from the IHMC
_Protocols for Cognitive Task Analysis_ manual **[V]**, which documents the CDM procedure in
practitioner form. It is applied to a single specific incident that has already been narrated
and timelined, one pass per event on the timeline:

| Probe topic          | Probes                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cues & knowledge     | "What were you seeing?"                                                                                                 |
| Analogues            | "Were you reminded of any previous experience?"                                                                         |
| Standard scenarios   | "Does this case fit a standard or typical scenario?" · "Does it fit a scenario you were trained to deal with?"          |
| Goals                | "What were your specific goals and objectives at the time?"                                                             |
| Options              | "What other courses of action were considered or were available?"                                                       |
| Basis of choice      | "How was this option selected / other options rejected?" · "What rule was being followed?"                              |
| Mental modelling     | "Did you imagine the possible consequences of this action?" · "Did you imagine the events that would unfold?"           |
| Experience           | "What specific training or experience was necessary or helpful in making this decision?"                                |
| Decision-making      | "How much time pressure was involved?" · "How long did it take to actually make this decision?"                         |
| Situation assessment | "If you were asked to describe the situation to a relief officer at this point, how would you summarize the situation?" |
| Errors               | "What mistakes are likely at this point?" · "How might a novice have behaved differently?"                              |
| Hypotheticals        | "If a key feature of the situation had been different, what difference would it have made in your decision?"            |

Three of these are worth singling out for our purposes. **Basis of choice** — "what rule was
being followed?" — is a direct elicitation of the conflict-resolution policy that a net needs at
every contention point (§5.1). **Situation assessment** via the handover framing is a
remarkably efficient device: asking the expert to brief an incoming colleague extracts the state
variables they consider decision-relevant, which is close to asking what the marking must
record. And **options / errors** yield the guards and the exception paths.

The separate **what-if sweep** is a distinct later pass **[V]**: "What might have happened
differently at this point?" · "What were the alternative decisions that could have been made
here?" · "What choices were not made or what alternatives were rejected?" · "At this point,
what if it had been a novice present rather than someone with your level of proficiency — would
they have noticed Y? Would they have known to do X?" · "What sorts of error might have been made
at this point? Why might errors have occurred here?"

**The ACTA knowledge audit** is the third catalogue and the most general-purpose, because it is
explicitly a set of probes for knowledge experts have but do not volunteer. ACTA runs as **task
diagram → knowledge audit → simulation interview**, feeding a **cognitive demands table**
**[V]**. The eight probes, verbatim from a published application that adapted them from Militello
& Hutton (1998) — shown in their domain-adapted form precisely because that demonstrates the
adaptation move we will need **[V]**:

| #   | Probe                       | Wording as used                                                                                                                       |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Past and future             | "Can you remember entering a coaching situation when you knew how things got there and where they were headed?"                       |
| 2   | Big picture                 | "What are the big picture targets you are aiming for?" · "What are the main elements you need to track as things progress?"           |
| 3   | Noticing                    | "Can you remember any element of a situation popping out at you that others did not notice?"                                          |
| 4   | Tricks of the trade         | "Are there any ways of working that you have found to be more effective or efficient?" · "Who else is involved?"                      |
| 5   | Improvising / opportunities | "Can you think of a time when you have improvised, or noticed an opportunity to do it better?"                                        |
| 6   | Self-monitoring             | "Can you remember a time that you needed to change the way you were working to get a good outcome?" · "How did you make adjustments?" |
| 7   | Anomalies                   | "Can you remember a time that you knew something was amiss?"                                                                          |
| 8   | Information difficulties    | "Have you ever had a time that data or specialist input pointed in one direction, but your judgment suggested something else?"        |

Two details matter as much as the probes **[V]**:

- **A universal follow-up after every probe**: _"How would you know this? What cues and strategies are you relying on?"_ and _"How would this be difficult for a less-experienced person?"_ The expert–novice contrast used as a routine cue-extractor rather than a special technique — one rule that upgrades every other card.
- **Probe 8 is the elicitation counterpart of trusting the data estate.** "The data pointed one way but your judgment said otherwise" is the question that surfaces where an ERP/MES/historian figure is systematically wrong — for this project a data-binding requirement, not a psychological nicety.

ACTA guidance recommends **3–5 subject-matter experts** **[V]**, the closest thing found to a
sampling rule for this kind of elicitation.

**Key sources.**

- Mitchell, D.J., Russo, J.E. & Pennington, N. (1989) "Back to the future: temporal perspective in the explanation of events", _Journal of Behavioral Decision Making_ 2(1):25–38 **[V]**; Klein, G. (2007) "Performing a project premortem", _Harvard Business Review_ 85(9):18–19 **[V]**.
- Hoffman, R.R., Crandall, B., Klein, G., Jones, D.G. & Endsley, M.R. (2008) _Protocols for Cognitive Task Analysis_, Institute for Human and Machine Cognition **[V]** — full text read; source of the CDM probe tables above. The primary CDM paper is Klein, G.A., Calderwood, R. & MacGregor, D. (1989) "Critical decision method for eliciting knowledge", _IEEE Transactions on Systems, Man and Cybernetics_ 19(3):462–472, doi:10.1109/21.31053 **[C]** (closed access).
- Militello, L.G. & Hutton, R.J.B. (1998) "Applied cognitive task analysis (ACTA)", _Ergonomics_ 41(11):1618–1641, doi:10.1080/001401398186108 **[C]**; Taylor, J., Ashford, M. & Jefferson, M. (2023) _Frontiers in Psychology_ 14:1154168, doi:10.3389/fpsyg.2023.1154168 **[V]** — open access, source of the verbatim knowledge-audit table; Brown, Power & Gore (2025) "Cognitive task analysis: eliciting expert cognition in context", _Organizational Research Methods_, doi:10.1177/10944281241271216 **[V]**, open access, also reproduces the four CDM sweeps and the ACTA tables.
- Crandall, B., Klein, G. & Hoffman, R.R. (2006) _Working Minds_, MIT Press **[R]**.

**Pack-content candidates.**

- **Premortem card**: the "worst month on record, a year from now" prompt; demand mechanism and sequence, not sentiment.
- **Incident-probe card (CDM, verbatim above)**: narrate one real incident, timeline it, then sweep per event. Prioritise _basis of choice_ (→ conflict policy), _situation assessment via handover_ (→ marking content), _options_ and _errors_ (→ guards and exception paths).
- **Knowledge-audit sweep card (eight probes, verbatim above)**, translated to operational wording — probe 3 becomes "can you remember something in the line's behaviour that jumped out at you and that others walked past?"; probe 8 becomes "when did the system's numbers point one way and your judgment the other?"
- **Universal cue follow-up rule**: after any substantive answer — "how would you know that? what are you actually looking at?" and "how would this be hard for someone less experienced?"

### 2.3 Do constructed hypotheticals work? Failure modes?

**Grounded answer.** The literature splits, and the split is the useful part.

**In favour, conditionally.** CDM has an entire dedicated what-if sweep **[V]**, so hypotheticals
are endorsed by the strongest tradition here — but they are always **anchored to a real
remembered incident** already narrated and timelined. The hypothetical _varies a case_; it does
not invent one.

**Against, when free-floating.** The stated-preference literature is the best available evidence
on what happens when people answer about imagined situations, and it finds systematic
distortion: a meta-analysis of studies eliciting both hypothetical and actual values with the
same mechanism found a **median hypothetical-to-actual ratio of 1.35** with severe positive
skew, with the broader literature reporting median bias from 25% to 300% **[V]**. The mechanism
transfers: an expert asked "what would you do if…" reports the behaviour of an idealised self —
which is **work-as-imagined**, the thing we were trying to get behind.

**The named failure mode**: an unanchored hypothetical returns the expert's _policy_ (what they
believe they should do) rather than their _practice_, fluently and confidently, which makes it
hard to detect downstream. Mitigations, both grounded: anchor to a specific narrated incident
before varying it; and ask for **cues and mechanism** rather than the decision outcome — "what
would you be looking at?" is far more reliable than "what would you decide?"

**Key sources.** Murphy, J.J., Allen, P.G., Stevens, T.H. & Weatherhead, D. (2005) "A
meta-analysis of hypothetical bias in stated preference valuation", _Environmental and Resource
Economics_ 30(3):313–325 **[V]**; List, J.A. & Gallet, C.A. (2001), _ERE_ 20:241–254 **[V]**;
Hoffman et al. (2008) **[V]**; Hollnagel (2014/2015) **[V]**.

**Pack-content candidates.**

- **Hypothetical-escalation card with a precondition**: escalate only _after_ a real incident is on record, and phrase the variation against it.
- **Policy-vs-practice detector**: when an answer arrives in normative language ("we would…", "the rule is…"), follow with "when did that last actually happen, and what did you do?" A hypothetical that cannot be grounded in an instance is recorded at low confidence.

### 2.4 (added) Which technique, and how many — the efficiency evidence

This subsection did not correspond to an inventory question but answers one the inventory
implies: how should the elicitor _choose_ among these techniques, and does the choice matter
quantitatively? It does, by roughly an order of magnitude.

**Yield differs enormously by technique** **[V]**. Hoffman's comparison reports: unstructured
interview ≈ 0.8 propositions per question and ≈ 0.13 propositions per task-minute; structured
interview ≈ 1 new proposition per task-minute (with ~30% of first-pass propositions subsequently
modified); and contrived methods — limited-information tasks, constrained-processing tasks,
tough-case analysis — yielding 1–2 observation plus 1–2 inference propositions per task-minute.
The summary rule of thumb: ~3 per minute is excellent, ~2 is on track, ~1 signals inefficiency.
Most striking, unstructured-interview yield **collapses over time**: ~1.6 per minute in the first
five hours against 0.13 averaged across 100 hours. The later methodological analysis gives the
same ordering: unstructured under 1 informative proposition per total task-minute, structured
≈1, contrived and tough-case 2–3 **[V]**.

**But contrived tasks cannot stand alone** **[V]**. A four-method comparison (structured
interview, think-aloud protocol analysis, laddered grid, card sort) across three domains found
protocol analysis the most time-consuming and least productive, and found contrived tasks as
informative as interviews in less time — _but_ that they "needed to be used in conjunction with
an interview since they elicited specific knowledge and did not yield an overview of the domain
knowledge."

**Together these prescribe a two-phase architecture**: a short overview interview to get the
domain map and the objectives, then a rapid switch into structured and contrived modes for the
bulk of the work. The elicitor should not stay in open-ended conversational mode — that is the
lowest-yield mode available, and its yield decays.

**The differential access hypothesis, corrected** **[V]**. The strong version — that certain
knowledge can _only_ be elicited by particular techniques — is contentious and not established.
The field has shifted to **differential utility**: techniques are "scaffolds" establishing
conditions under which articulation is more or less likely, and each has strengths and
weaknesses, some procedural and some about the content elicited. The practical consequence is
unchanged and important for pack design: **mix techniques deliberately**, because no single mode
reaches everything, but do not believe that a specific probe is the only key to a specific kind
of knowledge.

**A caution on tacit knowledge and "why" questions.** Two classic results bound what direct
questioning can achieve. People have "little or no direct introspective access to higher order
cognitive processes", and reports about their own reasoning are often based on implicit causal
theories rather than observation **[V]**. And verbal reports are valid _data under conditions_:
concurrent verbalisation of currently-heeded content is reliable, whereas retrospective
questions about motives and reasons address content that "may not be available directly or even
at all" **[V]**. The pack-content rule that follows is concrete: **prefer "walk me through a
specific occasion — what were you attending to?" over "why do you do it this way?"** The CDM and
knowledge-audit probes above are all built this way, which is not a coincidence.

**On the "knowledge acquisition bottleneck".** Widely invoked, but **not attributable to a
single coiner** **[V]**. Hoffman (1987) calls knowledge extraction "widely regarded as the major
bottleneck", citing a cluster of early-1980s expert-systems sources; the 1995 methodological
analysis says elicitation "can be the most time-consuming and difficult stage in constructing a
working program" and credits the phrase's currency to late-1980s books and reviews. Cite it as
"widely regarded", with that trail — not as Feigenbaum's phrase.

**Key sources.**

- Hoffman, R.R. (1987) "The problem of extracting the knowledge of experts from the perspective of experimental psychology", _AI Magazine_ 8(2):53–67, doi:10.1609/aimag.v8i2.583 **[V]** (Tables 1 and 7 read from rendered page images).
- Hoffman, R.R., Shadbolt, N.R., Burton, A.M. & Klein, G. (1995) "Eliciting knowledge from experts: a methodological analysis", _Organizational Behavior and Human Decision Processes_ 62(2):129–158 **[V]**. Also contains the guild proficiency scale — naivette / novice / initiate / apprentice / journeyman / expert / master — with "expert" defined as one "whose judgments are uncommonly accurate… who can deal effectively with rare or 'tough' cases" **[V]**. That definition is a usable screening criterion for choosing an interviewee.
- Burton, A.M., Shadbolt, N.R., Rugg, G. & Hedgecock, A.P. — four-method comparison, reported in Hoffman et al. (1995) p.144 **[V]** (primary unavailable).
- Hoffman, R.R. & Lintern, G. (2006) "Eliciting and representing the knowledge of experts", in Ericsson et al. (eds) _The Cambridge Handbook of Expertise and Expert Performance_, pp.216–217 **[V]**.
- Nisbett, R.E. & Wilson, T.D. (1977) "Telling more than we can know: verbal reports on mental processes", _Psychological Review_ 84(3):231–259 **[V]**.
- Ericsson, K.A. & Simon, H.A. (1980) "Verbal reports as data", _Psychological Review_ 87(3):215–251 **[V]**.

**Pack-content candidates.**

- **Two-phase interview architecture**: bounded overview first (objectives, task diagram, domain map), then switch to structured and contrived probes. Time-box the open-ended phase explicitly.
- **Yield monitor**: track new propositions per minute; a sustained drop toward ~1 is the signal to change technique, not to ask more open questions. This is also a candidate PRO-104 metric (see shortlist).
- **No-bare-why rule**: never ask "why do you do it this way?" as a primary probe; ask for an occasion and for what was attended to.

---

## Section 3 — Structure: invented or assembled?

### 3.1 How much is motif instantiation? Can the catalogue be enumerated?

**Grounded answer: qualified yes — but the shape of the catalogue matters more than its
existence, and the literature is sharply divided on that shape.**

**Evidence for a finite idiom set.**

- **Workflow control-flow patterns**, derived empirically by surveying workflow products and languages **[V]**. The original twenty, with the 2003 category headings: _Basic Control Flow_ — 1 Sequence, 2 Parallel Split, 3 Synchronization, 4 Exclusive Choice, 5 Simple Merge; _Advanced Branching and Synchronization_ — 6 Multi-choice, 7 Synchronizing Merge, 8 Multi-merge, 9 Discriminator; _Structural_ — 10 Arbitrary Cycles, 11 Implicit Termination; _Multiple Instances_ — 12 MI Without Synchronization, 13 MI With a Priori Design Time Knowledge, 14 MI With a Priori Runtime Knowledge, 15 MI Without a Priori Runtime Knowledge; _State-based_ — 16 Deferred Choice, 17 Interleaved Parallel Routing, 18 Milestone; _Cancellation_ — 19 Cancel Activity, 20 Cancel Case.
- The revised catalogue reaches **43 in eight categories** **[V]**: Basic Control Flow (5), Advanced Branching and Synchronization (14), Multiple Instance (7), State-based (5), Cancellation and Force Completion (5), Iteration (3), Termination (2), Trigger (2). Crucially, **the revision is disambiguation by parameter extraction, not additive noise**: the original Synchronizing Merge became three patterns differing in evaluation locality, and the original Discriminator became six on the cross-product {discriminator, partial-join-with-threshold-_n_} × {structured, blocking, cancelling}. That is exactly the "which pattern, with what parameters" shape an interviewer wants.
- **Workflow resource patterns** — 43 in seven categories (Creation 11, Push 9, Pull 6, Detour 9, Auto-Start 4, Visibility 2, Multiple Resource 2) **[V]**, and methodologically the strongest of the catalogues because the patterns are _generated_ as labelled transitions on a work-item lifecycle state machine (created → offered → allocated → started → completed, plus withdrawn/failed) rather than collected anecdotally. For operational systems this is the most relevant catalogue, and it is the one the team's motif list (queue, resource pool, failure/repair, changeover, inspection) most resembles. Names worth having: Retain Familiar, History-Based Distribution, Shortest Queue, Round Robin Allocation, Delegation, Escalation, Deallocation, Suspension-Resumption, Piled Execution, Chained Execution, Simultaneous Execution, Additional Resources.
- **Exception handling patterns** are the best interview artifact in the whole corpus, because they are not a list but a **tuple space** **[V]**: ⟨work-item strategy, case-level strategy, recovery action⟩ raised in the context of an exception type. Exception types (5): Work Item Failure, Deadline Expiry, Resource Unavailability, External Trigger, Constraint Violation. Work-item strategies (15), case-level (3: continue workflow case / remove current case / remove all cases), recovery (3: no action / rollback / compensate) — the paper notes 15×3×3 = 135 conceivable patterns, of which only those applicable to each exception type are tabulated. Empirically, across eight systems only deadline expiry was widely supported and **zero offerings supported resource-unavailability exceptions** — which is a strong hint about where real elicitation effort should go.
- **Petri-net-specific**: the one real CPN pattern catalogue lists **34 patterns** **[V]** — including ID Matching, ID Manager, Aggregate Objects, Queue, FIFO/LIFO/Random/Priority Queue, Capacity-Bounding, Inhibitor Arc, Shared Database, Lock Manager, Log Manager, four Filter variants, Translator, Asynchronous/Synchronous Transfer, Rendezvous, Asynchronous Router/Aggregator, Broadcasting, Redundancy Manager, Data Distributor, Data Merge, Deterministic and Non-deterministic XOR-split, OR — classified as ⟨common component, diagnostic element, supplementary component⟩. Its opening premise is our hypothesis nearly verbatim: experienced Petri-net modellers model in terms of patterns, as object-oriented programmers use design patterns, and no structured collection existed. It also disclaims completeness, being "the result of an explorative work… not derived in a systematic manner", and **no successor exists** — so it is simultaneously the state of the art and evidence that the field never institutionalised this.
- **Reliability and maintenance is the strongest case in the survey** **[V]**. Dynamic fault tree gates are a finite, standardised, parameterised motif set _with published Petri-net translations_: on top of static AND/OR/VOTE-_k_, the set is PAND (priority-AND), POR (priority-OR), FDEP (functional dependency), PDEP (probabilistic dependency), SEQ (sequence enforcing), and SPARE parameterised by spare type cold/warm/hot. Thirty years of literature treat this as fixed vocabulary, and a 2018 paper gives gate-by-gate GSPN templates. Adjacent settled taxonomy: cold/warm/hot standby, _k_-out-of-_n_, imperfect coverage (switch succeeds with probability _c_ < 1) as a sub-motif nesting inside the others, and a reusable **repair box** module parameterised by number of repairmen and priority rules.
- **The strongest practical evidence is commercial** **[V]**: simulation tools ship closed block vocabularies — GPSS's 53 blocks; Arena's Basic Process (Create, Dispose, Process, Decide, Batch, Separate, Assign, Record), Advanced Process (Delay, Hold, Seize, Release, Search, Store, Match, Pickup, Dropoff, Gather, Signal…) and Advanced Transfer (Enter, Leave, Station, Route, Access, Convey, Request, Transport…); Simio's Server, Source, Sink, Rework, Combiner, Separator, Workstation, Worker, Resource, Vehicle, Conveyor. With the honest caveat that vendors _chose_ these vocabularies — closure is a design decision, not a discovered completeness result.

**Evidence against the strong version — and this is where it gets interesting.**

- **A correction to our own brief**: the standard GSPN textbook has **no "modelling paradigms / building blocks" chapter** **[V]**. Its own self-description is a set of illustrative examples from different application fields. **Do not cite it as evidence for a finite idiom set.** Where the GSPN tradition _is_ genuinely parameterised is transition semantics, and that is tool-enforced and exhaustively interviewable **[V]**: the **random switch** (immediate transitions in conflict resolved by normalised weights), race policy for timed conflicts, priority levels, inhibitor arcs, memory policy (enabling- vs age-memory), and a closed four-option **server-semantics** parameter — Infinite / _K_-Server (K=1 single, 2–127 multiple) / Marking-Dependent / Load-Dependent. That quiver is small, closed, and the right size to interview against.
- **The reduction argument is the most consequential finding in this section** **[V]**. Börger's critique holds that the pattern catalogues come "without pragmatic or rational foundation", that there is "no statistical underpinning showing how frequently which patterns appear in real-life business processes", and that the growth from 20 to 43 to 126 patterns has no shown _fundamentum in re_ or limit. His positive claim: most patterns "resemble very much molecules rather than fundamental elements", and all 43 control-flow patterns can be defined as instantiations of **eight generic schemes — four sequential and four parallel** — whose parameters are the instantiation points. He also quotes the pattern authors' own concession that "the selection of these patterns was done in an ad-hoc manner", and notes an independent reduction of 43 to 25 (claimed reducible below 18). The rebuttal defends patterns as deliberately informal and says users "should first analyze which patterns they need" — but **does not answer the reduction argument at all** **[V]**.
- **Frequency data is contaminated.** The catalogues were derived from _tools_ (15 products in 2003, 14 in the revision), and an independent study of five industrial projects found a **positive correlation between patterns used and patterns the chosen tool supports well** **[V]** — so pattern frequency partly measures tooling, not plants. Relatedly, van der Aalst's process-mining experience across 100+ organisations: typically **~80% of process instances fit a rather simple model, and the remaining 20% need the advanced patterns** **[V]**. That 80/20 is the honest prior for a motif catalogue: a small core will cover most behaviour, and the tail is where the modelling difficulty lives.
- **Names are stable; semantics are not** **[V]**. Inclusive vs. exclusive PAND, early vs. late spare claiming, and a naming drift within the workflow catalogue itself are all live. An interview keyed on pattern _names_ alone yields ambiguous nets: you need **name plus variant selector**.
- **The middle altitude is missing, and this is a real gap rather than a search failure** **[V]**. Between formal primitives (net algebra, transition semantics, hybrid constructs) and whole-application templates (a specific kanban system, a specific bridge model) there is **no institutionalised catalogue of operational motifs**. Setup/changeover, inspection/rework loop, batching/unbatching, AGV transport exist as named blocks in _simulation languages_ and as bespoke subnets in individual papers, but were never lifted into a named, cross-cited net-idiom set. Breakdown-and-repair has one name only in the deadlock-control literature ("recovery subnets"); kanban fragments into control-policy variants rather than one module. **This is precisely the altitude the team's motif catalogue would occupy** — which means the catalogue is a genuine contribution rather than a re-implementation, and also that there is no published list to copy.

**Verdict.** A motif catalogue is **well supported as an interview scaffold and gap-detector, and
poorly supported as a structure generator**. Its highest-value use is obligation-checking: "you
have described a buffer but not what happens when it is full"; "you have two transitions
competing for one resource and no rule". That use survives the absence of frequency data,
because it only requires that each motif have known obligatory parameters.

And the design consequence of Börger's argument is specific: build a **small quiver of
parameterised schemes with explicit variant selectors**, not a long enumerated menu. The
resource-pattern catalogue (generated from a lifecycle state machine), the exception tuple space,
the GSPN server-semantics options, and the DFT gate set with its spare-type parameter are the
four models to imitate — every one of them is a small closed set of _axes_, not a list.

### 3.2 Cyber-physical-specific motifs

**Grounded answer, including one finding that complicates our framing.**

- **Degradation with inspection / condition-based maintenance** is the motif family most likely to genuinely require per-entity continuous state (§6). Well populated in the literature but **individually engineered** — no canonical named template, and no paper found encoding the standard delay-time inspection model as a named Petri-net motif **[V]**.
- **Hybrid / fluid structures** where token counts make discrete tokens the wrong abstraction: David & Alla's primitives (continuous place, C-transition with maximal and instantaneous firing speeds, marking-dependent speeds, conflict resolution as an explicit formal problem) are a **closed primitive algebra but were never assembled into an application-level motif catalogue** **[V]**. Note the direction of travel: continuous approximation _reduces_ cost, so "continuous" is sometimes a simplification, not an escalation. The fluid-queue idiom — a discrete driving chain modulating a continuous level — is the one genuinely recurring composite **[V]**.
- **Sensing–actuation loops**, including honest treatment of sensor error and latency. The ACTA "information difficulties" probe is the elicitation counterpart.
- **Digital-twin synchronisation via Petri nets is genuinely thin** **[V]** — scattered papers, no catalogue, no shared naming. If the September demo leans on this, it will be inventing rather than instantiating.

**The complication worth flagging.** The most thoroughly verified real-world asset-management
Petri-net model found (railway track) decomposes as **nine sub-models, one per physical component
type**, instantiated nine times and coupled by shared places — 98 places and 61 transitions in
total — with **each sub-model bundling degradation, failure, inspection and maintenance
together** **[V]**. That is _not_ "degradation subnet × inspection subnet × maintenance subnet,
mix and match". If our interview design assumes functional-role modules that compose
orthogonally, the strongest primary evidence available backs a different decomposition: per-object-type
templates with internal lifecycles. Worth resolving deliberately before the catalogue is fixed,
and it connects to the case-notion problem in §9.

**Key sources.**

- van der Aalst, W.M.P., ter Hofstede, A.H.M., Kiepuszewski, B. & Barros, A.P. (2003) "Workflow patterns", _Distributed and Parallel Databases_ 14(1):5–51 **[V]** (note: workflowpatterns.com miscites the issue as 14(3)); Russell, N., ter Hofstede, A.H.M., van der Aalst, W.M.P. & Mulyar, N. (2006) "Workflow control-flow patterns: a revised view", BPM Center Report BPM-06-22 **[V]**.
- Russell, N., ter Hofstede, A.H.M., Edmond, D. & van der Aalst, W.M.P. (2004/2005) "Workflow resource patterns", BETA Working Paper WP 127, TU/e; CAiSE'05, LNCS 3520:216–232 **[V]**. Workflow data patterns: 40 in four categories **[V]**.
- Russell, N., van der Aalst, W.M.P. & ter Hofstede, A.H.M. (2006) "Workflow exception patterns", BPM-06-04; CAiSE'06, LNCS 4001:288–302 **[V]**.
- Mulyar, N. & van der Aalst, W.M.P. (2005) "Patterns in coloured Petri nets", BETA Working Paper WP 139, TU/e **[V]**.
- Börger, E. (2012) "Approaches to modeling business processes: a critical analysis of BPMN, workflow patterns and YAWL", _Software and Systems Modeling_ 11(3):305–318 **[V]**; Börger (2007) "Modeling workflow patterns from first principles", ER 2007, LNCS 4801:1–20 **[C]** (the eight schemes; the 4+4 split is verified from his later work, the scheme _names_ are not); van der Aalst, W.M.P. & ter Hofstede, A.H.M. (2012) "Workflow patterns put into context", _SoSyM_ 11(3):319–323 **[V]**.
- GreatSPN 2.0.2 manual, Università di Torino **[V]** (server semantics, random switch, priorities, compositionality). Ajmone Marsan, M., Balbo, G., Conte, G., Donatelli, S. & Franceschinis, G. (1995) _Modelling with Generalized Stochastic Petri Nets_, Wiley **[V]** — cited here **only** to record that it does not contain a building-block catalogue.
- Zhou, M. & DiCesare, F. (1993) _Petri Net Synthesis for Discrete Event Control of Manufacturing Systems_, Kluwer **[V]** — Parallel and Sequential Mutual Exclusion; three-step hybrid synthesis (top-down modular refinement, then stepwise addition of non-shared then shared resource places) with conditions preserving boundedness, liveness and reversibility. Ezpeleta, J., Colom, J.M. & Martínez, J. (1995) _IEEE T-RA_ 11(2):173–184 **[V]** — S³PR; deadlocks ⇔ unmarked siphons.
- Dugan, J.B., Bavuso, S.J. & Boyd, M.A. (1992) _IEEE Transactions on Reliability_ 41(3):363–377, doi:10.1109/24.159800 **[V]** (DFT gates); Junges, S., Katoen, J.-P., Stoelinga, M. & Volk, M. (2018) "One net fits all: a unifying semantics of dynamic fault trees using GSPNs", Petri Nets 2018, LNCS 10877, arXiv:1803.05376 **[V]**; Bobbio, A. & Codetta-Raiteri, D. (2004) RAMS, doi:10.1109/RAMS.2004.1285491 **[V]** (repair box); Trivedi, K.S. & Bobbio, A. (2017) _Reliability and Availability Engineering_, Cambridge University Press **[V]**.
- David, R. & Alla, H. (2010) _Discrete, Continuous, and Hybrid Petri Nets_, 2nd ed., Springer, doi:10.1007/978-3-642-10669-9 **[V]**; Trivedi, K.S. & Kulkarni, V.G. (1993) "FSPNs: fluid stochastic Petri nets", ICATPN'93 **[V]**.
- Litherland, J. & Andrews, J. (2023) _Proc. IMechE Part F_, doi:10.1177/09544097221110970 **[V]** (nine per-component sub-models).

**Five completeness disclaimers to quote against ourselves** **[V]** — worth keeping, because
they are the honest frame for any catalogue we publish: pattern identification is "by definition
an experiental activity and it is not possible to guarantee the completeness of any patterns
collection"; the CPN patterns "do not claim… completeness"; the 2003 patterns "do not claim to be
the only way of addressing the business requirements"; the composition-relationship list "is not
exhaustive"; and the DFT GSPN gate set is framed as extensible, not canonical.

**Pack-content candidates.**

- **Motif-as-obligation card**: each motif ships with its obligatory questions — a buffer needs capacity plus full-behaviour (block / spill / divert); a resource pool needs size, claim discipline and contention rule; failure/repair needs a trigger (time- or usage-based), a repair-duration distribution, and a repair resource; changeover needs to say whether it depends on from-state, to-state or both.
- **Variant-selector rule**: never record a motif by name alone; always record name plus the variant axis (e.g. spare = cold/warm/hot; merge = structured/local/general; server = infinite/K/marking-dependent/load-dependent).
- **Exception sweep card**: for each of the five exception types, ask the three tuple questions — what happens to the work item, what happens to the case, and what recovery action. Prioritise resource unavailability, which tooling systematically ignores.
- **Do not synthesise from the catalogue**: an explicit anti-card. The catalogue drives questions and gap-detection; structure comes from the expert's account.

---

## Section 4 — When are you done?

### 4.1 Is there a minimal category set?

**Grounded answer — and the team's list is missing three things.** Robinson's conceptual model
content set **[V]**: modelling objectives; responses/outputs; experimental factors/inputs; scope;
level of detail; **assumptions**; **simplifications**. Law adds the **assumptions document** as
the physical artifact, with a seven-item contents list **[V]**. Sargent adds **data validity**
and the **domain of intended applicability** **[V]**.

Robinson's four requirements for a conceptual model are **validity, credibility, utility and
feasibility** **[V]**, and his **assumptions/simplifications distinction is precise**:
_assumptions_ arise from limited knowledge or uncertainty about the real system (a
knowledge-acquisition problem); _simplifications_ are deliberate model abstractions adopted from
a desire for simpler, faster models (a design decision) **[V]**. They therefore have different
lifecycles — assumptions are elicitation backlog, simplifications are decisions to be defended —
and collapsing them into one "limitations" section destroys the distinction that tells you what
to go back and ask about.

His **scope** and **level of detail** decisions are recorded in tables with explicit
**Include / Exclude / Justification** columns **[V]**. That is the artifact shape our
intermediate representation should adopt for boundaries: not prose, but a decision table where
every exclusion carries a reason.

Simplification catalogues exist and are worth having as prompts **[V]**: Robinson's own list
comprises black-box modelling, grouping entities, replacing components with random variables,
excluding infrequent events, reducing the rule set, and splitting models — with Zeigler's four
and Morris's five as the older enumerations.

Compared with the team's candidate set (structure/topology, types & colours, rates &
distributions, initial marking, objective & penalties, constraints, data bindings, validation
data), the literature adds:

1. **Experimental factors** — what the user will _vary_. No slot for this currently, and without it there is no way to know what must be parameterised.
2. **Domain of applicability and accuracy bar** — the conditions over which validity is claimed and how close is close enough, set _before_ building **[V]**.
3. **Assumptions vs. simplifications, separated, each justified** **[V]**.

### 4.2 Is completeness question-relative? Should the elicitor elicit the questions first?

**Grounded answer: yes, and this is the most quotable result in the review.** Sargent, verbatim
**[V]**:

> "A model should be developed for a specific purpose (or application) and its validity
> determined with respect to that purpose. If the purpose of a model is to answer a variety of
> questions, the validity of the model needs to be determined with respect to each question."

and

> "This usually requires identifying the model variables of interest (i.e., the model variables
> used in answering the questions that the model is being developed to answer) and specifying the
> required acceptable range of accuracy for each variable."

That is the "questions the model answers" table arriving from the V&V literature as a
_precondition for validity_ rather than as documentation. It settles 4.2 affirmatively: elicit
the questions first, because they are simultaneously the scope criterion, the completion
criterion and the validation criterion.

**Stopping rules: what the literature says about when interviewers actually stop.** Requirements
research identifies four cognitive stopping rules **[V]** — two judgment-based: the **magnitude
threshold** rule (belief in sufficiency must reach a preset level) and the **difference
threshold** rule (stop when the marginal value of the latest information falls below a
threshold); and two reasoning-based: the **mental list** rule (stop when a schema-derived list is
complete) and **representational stability** (stop when the internal representation of the
problem is no longer being developed). The reported problem is that analysts **stop too soon**,
producing underspecification, and the proposed remedy is a **strategic prompting tool** built
from argument types (causation, generalization, analogy) and argument strategies (building
scenarios, elaborating with instances, generating counterarguments), which outperformed a
syntactic who/what/why/where/when/how control.

Two honest caveats. First, the conference paper that sets out this taxonomy contains **no results
section** — it states that analysis "will be completed by May 1998 and presented at the
conference" — so the taxonomy is citable from it but the empirical claims need the later journal
treatment **[V]**. Second, do not import qualitative **saturation** thresholds (~80% of codes in
the first six interviews; thematic saturation around twelve) as a completeness criterion **[V]**:
they concern theme discovery across a population of informants, not sufficiency of a single
system description.

For our purposes the useful part is direct: **representational stability is the stopping rule an
LLM elicitor will naturally implement** (it stops when its model stops changing), and it is one of
the two rules associated with premature stopping. The counter-measure is to make stopping
_criterion-based_ — the §4.1 category set plus the questions table — rather than
stability-based, and to fire a clearinghouse probe (§5) before closing.

### 4.3 Fact-list, or behavioural criterion?

**Grounded answer: both, in sequence — and the literature names each.**

The **fact-list** answer is Law's assumptions document, whose distinctive feature is not the
document but its acceptance test: validation in a **structured walkthrough** with the
subject-matter experts before any code is written **[V]**. Law's procedure is specific — the
document is projected and walked bullet by bullet in a meeting, and pre-circulating it for
private reading is explicitly _not_ a substitute, because the value is in the collective
challenge. That is a _social_ completion test and a better fit for the elicitor than an internal
checklist, because it produces a reviewable artifact the expert signs off.

The **behavioural** answer is Sargent's, and he names the two criteria the team intuited **[V]**:

- **Historical data validation**: "part of the data is used to build the model and the remaining data are used to determine (test) whether the model behaves as the system does" — reproduce a historical period.
- **Turing tests**: "Individuals who are knowledgeable about the operations of the system being modeled are asked if they can discriminate between system and model outputs." This is exactly "yes, that's our Friday pile-up" — an established technique with published statistical treatment, not a soft heuristic.
- **Face validity**: "Individuals knowledgeable about the system are asked whether the model and/or its behavior are reasonable" — the weaker, earlier-available cousin.

Sargent is also explicit that conceptual-model validation's primary techniques are **face
validation and traces**, and that face validation there "usually requires examining the flowchart
or graphical model … or the set of model equations" **[V]** — direct support for the
deterministic natural-language-summary requirement (FE-1335): the expert cannot face-validate
what they cannot read.

**So**: the fact-list is the right _intermediate_ completion artifact because it is what can be
walked through before a model exists; the behavioural criteria are the right _final_ ones; they
are ordered, not competing.

### 4.4 When the simulation matches the spreadsheet too well

**Grounded answer — assembled, because nothing addresses this directly.**

First, **agreement with an analytic calculation is a recognised verification technique, not a
warning sign** — Sargent, verbatim **[V]**: "Comparison to Other Models: … (1) simple cases of a
simulation model are compared to known results of analytic models". The existing practice — net
with failures off must reproduce the spreadsheet formula — is textbook, and should be kept.

Second, agreement in the **full** case is different, and queueing theory supplies a quantitative
discriminator. The Kingman/VUT relation gives queue time ≈ `((c_a² + c_e²)/2) · (u/(1−u)) · t_e`
**[V]** — so a stochastic model _should_ diverge from a deterministic one when utilisation is
high or coefficients of variation are large, and genuinely _should not_ when both are low. That
turns "suspect a missing coupling" into a check.

Ordered checklist when they agree too well:

1. **Compute utilisation of the binding resource.** If it is low and CVs are small, the agreement is probably genuine — a simple system, and the simulation is not earning its keep.
2. If utilisation is high, agreement is suspicious. Then:
3. **Was any distribution replaced by its mean?** Law warns about this specifically **[V]**; the single most common way variability silently disappears.
4. **Is there any coupling making stages non-independent** — blocking from a finite buffer, a shared resource or operator, a sequence-dependent setup? Independent stages with mean service times _is_ the spreadsheet, re-implemented.
5. **Run the extreme condition test** — Sargent, verbatim: "The model structure and outputs should be plausible for any extreme and unlikely combination of levels of factors in the system", with his example: "if in-process inventories are zero, production output should usually be zero" **[V]**.
6. **Degenerate test** — Sargent: "does the average number in the queue of a single server continue to increase over time when the arrival rate is larger than the service rate?" **[V]** A model that does not blow up when it should has no queueing wired in.

The underlying principle — a deterministic calculation and a stochastic model answer different
questions, and the average of a function is not the function of the average — is the "flaw of
averages" / Jensen's inequality framing **[R]**.

**Key sources.**

- Sargent, R.G. (2011) "Verification and validation of simulation models", _Proceedings of the 2011 Winter Simulation Conference_, pp.183–198 **[V]** — full text read; all quotations above. **Version note**: "Fixed Values" appears in the 1999 and 2000 versions (16 techniques) and was dropped from 2005 onward (15). For the complete list cite **Sargent (1999)**, WSC, informs-sim.org/wsc99papers/005.PDF **[V]**.
- Law, A.M. (2022) "How to build valid and credible simulation models", WSC, informs-sim.org/wsc22papers/128.pdf **[V]** — seven-step approach, seven-item assumptions-document contents, structured walkthrough procedure.
- Robinson, S. (2008) Part I **[V]**; Part II **[C]**; Robinson's WSC tutorials 2013/2015/2017 **[V]**.
- Kingman, J.F.C. (1961) _Proc. Cambridge Philosophical Society_ 57:902–904; Hopp, W.J. & Spearman, M.L. _Factory Physics_ **[V]**.
- Pitts, M.G. & Browne, G.J. (1998) "Investigating evaluative stopping rules in information requirements determination", _AMCIS 1998 Proceedings_ 265 **[V]**; the stopping-rule constructs derive from Nickles, Curley & Benson (1995) **[V]**; the fuller empirical treatment is Browne & Pitts (2004), _Organizational Behavior and Human Decision Processes_ **[R]**.
- Guest, G., Bunce, A. & Johnson, L. (2006) _Field Methods_ 18(1):59–82 **[V]**; Hennink, Kaiser & Marconi (2017) **[V]**.
- Savage, S.L. (2009) _The Flaw of Averages_ **[R]**.

**Pack-content candidates.**

- **Definition-of-done card**: the literature's minimal set — objectives, responses, experimental factors, scope, level of detail, assumptions, simplifications, accuracy bar, domain of applicability, data validity — explicitly including experimental factors and the accuracy bar.
- **Assumption/simplification splitter**: every limitation tagged as one or the other; assumptions become elicitation backlog, simplifications become defended decisions.
- **Include/Exclude/Justification tables** for scope and level of detail, adopted verbatim as the boundary artifact.
- **Criterion-based stopping**: never stop because the model stopped changing; stop on the category set plus the questions table, and fire a clearinghouse probe first.
- **Walkthrough card**: the completion ritual is reading the fact-list back for sign-off — projected and walked item by item, not circulated for silent review.
- **Too-good-agreement card**: the six-step checklist above, utilisation first.

---

## Section 5 — How do you cross-examine?

### 5.1 Standard traps and tests

**Grounded answer — the best finding is that the formalism generates its own cross-examination.**
Three of the team's candidate traps have exact formal counterparts, so they can be run
mechanically on the elicited structure and turned back into questions.

- **Token conservation** ("where do these come from / go?") is the informal version of a **place invariant**: a weighted token count constant across firings. Asking what is conserved is asking for the invariants, and each elicited invariant becomes a checkable property.
- **Structural completeness** has a canonical test: **workflow-net soundness** — (i) _option to complete_: from any reachable marking the final marking is still reachable; (ii) _proper completion_: when the end place is marked, all others are empty; (iii) _no dead transitions_ **[V]**. Each violation converts into a question. A dead transition means "you described this step but nothing can trigger it — when does it actually happen?" A lost option to complete means "there is a state your process can reach and never leave — is that a real deadlock you experience, or did I miss a recovery path?" The recovery path the expert then describes is exactly the unwritten knowledge §2 is chasing.
- **Conflict policy** is _forced_ by the semantics rather than optional: two transitions sharing an input place require a priority, a weight, or a policy **[V]**. The elicitor needs no interviewing instinct to ask — the structure obliges it. And CDM's _basis of choice_ probe ("what rule was being followed?") is the matching human-side question.
- **Assumed-vs-emergent** has a precise detector: Robinson's **experimental factor vs. response** distinction **[V]**. Throughput offered as an input is a response mis-filed as a factor.
- **Data-vs-decision conflation** is a recognised failure with a recognised remedy: **separate decision logic from process logic**, the rationale for pairing decision tables with process models — decision logic encoded in control flow produces unmaintainable "spaghetti" **[V]**. The elicitation counterpart is to record the _decision rule_ as a distinct object with its own inputs rather than as a property of an arc.
- **Boundary probing** is Robinson's simplifications register plus the Include/Exclude/Justification tables, and asking for it explicitly is recommended practice, not a trap **[V]**.

**A ready-made probe set for cross-examination.** The interview-question typology supplies
several verbatim moves that are exactly what an LLM elicitor is unusually well placed to
execute, because it holds the whole transcript **[V]**:

- **Consistency probe**: "You said earlier that **_ but then you told me _**. How do you explain that?"
- **Clearinghouse probe**: "What have I not asked that is important in this process?" · "Is there anything else I should know?"
- **Comparison/contrast**: "Can you tell me about the situation in department X…? How is it the same or different from what happens in your department?"
- **Interpreting / check-reflect / restatement**: "You then mean that…?" · "So it takes a lot of effort to query the information — is that what you say?" · "So you're saying that \_\_\_" — the teachback family, for confirming a reading before building on it.
- **Echo probe**: repeating what was just said, for confirmation and placement in the timeline.

The same typology names the **anti-patterns**: leading probe ("Isn't it the case that…?"),
forced choice (assumes at least one option is needed), and leading questions that presuppose a
need. Those belong in the elicitor's do-not-do list.

**Interviewer failure modes — now verified in full.** An empirical study of 28 elicitation
interviews produced a **34-mistake taxonomy in seven categories**, with observed frequencies
**[V]**:

| Category                  | Mistakes (frequency out of 28 interviews)                                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question formulation**  | Asking vague questions (21) · asking technical questions (15) · asking irrelevant/incorrect questions (6) · **asking customer for solutions (4)** · asking very long questions (1) · incorrect formulation of questions (1)                                                                  |
| **Question omission**     | Not identifying stakeholders (12) · **no probing questions (11)** · not asking about existing system / business process (11) · not asking about feature prioritisation (9) · not asking about the problem domain (7) · not identifying success criteria (1) · missing relevant questions (1) |
| **Order of interview**    | Incorrect ending of interview (19) · incorrect opening of interview (15) · incorrect order of questions (15) · repeating the questions (6)                                                                                                                                                   |
| **Communication skills**  | Unnatural dialogue style (14) · poor communication skills (5) · poor listening skills (2) · unclear voice (1) · looking at laptop during conversation (1)                                                                                                                                    |
| **Analyst behaviour**     | Lack of confidence (5) · overconfidence/arrogance (1) · passive attitude (1) · unprofessional behaviour (1)                                                                                                                                                                                  |
| **Customer interaction**  | No rapport with customer (16) · **influencing customer (1)** · interrupting customer (1)                                                                                                                                                                                                     |
| **Teamwork and planning** | Lack of coordination among group (14) · lack of time management (3) · lack of preparation to understand problem domain (2) · lack of planning (1) · long pause (1)                                                                                                                           |

Several of these land directly on our design. **"Asking vague questions" is the single most
frequent mistake** (21 of 28), defined as questions yielding multiple interpretations — which is
also the failure an LLM is most prone to, because fluent generic questions are cheap. **"No
probing questions" (11)** is the failure mode the AI-interviewing evidence independently flags
as the one that matters most (§8). **"Not identifying success criteria" and "not asking about the
problem domain"** are the §1.2 objectives-first failures. And **"asking customer for solutions"**
is precisely Lu's positioning critique of the incumbent Petrinaut assistant — asking the expert
_for a net_ is a named, catalogued elicitation mistake, which is a considerably stronger way to
make that argument than a preference claim.

The four **order-of-interview** mistakes are worth separate attention because they are the ones a
questionnaire-shaped agent will make by construction: incorrect ending (19) and incorrect opening
(15) are the two most frequent single mistakes after vague questions.

### 5.2 Contrastive cases

**Grounded answer: yes, and there are three established forms.** **Triadic elicitation** — "in
what way are two of these alike and different from the third?" — exists to surface the
discriminating attribute an expert uses without naming **[V]**. Laddering's **key-difference**
prompt is the two-item version **[V]**. CDM contributes the **expert–novice contrast** ("would
someone less experienced have read that the same way?"), which isolates the cue actually being
used **[V]**. And the question typology's **comparison/contrast** form gives the across-sites
version **[V]**.

For disambiguating two readings of one utterance, the minimal move is a **discriminating case**:
construct a situation where the readings predict different behaviour and ask which happens. Note
this is a hypothetical, so §2.3's precondition applies — anchor it to a real case where possible,
and prefer asking what the expert would be _looking at_ over what they would decide.

### 5.3 When experts disagree

**Grounded answer, and the literature has a clear recommendation that cuts against consensus-seeking.**

Two opposed approaches exist. **Behavioural aggregation** (SHELF) elicits individually, then
convenes the experts and facilitates toward a single distribution representing what a **Rational
Impartial Observer** would believe having heard the arguments — and note the exact framing
**[V]**: experts are _not_ asked to agree; "they are asked to consider what an intelligent and
impartial observer might now reasonably believe about X, having assimilated the experts'
different opinions and arguments." **Mathematical aggregation** (Cooke's classical model) keeps
experts separate, scores them on **seed variables** with known answers, and combines with weights
from calibration ("statistical accuracy" — the p-value of the hypothesis that realisations fall
in the inter-quantile intervals) and informativeness **[V]**.

**The empirical verdict favours performance weighting** **[V]**: it beat equal weighting
in-sample in 32 of 33 post-2006 studies, with a geometric-mean ratio of 3.86; out-of-sample there
is a penalty on statistical accuracy but performance weighting still won on the combined index in
26 of 33 (p = 0.001), and 54 of 73 pooled (p = 2.5 × 10⁻⁵). Sobering detail for anyone
tempted by simple averaging: the **best single expert also beat equal weighting** (ratio 1.84).
The database behind this is 45 panels, 521 experts, 67,001 elicitations.

**And the literature's recommendation when experts strongly disagree is explicit and goes to
mathematical aggregation** **[V]**: behavioural aggregation "sometimes… does not succeed because
experts strongly disagree. When they do, any attempt to impose agreement will promote confusion
between consensus and certainty. And since the goal should be to quantify uncertainty, not to
remove it from the decision process, mathematical methods of aggregation should be sought." The
same guidance warns that behavioural approaches "tend to encourage convergence of views… In risk
analysis this may be extremely dangerous", and that good practice means "maintaining
disagreements". It also gives a concrete false-consensus guard: compute an equal-weighted pool of
the individual distributions as a width baseline, **do not show it to the experts**, and be
suspicious if the negotiated consensus is appreciably narrower.

**What an agent should do is neither, at first.** The prior move — most likely to resolve the
disagreement outright — is to check that the experts are answering the **same question**, using
the clairvoyant test **[V]**. Much apparent factual disagreement in elicitation is definitional:
different assumed boundaries, units, or implicit conditioning ("cycle time" including or
excluding setup). An agent is unusually well placed to catch this, holding both utterances in
full — and the **consistency probe** (§5.1) is the move that surfaces it.

Then, if disagreement survives definitional repair:

- Do **not** silently average — it destroys the most valuable signal in the interview and, per the above, manufactures false certainty.
- Record a **contested fact** with both values, both sources, and each expert's reasoning.
- Cooke's performance weighting is not practically available to a live agent (seed variables need known answers prepared in advance), so the importable parts are the **format** (quantiles) and the **discipline** (preserve and propagate).
- Where the disagreement concerns a model parameter, the honest projection is a range or a scenario pair, with the model's answer reported under both.
- Distinguish disagreement about **facts** from **definitions** from **values/objectives** — the third is not resolvable by elicitation and belongs in the objectives record (§7), not the parameter record.

One honest caveat: this literature reports **no methodological consensus**, "let alone a 'gold
standard'", and notes that empirical comparisons are in contradiction **[V]**. We are choosing a
defensible position, not implementing a settled one.

**Key sources.**

- van der Aalst, W.M.P. (1998) "The application of Petri nets to workflow management", _Journal of Circuits, Systems and Computers_ 8(1):21–66; van der Aalst et al. (2011) "Soundness of workflow nets", _Formal Aspects of Computing_ 23:333–363 **[V]**.
- Batoulis, K., Meyer, A., Bazhenova, E., Decker, G. & Weske, M. (2015) "Extracting decision logic from process models", CAiSE 2015, LNCS 9097:349–366 **[V]**.
- Bano, M., Zowghi, D., Ferrari, A., Spoletini, P. & Donati, B. (2019) "Teaching requirements elicitation interviews: an empirical study of learning from mistakes", _Requirements Engineering_ 24(3):259–289 **[V]** — Fig. 3 read directly; source of the 34-mistake taxonomy. The RE'18 conference version carries the same taxonomy **[V]**. Ferrari, A., Spoletini, P. & Bano, M. et al. (2020) "SaPeer and ReverseSaPeer", _Requirements Engineering_ 25(4):417–438 **[V]** documents which mistakes training does and does not fix. Ferrari, A., Spoletini, P. & Gnesi, S. (2016) _Requirements Engineering_ 21(3):333–355 **[V]** on ambiguity in elicitation interviews.
- Zaremba & Liaskos (2021) **[V]** — the question typology and all verbatim probe examples in §5.1.
- Colson & Cooke (2017) **[V]**; Cooke & Goossens (2008) **[V]**; Cooke, R.M. (1991) _Experts in Uncertainty_, Oxford University Press **[R]**.
- EFSA (2014) _EFSA Journal_ 12(6):3734 **[V]** — RIO framing, the aggregation recommendation, the false-consensus guard.
- Howard (1988) **[V]**. Rowe, G. & Wright, G. (1999) "The Delphi technique as a forecasting tool", _International Journal of Forecasting_ 15(4):353–375 **[V]** — four defining features (anonymity, iteration, controlled feedback, statistical group response); Delphi beat traditional groups 5:1 and statistical groups 12:2 in their tallies.

**Pack-content candidates.**

- **Soundness-to-question card**: run the three soundness checks; each violation has a scripted question. Highest-value implementable cross-examination in the review.
- **Contention obligation card**: any shared input place without a resolution rule is an open issue, raised automatically; pair with CDM's "what rule was being followed?"
- **Consistency-probe card**: verbatim wording above. Cheap for an agent, hard for a human — a genuine asymmetric advantage.
- **Clearinghouse probe as a closing ritual**: "what have I not asked that is important?" before any completion claim.
- **Clairvoyant-test card**: restate any quantity as a question a clairvoyant could answer; if you cannot, the definition is what to elicit next. Run first whenever two sources conflict.
- **Contested-fact record**: disagreement is a first-class object with both positions, never an average; never negotiate toward a narrower range.
- **Interviewer self-check rubric**: the 34-mistake taxonomy as a post-turn audit, weighted by observed frequency — vague questions, missing probes, and opening/ending errors first.

---

## Section 6 — Which systems earn which formalism?

### 6.1 Evidence that earns each capability

**Grounded answer, with one correction to the ladder's shape.** The ladder mixes three different
kinds of thing, and separating them makes each answerable: **genuine expressiveness** (timed,
stochastic, hybrid/continuous state), **engineering convenience** (colour, subnets), and
**use-case properties** (live data feed, cyclic vs. terminating).

| Capability                                  | What earns it                                                                                                                                                                                   | What says it isn't needed                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timed**                                   | Any response is a duration, rate, or due-date breach; or resources are contended (contention only bites in time).                                                                               | All responses concern feasibility or logical correctness, not timing.                                                                                                                                                                                                         |
| **Stochastic**                              | The question concerns a tail, percentile or service level; **or** the binding resource's utilisation is high or CVs are large — VUT makes variability's effect quantifiable in advance **[V]**. | Low utilisation _and_ low variability _and_ a question about a mean. Then a deterministic calculation gives the same answer.                                                                                                                                                  |
| **Coloured (static)**                       | Repeated structure differing only in parameter values, where the unfolded net would be unmanageable or hand-synchronised.                                                                       | Few entity types, or types that don't change behaviour. **Note:** with finite colour sets a CPN unfolds to an equivalent P/T net **[V]** — colour adds _no expressive power_, only compactness and maintainability. An engineering choice, not a capability a system "needs". |
| **Dynamically coloured / continuous state** | A continuous per-entity quantity evolves _between_ events and feeds back into event timing or enabling, and thresholds cannot stand in for it.                                                  | The state can be discretised into a few threshold bands without changing the answer — usually the case, and the right default assumption.                                                                                                                                     |
| **Guards / conflict resolution**            | Forced, not earned: two transitions sharing an input place require a priority, weight, or policy **[V]**.                                                                                       | Only if no contention exists anywhere — rare.                                                                                                                                                                                                                                 |
| **Subnets / templating**                    | Repeated structural units that must stay in sync; same driver as colour, and hierarchical CPN exists for it **[R]**.                                                                            | One-off structures.                                                                                                                                                                                                                                                           |
| **Live data feed**                          | The _use_ is reactive — re-run from observed current state. A property of the use case, not the system.                                                                                         | The use is design-time or comparative.                                                                                                                                                                                                                                        |
| **Cyclic vs. acyclic**                      | Steady-state vs. terminating horizon. Determines **experiment design** (warm-up, run length, replications), not structure.                                                                      | —                                                                                                                                                                                                                                                                             |

Two inversions cut against a prestige reading. **Continuous/fluid Petri nets are introduced to
reduce computational cost** when token counts are large **[V]** — "continuous" is sometimes a
simplification. And **colour is a folding**, so a system cannot "need" colour the way it can need
stochasticity.

### 6.2 Attacking the hypothesis

**The working hypothesis survives.** "Most systems don't earn the full stack; a simpler variant is
often the better model" is consistent with everything found, and with the field's central
methodological norm — start simple, add complexity, keep the model as simple as will answer the
question **[V]**. Brooks & Wang's finding that conceptual models drift toward _added_ complexity
during projects **[V]** is the empirical warning that this norm is hard to hold, not evidence
against it. Robinson's own framing of the four requirements puts **utility and feasibility**
alongside validity and credibility **[V]**, which is the formal statement of the same point.

**Where it is most likely wrong / what is underestimated:**

- **Variability magnitude, not just presence.** Teams include stochasticity but with defaulted or wrong CVs. VUT makes the CV term a linear multiplier on queue time, so getting variability roughly right matters more than adding structural detail. Most under-served capability.
- **Resource contention and blocking.** Finite buffers that block upstream, shared operators and tools — mundane, decisive, and the coupling whose absence produces the too-good spreadsheet agreement of §4.4.
- **Calendars, shifts and changeovers.** Unglamorous, frequently decisive in scheduling, rarely on a feature ladder at all — and, per §9, exactly the parameters that process mining _cannot_ supply and interviews must.
- **Exception and recovery behaviour.** The exception-pattern survey found tooling systematically ignores resource-unavailability exceptions **[V]**; there is no reason to think our elicitation would do better unless it asks explicitly.

**What is prestige:** dynamic colouring. Hardest necessity to demonstrate, easiest to replace with
threshold discretisation.

**Confidence note:** no literature was found that empirically ranks Petri-net feature usage. The
ranking above is inference from operations and queueing results, not a citable frequency
distribution.

### 6.3 Which use case earns the showcase?

The literature cannot pick the demo. What it supplies is a **criterion**: a system genuinely
strains dynamic colouring when a _per-entity continuous state gates events_, and the question is
about **when a threshold is crossed** rather than about average flow. That points at
condition-based maintenance on a fleet of degrading assets, or an energy/charge-constrained mobile
fleet — each unit carrying its own continuously-evolving state, with the decision being whether to
intervene before a crossing.

Two cautions from §3.2. The best-verified real asset-management model of this kind decomposes
**per component type**, each template bundling degradation, inspection and maintenance — so
expect the showcase to need object-type templates rather than orthogonal functional modules. And
Petri-net digital-twin synchronisation is thin in the literature, so a demo leaning on live
state injection will be inventing rather than instantiating.

The PRO-99 tension is real and this review sharpens rather than dissolves it: **most candidate use
cases will not earn dynamic colouring**, so a showcase demo needs either a purpose-chosen use case
of the kind above, or an honest pivot to showcasing what is genuinely load-bearing — variability
and contention.

**Pack-content candidates.**

- **Formalism-earning card per capability** (the table above), each phrased as an evidence test.
- **Utilisation-and-variability probe**: "how busy is the busiest resource, and how much do its times vary?" — one early question deciding stochastic-or-not on quantitative grounds.
- **Threshold-substitution challenge**: before accepting continuous state, ask whether three or four bands would change the answer. If not, discretise.

---

## Section 7 — What lives outside the net?

### 7.1 What else belongs on the list?

The existing list (decision policies at conflict points, objective functions and penalty weights,
goals and rationale, regulatory/business constraints, conservation laws, theoretical-vs-actual
process, data-feed bindings, validation criteria) is well-founded. The literature adds:

1. **Modelling objectives, responses, and experimental factors** **[V]** — purpose, what it must report, what the user will vary. Without the third you cannot tell what must be parameterised.
2. **Accuracy bar and domain of applicability** **[V]**, set before building.
3. **Assumptions and simplifications, separated, each justified** **[V]** — different lifecycles (§4.1).
4. **Scope and level-of-detail tables with Include / Exclude / Justification columns** **[V]** — every exclusion carries a reason.
5. **Decision logic as a first-class separate object** — decision tables, not control-flow encoding **[V]**. Where conflict-point policies belong, and the structural fix for data-vs-decision conflation.
6. **Design rationale** — why this way, which alternatives were rejected, on what criterion. Established notations exist: QOC (questions / options / criteria), IBIS, DRL **[V]**.
7. **The work-as-imagined vs. work-as-done divergence record** **[V]** — not just "manual says X, log says Y" but the _reason_ for the gap, where unwritten constraints live. §9 gives the log-side machinery for detecting it.
8. **Per-fact provenance and confidence**, plus **contested facts** with both positions (§5.3). Yannis's confidence-directed questioning needs this substrate.
9. **A definitions dictionary that passes the clairvoyant test** **[V]** — units, boundaries, what each named quantity includes. Cheapest defence against §5.3 disagreements and silent conflation.
10. **A construct-deficit register** — what the notation cannot express, recorded deliberately. Representational analysis supplies the vocabulary: ontological incompleteness (construct deficit), construct overload, excess, redundancy **[V]**. Writing down what the net structurally cannot hold is what makes "the net is one projection" operational rather than rhetorical.
11. **Declined and deferred items** — what the expert would not or could not answer. Absent from most schemas and load-bearing for an agent deciding where to probe next.
12. **The case notion / object types and their granularity** **[V]** — see §9. For a physical system with several interacting object types this is a modelling decision with no data-internal ground truth, and it belongs in the record as a decision with a justification, not as an implicit choice.

### 7.2 Minimum schema for the intermediate representation

**Per fact / quantity:**

- identity and a **clairvoyant-testable definition** (units; what is in and out of the quantity);
- **kind**: structural element, quantity, distribution, rule/policy, constraint, objective, or narrative incident;
- **role**: experimental factor, response, or fixed parameter (the §1.3 classifier);
- **value**: point value, distribution _as elicited quantiles with the elicitation method recorded_, or narrative;
- **provenance**: who said it, when, in answer to what — and whether spoken, document-derived, or log-derived;
- **confidence**, and **contested-by** where sources differ;
- **the objective(s)/question(s) it serves** — the link making question-relative completeness checkable;
- **projection hint**: whether and how it lands in the net; for motifs, name **plus variant selector** (§3.1).

**Per model:**

- the **questions the model must answer**, each with its accuracy bar;
- **scope** and **level-of-detail** tables with Include/Exclude/Justification;
- **assumptions** and **simplifications** as separate justified lists;
- the **case notion / object types** with rationale;
- **validation plan**: the historical period to replay, and which pathologies the expert should be asked to recognise;
- the **construct-deficit register** and the **declined/deferred** list.

Note the shape: most of these fields exist to support _questions the elicitor will ask later_
(confidence → where to probe; assumptions → backlog; declined → what not to re-ask). The IR is an
interviewing work-list as much as a model description — a stronger claim than "the net is one
projection of it".

**Key sources.** Robinson (2008) Part I **[V]** and WSC tutorials **[V]**; Sargent (2011) **[V]**;
Law (2022) **[V]**; Batoulis et al. (2015) **[V]**; MacLean, A., Young, R.M., Bellotti, V. &
Moran, T.P. (1991) "Questions, options, and criteria: elements of design space analysis",
_Human-Computer Interaction_ 6(3–4):201–250 **[V]**; Kunz & Rittel (1970) IBIS **[R]**; Lee & Lai
(1991) DRL **[R]**; Wand & Weber BWW representation model, and Recker et al. on BPMN
representational analysis **[V]**; Howard (1988) **[V]**.

**Pack-content candidates.**

- **Outside-the-net checklist** (the twelve items) as a late-interview sweep.
- **Definitions-first rule**: no quantity recorded without a clairvoyant-testable definition.
- **Rationale capture card**: for each significant modelling choice, record question, options considered, and criterion (QOC).

---

## Section 8 (added) — The elicitor as an agent

The inventory has seven sections; the brief referred to eight. This section and §9 cover the
cross-cutting questions the framing implies and the inventory leaves implicit.

**The most directly useful finding.** In a study of 381 AI-conducted qualitative interviews there
were **systematic differences between top-of-mind first responses and later responses, with
interviewees' mental models emerging consistently later** **[V]**; the resulting data predicted
real behaviour eight months on, weighing against a "cheap talk" reading. Three consequences:

1. **Depth of probing is the differentiator**, not breadth. First answers are systematically unrepresentative of what the expert knows. This converges exactly with the mistake taxonomy's "no probing questions" (11 of 28) and with Hoffman's finding that structured and contrived modes outyield open conversation by an order of magnitude (§2.4).
2. A direct argument against **question batching**: batching optimises throughput on first-pass answers, the least valuable ones. Lu's horizon-problem caveat has independent empirical backing — batch small, prefer depth.
3. A **measurable evaluation proxy** for the otherwise-intractable evaluation problem: compare content extractable from first responses alone against content after probing. An elicitor adding little beyond first responses is failing, and this is measurable without a ground-truth model or a repeatable human.

**On feasibility.** The 2025–26 literature reports respondents rating chatbot interviews
**comparable in quality to human interviews**, and AI-led interviews **reaching saturation at
comparable level and speed** **[V]**. But the same literature states plainly that **evaluation
methodology remains unestablished** — no consensus on which constructs to measure **[V]**. Worth
saying to the team directly: the evaluation problem aired in the meeting is an **open research
problem**, not a local gap in diligence, and the existing plan (model-as-offline-respondent,
frozen replay fixtures, mutation library) is a reasonable independent answer.

**Two ready-made assets for the mutation library.** The 34-mistake taxonomy (§5.1) is a
frequency-weighted defect list to inject deliberately, and a separate 28-criterion
interviewer-assessment framework exists **[V]**. There is also a small but growing set of
LLM-interviewer systems for requirements elicitation with published evaluations **[V]** — worth
reading before building the control experiment Dora proposed, precisely because it defines what
"vanilla LLM baseline" has already been measured to do.

**Key sources.** Chopra, F. & Haaland, I. (2023) "Conducting qualitative interviews with AI",
CESifo Working Paper 10666 / CEBI WP 06-23 **[V]**; AI conversational interviewing literature,
arXiv:2504.13908, arXiv:2606.20064, arXiv:2606.20588 **[V]**; Bano et al. (2019) **[V]**;
Shen, Singhal & Breaux, RE'25 interviewer-assessment criteria **[V]**; LLM-elicitation systems
including LLMREI (arXiv:2507.02564), follow-up question generation (arXiv:2507.02858), Elicitron
(arXiv:2404.16045), ReqElicitGym (arXiv:2602.18306), and Görer & Aydemir (arXiv:2406.11439)
**[V]** (retrieved; not read in depth).

**Pack-content candidates.**

- **Probe-depth policy**: never accept a first answer on a load-bearing fact; the second and third passes carry the value.
- **Anti-batching guard**: batch only questions that are mutually independent _and_ cheap; never batch a question whose framing depends on an unanswered one.
- **Vagueness guard**: before emitting a question, check it admits only one reading — the most frequent human mistake and the one LLM fluency most invites.

---

## Section 9 (added) — Elicitation from logs: what data substitutes for, and what it cannot

This is Yannis's theoretical-vs-actual framing with its literature attached, and it matters for
scoping the interview: every parameter the data can supply is a question the elicitor should not
spend expert time on.

**The framing.** Process mining distinguishes **discovery** (derive a model from an event log),
**conformance checking** (compare a model against a log), and **enhancement/extension** (enrich a
model with log-derived information) **[V]**. Logs yield the **_de facto_** model — what actually
happens; documents and interviews yield the **_de jure_** model — what is supposed to happen — and
the refined framework has named activities for both directions of travel between them **[V]**.
That is the same distinction as work-as-imagined vs. work-as-done (§2.1), arriving from the data
side.

**Where the log genuinely substitutes for the interview.** Simulation-model discovery from logs
recovers control flow, branching probabilities, resource pools, and processing-time
distributions **[V]**. One study provides a literal source-per-parameter table: mining supplies
control flow, branching probabilities, resource pools and processing times; interviews supply
calendars, shifts, availability fractions, costs, priorities and seasonality **[V]**. That table
is close to a specification for what the elicitor should ask about — and note it lines up exactly
with §6.2's "calendars and changeovers are underestimated".

**The honest twist in that same study**: the largest residual error in the validated model, a
~19% overshoot, traced to the **interview-supplied availability estimate** **[V]**. Elicited
quantities need validation too; this is not a story about data being unreliable and experts being
reliable.

**What is structurally absent from any log, and must be elicited** **[V]**:

1. **Behaviour that never touched the system** — phone calls, paper, offline workarounds. A healthcare study makes the point concretely: nurses phoning the pharmacy is invisible to _any_ data-only method; and of six identified workaround types, two are undetectable in principle from logs.
2. **Rationale and context** — logs record the what, never the why. A recent taxonomy organises contextual factors across nine dimensions; seasonal variation is the canonical example where mining shows the pattern and only a person supplies the cause.
3. **Resource reality** — part-time attention, workload-dependent speed, batching, calendars, priorities. The simulation-survival-guide risks are blunt about the consequence: models producing simulated flow times of minutes or hours where reality is weeks or months.
4. **The case notion and abstraction level** — a modelling decision with a combinatorial search space (one reported instance: 90 tables yielding ~10,000 candidate case notions) and **no log-internal ground truth**. Consequences are quantified: flattening a multi-object log to a single case notion produced ~15% false directly-follows edges, ~47% of real ones missing, and some activity pairs 100% wrong **[V]**.

**And one thing logs cannot settle even in principle**: the four discovery quality dimensions are
fitness, precision, generalization and simplicity, and while a log settles fitness, **the
precision-versus-generalization trade-off cannot be settled from the log alone** — generalization
is defined against the unobserved real process, which in real settings is not knowable **[V]**.
That is a judgement call, so it needs a human, and it is the formal version of "how much of what
we didn't see should the model allow?" The same body of work names the **open-world assumption**
problem and rates log quality on a five-star maturity scale on which manually-kept records are
simply unusable **[V]**.

**Human-in-the-loop discovery** is an established line — interactive and domain-knowledge-driven
process discovery, with a 2022 review and recent LLM-guided variants **[V]** — which is the
closest existing neighbour to what the elicitor does, and worth positioning against.

**A gap worth naming**: no study was found quantifying the divergence between an
interview-derived model and a mined model of the _same_ process **[V]**. That is a cheap,
publishable experiment and it is nearly a by-product of the September demo if any use case has
both a willing expert and a log.

**Key sources.** van der Aalst, W.M.P. (2016) _Process Mining: Data Science in Action_, 2nd ed.,
Springer **[V]** (§10.1 for de facto/de jure); IEEE Task Force on Process Mining (2011)
_Process Mining Manifesto_ **[V]** (guiding principles GP1–GP6, challenges C1–C11, five-star
maturity); van der Aalst, "Process mining in the large" tutorial **[V]**; Rozinat, A., Mans,
R.S., Song, M. & van der Aalst, W.M.P. (2009) "Discovering simulation models", _Information
Systems_ 34(3):305–327 **[C]**; Camargo, M., Dumas, M. & González-Rojas, O., SIMOD **[V]**;
Gawin, B. & Marcinkowski, B. (2015) **[V]** (source-per-parameter table); Esser, S. & Fahland, D.
(2021) on multi-dimensional/object-centric event data **[V]**; Outmazgin, N. & Soffer, P. on
workaround detectability **[V]**; Dixit, P.M. et al. on interactive process discovery **[V]**;
Schuster, D. et al. (2022) review **[V]**.

**Pack-content candidates.**

- **Source-router card**: before asking, decide whether a parameter is log-derivable (control flow, branching probabilities, service times, resource pools) or interview-only (calendars, shifts, availability, costs, priorities, seasonality, rationale, rare events). Spend expert time only on the second list — and validate the first list's assumptions with the expert rather than re-eliciting them.
- **De facto / de jure confrontation card**: where both a document and a log exist, present the divergence to the expert and ask for the _reason_, not the correct version. The reason is the unwritten constraint.
- **Off-system behaviour probe**: "what part of this happens by phone, on paper, or in someone's head, and would never show up in the system?"
- **Case-notion card**: make the object types and granularity an explicit, justified decision in the record — never an implicit default.
- **Generalization question**: "what could happen that has never happened?" — the human-supplied half of the precision/generalization trade-off.

---

## Where the literature is thin, or contradicts our framing

1. **No literature gives "the first five questions" for eliciting a Petri net.** The nearest thing is Robinson's ordering, which _mildly contradicts_ the prep document's framing: C2 assumes questions map to model elements, whereas the literature says the first several questions map to _purpose_, and model elements are derived.

2. **No empirical frequency data for modelling motifs, and the frequency data that exists is contaminated by tooling** (§3.1). The catalogue cannot be ordered by expected yield from the literature; order it from your own use-case pool, with van der Aalst's 80/20 as the prior.

3. **The motif catalogue's altitude is genuinely unoccupied** (§3.1). Between formal primitives and whole-application templates there is no institutionalised operational-motif catalogue. Good news — it is a real contribution; bad news — there is no list to copy, and the one real Petri-net pattern catalogue had no successor.

4. **Börger's reduction argument stands unanswered** and cuts against long catalogues: build a small quiver of parameterised schemes with variant selectors. The published rebuttal does not engage it.

5. **Names are stable, semantics are not.** PAND inclusivity, spare-claiming timing, and workflow-pattern naming drift are all live. Never record a motif by name alone.

6. **"SDCPN" is not a literature term, and the feature ladder does not map to any published hierarchy** — it conflates expressiveness with engineering convenience with use-case properties. Colour is the clearest case: a folding with no expressive gain.

7. **The strongest real-world asset-management evidence backs per-object-type templates, not orthogonal functional modules** (§3.2). This may contradict our intended decomposition and should be resolved deliberately.

8. **Penalty-weight elicitation exists, but in a different field.** MCDA has mature methods; nothing documents their use in a Petri-net or DES elicitation context. An integration opportunity, and a warning about importing preference-structure assumptions.

9. **Saturation-style stopping rules do not transfer.** They concern theme discovery across informants. The transferable stopping-rule literature is the cognitive one (§4.2), and its message is that the natural rule for an LLM — stop when the representation stabilises — is one of the two associated with premature stopping.

10. **Nothing addresses §4.4 directly.** The spreadsheet-agreement answer is assembled from a verification technique plus queueing theory: reasoned, not cited.

11. **Structured expert judgment has no methodological consensus**, and its own literature says empirical comparisons are in contradiction. We are choosing a defensible position.

12. **Petri-net digital-twin synchronisation is thin**, and no canonical named Petri-net template exists for the standard delay-time inspection model.

13. **No study quantifies interview-derived vs. mined models of the same process** (§9) — a cheap experiment, nearly free from the September work.

14. **The evaluation problem for AI interviewers is genuinely unsolved**, stated explicitly in that literature.

15. **Residual verification gaps.** Still **[R]**: hierarchical-CPN specifics; the "flaw of averages" attribution; Cooke (1991) and O'Hagan et al. (2006) book content; Kelly (1955); contextual inquiry's principles; the Browne & Pitts (2004) journal treatment of stopping rules; Börger's eight scheme _names_ (the ER 2007 paper is paywalled and worth buying if the quiver design depends on them); IBIS and DRL specifics. Also unresolved: a minor discrepancy between two Cooke reviews' counts (31/33 vs 32/33) to reconcile before citing both, and Gause & Weinberg's context-free questions were **not** verified — the Zaremba & Liaskos typology is better sourced and is used instead throughout.

---

## Prioritized shortlist: the five highest-leverage findings for a September demo

**1. Objectives-first ordering, and question-relative completeness — with a quotable warrant.**
Reorder the interview so the model's questions, responses, experimental factors and accuracy bar
precede structural elicitation, and treat the questions table as simultaneously the scope,
completion and validation criterion. Sargent states it normatively and verbatim; Robinson supplies
the ordering and the Include/Exclude/Justification tables to record it in. Cheapest change with
the widest effect — it answers four inventory questions at once and needs no new machinery.
_(§1.2, §4.1, §4.2)_

**2. Import the probe catalogues wholesale — all the wordings are now in hand.**
The CDM deepening and what-if sweeps, the eight ACTA knowledge-audit probes, and the
35-type question typology are reproduced verbatim in §2.2 and §5.1 and can be translated to
operational wording immediately. The premortem prompt adds the forward-looking case. Three
individual items are worth calling out because they map straight onto net constructs: CDM's
_basis of choice_ ("what rule was being followed?") elicits conflict policy; CDM's
_situation assessment_ handover framing elicits what the marking must record; and the
_clearinghouse_ and _consistency_ probes give the elicitor a closing ritual and a
whole-transcript cross-check. Plus one universal follow-up rule — "how would you know that? how
would this be hard for someone less experienced?" — that upgrades every other card. Highest
content-per-unit-effort in the review and now the lowest-risk to ship. _(§2.2, §5.1, §5.2)_

**3. Fix quantitative elicitation — and there is now a number to justify it.**
Elicit distributions by the IDEA four-step (interval, then best guess, then a confidence
percentage) or by median-then-quartiles bisection; never ask for a mean and standard deviation;
never fit a triangular to a min/mode/max triple. The published comparison is stark: the
three-point-triangular habit **overstated a measured mean by ~69%**, where a distribution reading
the same elicited middle value as a mean landed within 1%. This is where a naive LLM interviewer
fails worst and most invisibly — it will accept "about 40 minutes" and quietly make it a point
estimate — and it is the input side of the §4.4 failure. _(§1.4)_

**4. Ground the formalism-earning tests, and retire the prestige ladder.**
Two results do the work: VUT gives a quantitative test for whether stochasticity is earned
(utilisation and coefficients of variation), and the folding result establishes that colour buys
compactness rather than expressiveness. Together they let the team defend "this system does not
need the full stack" on technical grounds — addressing the PRO-99-versus-use-case-pool tension
directly — and yield a principled showcase criterion: per-entity continuous state gating a
threshold-crossing question. Carry the §3.2 caution that such a system will likely want
per-object-type templates. _(§6)_

**5. Make the formalism and the data generate the cross-examination.**
Soundness checking (option to complete, proper completion, no dead transitions), the
shared-input-place contention obligation, the response-versus-factor category check, and the
motif-obligation sweep are all mechanical on an elicited structure, and each violation converts
into a specific question. Pair this with the §9 source-router so expert time goes only to what
logs cannot supply — calendars, priorities, rationale, rare events, and the
precision/generalization judgement. Together these are what most differentiate the elicitor from
the incumbent Petrinaut assistant, because they produce cross-examination pressure _without_
requiring the interviewing expertise the team has established it does not have. And there is a
sharper way to make that positioning argument now: **asking the expert for a net is a named,
catalogued elicitation mistake** — "asking customer for solutions" — not merely a design
preference. _(§5.1, §9)_

**Bonus, for PRO-104.** Two literature-grounded metric candidates fell out of this review:
**informative propositions per task-minute** (with published reference rates: ~1 for structured
interviews, 2–3 for contrived tasks, and a "~1/minute means something is wrong" rule of thumb),
and **first-response versus post-probe content delta** from the AI-interviewing work. Both are
measurable without a ground-truth model or a repeatable human respondent, which is exactly the
constraint that made the evaluation problem look intractable. _(§2.4, §8)_
