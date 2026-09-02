# Prospective candidate runbook elicitation — replication 1

- Protocol: `prospective-runbook-v3`
- Output namespace: `vestera-architecture-candidate-v3`
- Run: `prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006`
- Source commit: `794fe2fbf1eaeba3fc816c6e3d1755d7b444125d`
- Interviewer: `claude-sonnet-4-5`
- Simulated expert: `claude-sonnet-4-5`
- Interview turns: 8 (hard stop 8)
- Stop reason before final IR request: `hard-stop`
- Recoverable IR: yes
- Member status: `completed`
- Final user message is an evaluation stop instruction, not expert evidence.

## User
I'm the master scheduler at a coatings plant. My boss wants a simulation model of how we
schedule production, so we can test scheduling decisions before making them. We have tooling
that runs Petri-net-style process models, so the end product should be a model I can hand to
that — but I can't tell you much about the format, I'm not the modelling person.

Please interview me about how our operation works, and then produce the model.

## Assistant
I'll help you develop a simulation model of your scheduling operation. Let me start by loading the modeling framework, then we'll talk through how your operation works.Good. Now let's talk about how your operation actually works.

Before we dive into the details, help me understand what you're trying to accomplish with this simulation. **What specific scheduling decisions do you need to test, and what would you be looking for to tell whether a decision is working well or poorly?**
- tool activate_skill (toolu_01N61ni3XJpbKBS1pZXxvpgD): "Run the skill named \"sdcpn-modelling\".\n\n<skill_instructions>\n# Capability-aware lifecycle\n\nUse one conceptual lifecycle: orient, elicit or revise, maintain the workpiece, construct when supported, check, and deliver. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.\n\n## Select the runtime branch\n\n### Interactive elicitation, review, or revision\n\nInterview in the person's operational vocabulary. Before substantive\nelicitation or workpiece revision, read\n`references/universal-elicitation.md` and `references/profile.md`.\n\nFor review, first inspect the supplied workpiece or model. If it already answers\nthe question, answer without reading the elicitation references or interviewing.\nIf the review exposes a gap that requires human knowledge, read both elicitation\nreferences and then ask exactly one focused question that resolves the smallest\nconsequential gap.\n\nRead `templates/workpiece.md` only when first creating or materially revising\nthe workpiece. Do not load the template merely to inspect an existing artifact,\nanswer a resolvable review question, or frame the first elicitation question.\nConstruct only when the mounted capabilities actually permit construction in\nthis conversation.\n\n### Construct-only execution\n\nUse the supplied workpiece as the complete modelling input. Do not interview.\nRead `references/pn-construction.md` and `references/checks.md`, then use the\nmounted construction tools. If a consequential workpiece gap prevents faithful\nconstruction, report the gap and the smallest question a later interactive\nelicitation must answer; do not ask it or invent an answer in this conversation.\n\n## Procedure\n\n### Orient\n\nEstablish enough purpose and context to select one focused next action: the intended question or decision, audience, boundary, horizon, accuracy need, and available time. Orientation need not settle every concern before elicitation begins.\n\n### Elicit or revise\n\nFor a new account, follow one concrete case and re-evaluate the active gap after each useful answer. For an existing account, first locate the disputed or changed material and its consequence for the objective. Use the two elicitation references for detailed operations and coverage; do not turn their register order into question order.\n\n### Maintain the workpiece\n\nTreat the workpiece as the recoverable account construction will consume. Update it after a useful stretch rather than waiting until the end. Preserve unrelated material unless new evidence affects it.\n\nWhenever the workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit it again before construction and before workpiece-only delivery. A delta or prose promise is not a recoverable workpiece.\n\n### Construct\n\nConstruct only from the current workpiece. Read\n`references/pn-construction.md` and `references/checks.md` before beginning.\nUse mounted Petrinaut tools for every net change and inspect the resulting\ndefinition rather than emitting free-form net JSON. If the required tools are\nabsent, limit the result to the workpiece and construction-ready notes.\n\nConstruction may infer a representation from recorded operational meaning; it may not invent operational facts. Record construction inferences, approximations, defaults, and target losses in the workpiece.\n\n### Check and deliver\n\nApply `references/checks.md` whenever construction is prepared or attempted.\nDeliver the current workpiece in every branch. Deliver a net only when the\nmounted tool path has produced and checked one. State what the result can\nsupport, what remains open, what was assumed or simplified, and what the target\nor current tools could not represent.\n\nAn explicit stop opens no new topic. In an interactive conversation, emit the best current workpiece and any already-checked net with limitations visible. In construct-only execution, report a blocking gap rather than opening an interview.\n\n## Resource discipline\n\nRead resources directly from this skill's advertised resource list. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.\n</skill_instructions>\n\nSupporting skill resources are available but are not loaded into context unless needed:\n<skill_resources>\n- references/checks.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3A4236dc3c0e6a2446/references/checks.md\n- references/pn-construction.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3A4236dc3c0e6a2446/references/pn-construction.md\n- references/profile.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3A4236dc3c0e6a2446/references/profile.md\n- references/universal-elicitation.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3A4236dc3c0e6a2446/references/universal-elicitation.md\n- templates/workpiece.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3A4236dc3c0e6a2446/templates/workpiece.md\n</skill_resources>"
- tool read_skill_resource (toolu_01LTMkcUNraBdu4AnqXYCNkp): "# Universal Elicitation Reference\n\nThis reference contains detailed elicitation and revision guidance that applies across domains and target formalisms. A plugin may add context or narrower guidance under the same registers. Where it is silent, this reference still applies.\n\nThe registers are addresses, not a procedure. **Directives** bind. **Recognition** changes what you notice or suspect. **Operations** are selectable moves. **Coverage** names information a useful account may need. **Verification** checks and repairs the interview and workpiece.\n\n## Directives\n\n### Work from purpose\n\nEstablish what the result must help the person decide, answer, compare, explain, or change. Let that purpose determine scope, depth, and which uncertainties deserve questions. Do not pursue a thread merely because it is interesting or because a target representation has a place for it.\n\n### Accumulate posture conversationally\n\nLearn who the result is for, what it must and must not support, the relevant boundary and horizon, the required confidence, the person's available time, and their tolerance for proposed assumptions. Accumulate this over the first exchanges rather than presenting an intake form.\n\n### Follow the person's account\n\nUse the person's vocabulary. Prefer concrete remembered cases to an abstract tour, and follow the active thread rather than traversing workpiece headings or target concepts. A destination representation may shape your attention; it must not replace the person's account.\n\n### Protect interaction bandwidth\n\nDo not open with a battery of independent questions. Ask one coherent, answerable opening question. Later, group questions only when they share one frame and can naturally be answered together; deepen one thread at a time.\n\n### Preserve authorship and uncertainty\n\nKeep the person's evidence distinct from your normalization, inference, assumption, proposal, transformation, or default. Never introduce a value, rule, distinction, or level of precision as if the person supplied it when they did not.\n\nPreserve unknown, not-yet-asked, declined, deferred, ambiguous, conflicting, corrected, context-dependent, and deliberately omitted material when those distinctions matter. Do not turn one state into another for the convenience of a complete-looking result.\n\n### Treat divergence as information\n\nDo not average, silently choose, or treat recency as universal truth when accounts differ. Establish whether a later statement corrects an earlier one, whether the sources conflict, or whether both apply under different people, times, conditions, or purposes.\n\n### Maintain a recoverable workpiece\n\nRecord useful understanding as the conversation develops. Keep one cold-readable current account rather than relying on the transcript or repeated summaries. Preserve the evidence and unresolved material needed to understand how that account was reached.\n\n### Stop honestly\n\nCompletion is purpose-relative and evidence-bearing. Fluency, document fullness, recent stability, fatigue, turn count, or elapsed time do not establish it. When the person stops, open no new topic; return the best useful partial result and make consequential gaps visible.\n\n## Recognition\n\nRecognition entries are hypotheses about what may deserve attention. They neither establish a fact nor dictate the next question.\n\n### Vague or compressed language\n\nWords such as “usually,” “roughly,” “mostly,” “sometimes,” and “about” may hide a distribution, an exception, a contextual distinction, or harmless imprecision. Determine whether the unresolved variation could affect the stated purpose before deepening it.\n\n### Normative language\n\n“We would,” “the rule is,” “you are supposed to,” and documents describing procedure establish a prescribed account, not necessarily observed practice. Notice the possible divergence without assuming that it exists.\n\n### Tension within or between accounts\n\nAn answer that does not fit an earlier answer may indicate a correction, ambiguity, unnamed condition, source disagreement, or error. Preserve both until their relationship is understood.\n\n### Unexplained terms and artifacts\n\nLocal terms, forms, diagrams, policies, spreadsheets, and other artifacts may carry tacit distinctions. Treat an artifact as a sourced proposition and ask how its meaning relates to actual use rather than accepting your own reading.\n\n### Burden, impatience, or limited availability\n\nThese are evidence about the interaction, not evidence that the workpiece is complete. Shift to the smallest consequential gap, offer an explicit choice to continue or stop, and preserve the remaining work honestly.\n\n### Diminishing yield\n\nSeveral turns that produce no useful distinction suggest that the current operation is exhausted or poorly chosen. Change the move—a concrete case, contrast, basis question, sweep, or deferral—rather than repeating a broader version of the same question.\n\n### Assent without independent wording\n\nQuick agreement to your restatement may indicate acceptance, conversational accommodation, or insufficient attention. Use it as permission to retain settled wording, not as evidence that the person independently supplied all of its content.\n\n### Silence and absence\n\nMaterial may be absent because it is irrelevant, unknown, unasked, declined, forgotten, or deliberately deferred. Absence alone does not identify which state holds.\n\n## Operations\n\nChoose an operation for the active gap, apply it to one thread, inspect what changed, then choose again. Operations are not a schedule.\n\n### Select the smallest consequential absence\n\nCompare the current account with what its stated purpose depends on. Choose the smallest missing or ambiguous distinction whose answer could materially change the result. Ask for that rather than everything adjacent to it.\n\n### Slice a concrete case\n\nWalk one remembered instance from its meaningful beginning to end. Let the case expose sequence, vocabulary, distinctions, decisions, resources, exceptions, and evidence. Escalate to a hypothetical only from the known case when possible, and identify parameters you introduced.\n\n### Sweep one property\n\nAfter a slice exposes structure, examine one property across one relevant class of things. A sweep finds variation and absences that one case cannot. It is not permission to enumerate every workpiece heading or target category.\n\n### Ask for the last occurrence\n\nWhen a general claim is not yet usable, ask when it last happened and what the person noticed or did. A concrete occasion often exposes sequence, cues, exceptions, and practiced judgment more reliably than a bare request for reasons.\n\n### Ask for the basis\n\nAsk how the person would know, what they actually look at, or what would be difficult for someone less experienced. Use the answer to expose evidence and tacit discrimination, not to demand a formal justification for every statement.\n\n### Ground a term or artifact\n\nAsk for the person's meaning of a local term. For a document or other artifact, ask when it matches practice, when it does not, and what observation could distinguish the accounts.\n\n### Clarify until observable\n\nClarify a consequential statement until a suitably informed observer could report it without asking what its terms meant. Stop at the granularity the person or available evidence can actually observe.\n\n### Use contrastive cases\n\nWhen ambiguity has a small number of consequential interpretations, offer concrete alternatives that differ on one relevant axis and ask which is closer or what distinction is missing. Mark the alternatives as yours; retain only what the person accepts or supplies.\n\n### Investigate quantities relative to purpose\n\nBefore deepening a quantity, determine whether the typical case, variation, or tail matters. Ask for the narrowest useful form the person can support. A memorable incident establishes mechanism and consequence, not a rate; ask about opportunities and time period before inferring frequency.\n\n### Turn an unknown into a decision threshold\n\nWhen an exact value is unavailable, ask what boundary would change a decision or become observably unacceptable. Keep the exact value unknown unless the threshold genuinely answers the purpose.\n\n### State a contradiction without resolving it\n\nPut the accounts side by side and ask how the person understands the difference. Ask whether one corrects the other, whether both are contextually true, or what evidence would distinguish them.\n\n### Restate for correction\n\nOffer a concise account in your own words and ask the person to correct or settle it. Preserve the distinction between their earlier evidence, your normalization, and the wording they accept.\n\n### Propose structure for correction\n\nWhen low-risk structure is faster to correct than to elicit from nothing, offer it explicitly as your proposal. Ask for correction and record its authorship until the person settles it.\n\n### Deposit and defer\n\nWhen an answer is unavailable or not worth pursuing now, record what is missing, why it matters, where an answer could come from, and what would re-enter the topic. A promise to return later is not a deposit.\n\n### Press without trapping\n\nWhen time or patience is limited, name the smallest load-bearing gap and offer a choice between spending the remaining attention there or stopping with it visible. Pressure licenses a clear choice, never pretending the gap is closed.\n\n### Explore a rare or severe outcome\n\nUse a premortem or concrete failure story when ordinary recall does not expose a rare but consequential possibility. Seek mechanism, sequence, and evidence rather than speculative sentiment.\n\n### Seek a witness or counterexample\n\nAsk for a concrete case that would demonstrate an interpretation and a boundary case that would break it. Use examples to discriminate meanings and checks, not to promote one anecdote into a universal rule.\n\n### Trade concrete outcomes\n\nWhen a person cannot state an abstract priority or weight, offer two concrete outcomes that trade one concern against another. Vary the pair until the preference boundary becomes useful, without inventing a numerical exchange rate.\n\n### Close with one correction opportunity\n\nBefore a voluntary close, summarize the consequential current account, assumptions, conflicts, and gaps once. Give the person one focused chance to correct it. A clearinghouse question may expose an omission; it does not prove coverage.\n\n## Coverage\n\nCoverage is a universal information contract for a recoverable account. It does not prescribe headings, semantic types, or question order. A plugin adds the subject and target distinctions needed for a particular model.\n\nA workpiece may need to preserve:\n\n- the purpose, audience, decision or question, boundary, horizon, and accuracy expectation;\n- a cold-readable account in the person's vocabulary, including consequential local terms;\n- requirements, constraints, invariants, or safety conditions the purpose depends on;\n- decisions, alternatives, and reasons distinctions among them matter;\n- observations, witnesses, examples, and counterexamples that discriminate interpretations or outcomes;\n- exact evidence where later interpretation depends on the person's wording;\n- normalized accounts and agent inferences without laundering their authorship;\n- assumptions with why they were introduced and how they could be checked;\n- unknown, not-yet-asked, declined, and deferred material without conflation;\n- ambiguity, unresolved conflict, correction history, and contextual coexistence;\n- deliberate omissions, simplifications, defaults, and target-representation losses; and\n- open questions with the consequence of leaving them open and the condition for returning.\n\nCoverage depth follows the purpose. A category being available does not make it mandatory; a consequential dependency being unsupported does make the gap visible.\n\n## Verification\n\nVerification applies near the action it checks. Repair locally where possible; return to the smallest useful operation when the workpiece lacks evidence.\n\n### Before asking\n\n- The question serves the stated purpose or resolves an active uncertainty.\n- It follows the person's thread rather than the order of a schema or template.\n- It asks one focused thing, or a small set that genuinely shares one frame.\n- A proposed answer, category, number, or distinction is identified as yours.\n\n### Before recording\n\n- Every load-bearing claim is supported by the person's account or visibly marked as agent inference, assumption, transformation, or default.\n- A hedge, remembered incident, or ambiguous term has not silently become a precise value, rate, category, or rule.\n- Assent to your wording has not been presented as independently originated evidence.\n- A correction, conflict, and contextual variation have not been flattened into one undifferentiated account.\n\n### Before closing\n\n- The result's purpose and consequential account have been offered for correction.\n- Remaining gaps are stated in terms of what they prevent the result from supporting.\n- The person has not been kept in an irrelevant thread merely to fill a category.\n- A stop produces a useful partial result rather than a false claim of completion.\n\n### Failure signals and repairs\n\n- **Fluent and empty:** the conversation reads well but the workpiece has not gained a consequential distinction. Change operation or state the blocker.\n- **Schema-shaped questioning:** questions follow headings or fields. Return to a concrete case or active uncertainty.\n- **Silent hardening:** precision increased without evidence. Restore the hedge, ask, or mark an assumption.\n- **Invented content:** a load-bearing claim has no person-supplied basis and no agent-authorship mark. Remove or relabel it.\n- **Never-asked blindness:** a consequential dependency remains unsupported because no question reached it. Use Coverage as a gap check, not a questionnaire.\n- **Premature accommodation:** burden ends questioning while gaps disappear from the deliverable. Honour the stop and restore the gaps.\n- **Deferral without deposit:** future work is promised but not recoverably described. Record the missing information, consequence, source, and return condition.\n- **Restatement as progress:** repeated whole-workpiece summaries replace investigation. Return to the smallest unresolved distinction; reserve one full read-back for close.\n"
- tool read_skill_resource (toolu_01GLhHLrYu5LK8sArEbjPgae): "# Operational-Process and SDCPN Elicitation\n\nThis reference adds operational-process and SDCPN-specific guidance to `universal-elicitation.md`. Apply both under the same registers. The additions below do not restate or replace universal elicitation guidance.\n\nThe registers are not a questionnaire or phase sequence. **Recognition** suggests what may be present. **Operations** select ways to investigate an active gap. **Coverage** says what the operational account may need to explain. **Verification** checks the current interview and workpiece. Petri-net construction mechanics remain in `pn-construction.md` and are not interview vocabulary.\n\n## Directives\n\n### Build the operational account the purpose needs\n\nFor the person's simulation question, comparison, or decision, establish what should improve or be avoided, what may be varied, how outcomes are judged, and what observation would make the model credible enough for its intended use.\n\nEvery objective needs a traceable dependency on process material. Do not collect operational detail merely because the target could represent it, and do not record the person's prediction of an objective's answer as process structure.\n\n### Keep target structure backstage\n\nAsk about work, things, people, resources, conditions, decisions, time, failures, and outcomes in the person's vocabulary. Places, transitions, arcs, colours, tokens, firing, target schemas, and workpiece headings may guide attention but must not become the language or order of ordinary questions.\n\n### Preserve operational context\n\nA value without its applicable item, activity, direction, mode, operating regime, calendar, load, location, resource, or other condition may simulate as a falsehood. Preserve context when the operation treats cases differently. Keep quantities at the granularity the operation or available source can observe, and do not average distinct regimes merely to obtain one parameter.\n\n### Treat operational patterns as hypotheses\n\nRecurring operational shapes expose conditional information needs; they do not generate facts or model elements. Ask whether a shape is present and let the person's account supply its structure and vocabulary.\n\n## Recognition\n\nRecognition entries identify possibilities to test, not facts to record automatically or reasons to abandon the active conversational thread.\n\n### Language and account signals\n\n- **“It depends”** may indicate a branch, practiced decision rule, contextual quantity, or distinction among kinds of work or resource.\n- **“Sometimes it breaks,” “we have to wait,” or “it arrives unexpectedly”** may indicate a disruption, blocked prerequisite, unavailable resource, calendar, or uncontrolled boundary input.\n- **“Always” or “never”** may indicate a constraint, policy, enforcement mechanism, or unexamined exception.\n- **Warming up, wearing down, charging, filling, cooling, or draining** may indicate continuous change, a consequential threshold, or a directional mode change.\n- **Duration that crosses a shift, opening window, or calendar boundary** may depend on availability rather than work time alone.\n- **A person, machine, team, vehicle, bay, tool, dataset, or location named in passing** may participate as performer, contended resource, prerequisite, information source, transport concern, boundary, or merely context.\n- **Approval, instruction, receipt, schedule, threshold, or event language** may identify what starts or enables work rather than an ordinary process activity.\n\n### Operational situation patterns\n\n#### Timed work\n\nAn activity occupies time or timing affects the objective. Possible distinctions include start and finish, what remains unavailable while it runs, typical versus tail duration, and dependence on load, kind, calendar, location, or resource availability.\n\n#### Conditional or probabilistic outcome\n\nAn activity is not guaranteed to succeed or different next states may follow. Possible distinctions include what decides the outcome, what each path produces, whether an observed rate exists, which contexts alter it, and what recovery follows.\n\n#### Contended resource\n\nSeveral activities or cases want the same person, machine, bay, vehicle, tool, space, or capability. Possible distinctions include count, indivisibility, joint staffing, eligibility, reservation and release, practiced priority, tie-breaking, overrides, and changed state on return.\n\n#### Consumed, reserved, or read input\n\nAn activity may consume or transform an input, reserve it so others cannot use it until release, or read it without making it unavailable. The same named thing may play different roles in different activities.\n\n#### Gate, release, trigger, or prerequisite\n\nWork becomes enabled by an observable event or condition. Possible distinctions include what is observed, who or what changes it, where it is visible, whether it is external, and what can override it.\n\n#### Continuous quantity and threshold\n\nA level, temperature, charge, wear state, count, or other quantity changes while no discrete activity occurs. Possible distinctions include direction and rate, noise or spread, consequential thresholds, triggered effects, and reset behavior.\n\n#### Mode change\n\nSetup, changeover, restart, warm-up, handover, reconfiguration, or cleaning changes what can happen next. Possible distinctions include direction, time, scrap, material, capacity, and effects beyond the local activity.\n\n#### Batch, lot, load, or grouped movement\n\nWork moves or is processed in groups. Possible distinctions include the grouping unit, minimum or preferred size, count-versus-clock release, whether members stay together, splitting or merging, and the cost of breaking the group.\n\n#### Spatial transfer\n\nA change of location consumes time, capacity, or a transport resource or changes eligibility. Possible distinctions include what moves, origin and destination, duration by direction, transport contention, and whether the transfer is inside the modeled boundary.\n\n#### Event, failure, retry, and recovery\n\nA disruption befalls the operation rather than advancing normal work, or a case repeats part or all of its process. Possible distinctions include occurrence, affected work and resources, duration, retry scope, surviving state, rollback or compensation, retry limit, diversion, and terminal outcome.\n\n#### Policy under pressure\n\nMore than one action is possible or more than one claimant wants the same capability. Possible distinctions include posted and practiced rules, local judgment, tie-breaking, exception authority, and the conditions selecting a different rule.\n\n#### Hidden waiting\n\nA gap between activities may be caused by unavailable input, contention, a calendar, release policy, batching, transport, approval, or recovery. Waiting is evidence to explain through surrounding behavior, not automatically an activity or independently elicited node.\n\n## Operations\n\nUse the universal Operations as the primary interviewing repertoire. These additions bind them to operational-process concerns.\n\n### Choose the case unit before slicing\n\nWhen several things flow, ask which unit makes one concrete case intelligible—an order, item, batch, patient, vehicle, request, or another term the person supplies. Follow it from admission or trigger to termination or handoff.\n\n### Link the slice to the objective\n\nAs the case unfolds, note which activities, decisions, resources, conditions, and outcomes the stated objective depends on. If the objective depends on nothing yet recorded, continue the case rather than collecting detached detail.\n\n### Expose the process spine\n\nAsk what starts the case, what happens next, what each activity needs and changes, how branches are decided, where waiting occurs and why, and what ends the case. A list of activities without order, triggers, or outcomes is not a process spine.\n\n### Sweep operational concerns, not headings\n\nAfter a slice, choose one property that matters to the objective and examine it across the relevant things already discovered. Useful sweeps include duration, input-use mode, availability, contextual variation, practiced policy, failure and recovery, boundary behavior, or evidence quality.\n\n### Distinguish consumed, reserved, and read inputs\n\nFor each load-bearing activity and input, ask whether the input is used up or transformed, made unavailable and later released, or observed while remaining available. If reserved, establish when and in what state it returns.\n\n### Sweep what can befall an activity\n\nAcross the activities exposed by a slice, investigate relevant disruptions: work-item failure, deadline expiry, unavailable resource, external event, and constraint violation. Establish what happens to the work, the case, occupied resources, and recovery.\n\n### Test practiced policy with a borderline case\n\nWhen a stated rule decides what happens next, ask about the last contested or exceptional case to expose tie-breaking, overrides, and the conditions selecting a different practiced rule.\n\n### Close a resource account\n\nFor a contended resource, establish usable instance count or an honest unknown, eligibility, joint requirements, acquisition, unavailability while held, release, changed state on return, and the rule used when demand exceeds availability.\n\n### Close a mode change in both directions\n\nAsk whether A-to-B differs from B-to-A and whether losses propagate beyond the local activity. Preserve time, material, capacity, and sequencing consequences separately when the operation does.\n\n### Turn waiting into a causal question\n\nAsk what the case is waiting for and what observable event makes it able to continue. Record the surrounding prerequisite, resource, policy, calendar, batch, transport, or disruption rather than treating waiting itself as an activity.\n\n### Ask what is conserved\n\nWhen quantities enter and leave a process, ask what total should remain constant, where loss is possible, and which units the operation uses. Treat the answer as a constraint only when the person's account supports it.\n\n### Establish retry scope\n\nAsk whether failure repeats one activity, a subsequence, or the whole case; diverts or scraps the case; and which work, state, and occupied resources survive or reset.\n\n### Establish validation from observable behavior\n\nAsk what observation, replay, historical comparison, or expert judgment would make the model credible for its intended question. Preserve validation evidence separately from the process behavior it tests.\n\n## Coverage\n\nCoverage identifies what the process-model workpiece may need for the stated purpose and downstream SDCPN construction. It is neither question order nor a demand to populate irrelevant categories.\n\n### Purpose, goals, measures, constraints, and thresholds\n\nPreserve what the model must answer or compare, for whom, what should improve or be avoided, what may be varied, what “better” means, and any importance, trade-off, safety condition, tolerated probability, or threshold the person can actually judge. Qualitative goals must not be forced into invented scalar weights.\n\n### Process boundary, triggers, prerequisites, and initial conditions\n\nPreserve what is inside and outside, what enters or leaves, what starts or resumes a case, calendars and availability, approvals or instructions, external events, initial populations, and the reliability of boundary inputs where consequential.\n\n### Participants, locations, flowing things, and resources\n\nPreserve who or what flows, performs, decides, supplies, occupies, or constrains the process; distinctions the operation treats differently; relevant carried state; counts and population shape; qualifications and compatibility; and how locations or transfers affect behavior.\n\n### Activities, inputs, outputs, and resource use\n\nFor each consequential logical activity, preserve its operational name, prerequisites, performer, inputs, whether each input is consumed, reserved, or read, outputs and state changes, duration, success and failure outcomes, and contextual variation. One logical activity may later require several Petri-net elements; do not split it into target nodes during elicitation.\n\n### Flow, branching, joining, failure, retry, and recovery\n\nPreserve activity order, what decides branches and joins, what can interrupt normal flow, conditions for unhappy paths, retry and recovery scope, what happens to work and resources, and terminal outcomes.\n\n### Time, quantities, arrivals, and stochastic behavior\n\nPreserve durations, rates, counts, capacities, probabilities, arrival and availability patterns, relevant typical and tail behavior, contextual dependence, continuous quantities, direction and rate of change, variation, thresholds, and resets at the precision the evidence supports.\n\n### Policies, exceptions, practiced rules, and contextual regimes\n\nPreserve rules applied when more than one thing could happen, contention priorities, tie-breaking, release conditions, overrides, prescribed versus practiced accounts, and the context in which each account holds.\n\n### Validation, evidence sources, and data bindings\n\nPreserve how the person would know the model is credible, what observations or historical data could test it, which variables a real feed might drive, the source or dataset for each binding, who or what could answer missing values, and where evidence remains unavailable.\n\n### Things not independently elicited as target nodes\n\n- A queue, buffer, or waiting state is ordinarily explained by surrounding activities and conditions and may emerge as construction structure.\n- A scenario is assembled from boundary conditions, initial state, parameters, and candidate policies at simulation time.\n- A resource is an operational role combining relevant identity, capacity, availability, acquisition, release, and policy; it has no single universal target shape.\n- A physical location becomes target structure only through a recorded operational effect; it is not automatically a Petri-net place.\n\n## Verification\n\nApply these checks while eliciting and maintaining the workpiece. Construction and delivery checks live in `checks.md`.\n\n### Purpose and process\n\n- At least one simulation question, comparison, or decision is stated in the person's terms.\n- Every objective depends on recorded process material or remains visibly unsupported.\n- A concrete case has an admission or trigger, ordered activities, relevant branch conditions, and an outcome or handoff.\n\n### Operational semantics\n\n- Load-bearing inputs are distinguished as consumed, reserved and later released, or read while remaining available.\n- A contended resource has count or an honest unknown, acquisition, unavailability while held, release, and practiced contention policy where required.\n- Failure records the fate of the work, retry scope, surviving state, occupied resources, recovery, and terminal result where consequential.\n- Hidden waiting has not silently become an activity or unexplained queue.\n- Mode-change and spatial-transfer effects preserve direction and context where they differ.\n\n### Quantities and context\n\n- A duration, rate, probability, count, or threshold retains the item, activity, mode, direction, load, location, calendar, or other condition that selects it.\n- A point value stands only where constancy or a purpose-relative simplification is supported and named.\n- Prescribed and practiced regimes or contextual variants have not been averaged into one false value.\n\n### Failure signals and repairs\n\n- **Unsupported objective:** the model question depends on no recorded process material. Return to a concrete case that bears on it.\n- **Dead process spine:** activities exist but their order, triggers, or outcomes do not. Continue the slice or ask the smallest connecting question.\n- **Resource disappearance:** a reusable capability is acquired but its release or changed return state is missing. Re-enter resource-use Coverage.\n- **Practice laundering:** a document's rule is recorded as practice without an operational case. Use a borderline or last-occurrence operation.\n- **Context collapse:** values differing by item, direction, mode, location, load, or source regime become one unconditional value. Restore the selecting context.\n- **Pattern-generated fact:** a situation pattern supplied structure the person did not establish. Remove or mark the assumption, then ask whether the pattern applies.\n- **Target leakage:** questions are framed as places, transitions, arcs, or workpiece fields. Translate back to operational events, conditions, things, and consequences.\n"

## User
*(settles into a chair, coffee mug in hand)*

The main thing? I need to get the demand book out on time — that's the weekly order list from ERP. Late orders are what gets me in trouble, especially with Meridian. They're our big retail chain customer, and they'll fine us and threaten to delist if we're late. So that's non-negotiable.

But beyond that... *(gestures vaguely)* I'm constantly making these gut calls about whether it's worth holding a line idle to wait for an order in the same product family, versus just washing down and running whatever's next. Like, if I've got Line 2 finishing a white and I know there's another white order coming in a couple hours, do I sit the line or do I wash it down to tint and pay three hours for that changeover? I *think* waiting sometimes makes sense, but I can't prove it, and my boss wants fewer changeover hours eating up capacity.

And when a line goes down at six in the morning — which happens, especially the filler on Line 2 — I'm re-juggling the whole sheet at the huddle, and it's all improvisation. It'd be nice to know ahead of time what the best reshuffle actually is.

*(pauses)*

So I guess what I'm looking for is: are we getting orders out on time, how many changeover hours are we actually burning, and whether there's a smarter way to sequence things that claws back some of that lost time. Does that make sense?

## Assistant
That makes perfect sense. On-time delivery for Meridian and the rest of the book, changeover hours burning capacity, and being able to look ahead when a line goes down. Those are concrete things I can work with.

Let me follow a typical case so I understand how this actually flows. **Walk me through what happened last week, or a recent week you remember — starting from when the demand book shows up. What arrives, what do you do with it, and how does an order actually get from that list onto a line and out the door?**

## User
*(leans back, thinking)*

Okay, so... Monday morning, usually around 8 AM, the demand book drops from ERP. It's a spreadsheet — maybe 40, 50 orders that week, could be 60 if we're busy. Each line is an SKU, how many units, and a due date. Most of it's whites — that's our volume — then some tinted colours, and usually a handful of specialty clears.

I take that list and I build the sheet. That's my Excel allocation — I'm matching orders to lines and figuring out the sequence. I group orders by product family when I can, because switching families is expensive. White to tint is maybe 45 minutes, but tint back to white? Full washdown, three hours, because any pigment carryover ruins a white batch. So I'm trying to keep whites together, tints together.

I also know some products can only run certain places. Meridian whites always go on Line 2 — it's faster, and they actually audited that line years ago, so that's where they want their stuff made. Specialty clears only run on Lines 1 and 3; Line 2 was never piped for those resins.

*(sips coffee)*

Once I've got the sequence roughed out, I'm estimating times. Each product-line combo has a rate in my head — or in the sheet, really. So I take the quantity, divide by the rate, add some fill-up time, and then I'm adding changeover time on top. That gives me a rough idea if it all fits in the week.

Then the week starts running. Every morning at 7:30 there's a floor huddle — me, the line leads, maintenance, QA. We talk about what finished overnight, what's running now, any problems. And I'm adjusting on the fly. A line jams, a batch fails QA hold, materials slip... I'm moving stuff around verbally, and people go execute.

Orders finish, sit in QA hold for a few hours — maybe four, longer for specialty — then they ship. By Friday afternoon we've usually cleared most of it. Sometimes something slips to Monday.

Does that give you the picture?

## Assistant
Good, that's giving me the shape of it. Now let me follow one order all the way through so I understand what actually happens to it, not just the planning.

**Pick one order from last week or the week before — maybe a Meridian white, since those matter most. From the moment it's a line on that Monday spreadsheet to the moment it ships, what has to happen to it, and what does each step need or wait for?**

## User
*(thinks for a moment)*

Alright, let's say... Meridian order for VW-01, our high-volume interior white. 800 units, due Friday. That's on the sheet for Line 2, naturally.

So the order goes into my sequence — let's say I slot it for Tuesday afternoon, after we finish a run of another white that's already on the line. That's good because it's white-to-white, so the changeover is just a quick rinse, maybe 20, 30 minutes. The crew cleans out the residual from the last batch, flushes the system.

Once the line's clean, they start the run. First stage is **mix** — they're blending the base resin with additives in the mix tank. Then it moves to the **mill**, where it gets ground down to the right particle size. From there it goes to **tint and letdown** — for a white that's mostly just thinning it to spec, no pigment. Then finally **fill and pack** — into cans, labeled, palletized.

*(gestures as if tracing the flow)*

There are holding tanks between those stages, so the mill can keep feeding while fill is catching up, or vice versa. Though... *(pauses)* the tank between mill and fill on Line 1 is tiny and it backs things up, but Line 2's is better.

The run takes... I don't know, with Line 2 on whites, maybe half a shift? That's 800 units at Line 2's rate plus the fill-up time and a bit of ramp while the line settles after the changeover. First few units after any changeover are scrap — ramp sc

## Assistant
*(let them finish the thought about scrap)* — go on, you were saying first few units are scrap?

## User
*(nods)*

Yeah, ramp scrap. First few units after any changeover, the line's still settling — residual from the rinse, concentrations stabilizing, that kind of thing. Those units don't meet spec, so they get scrapped or reworked. It's worse after the big washdowns, like tint back to white. After a quick rinse it's not so bad.

*(shrugs)*

Quality tracks scrap as a monthly percentage, so I couldn't tell you exactly how much per changeover type. It's just... part of the cost of switching.

Anyway, once the 800 units come off the line, they go into **QA hold**. The lab pulls samples, runs tests — usually takes about four hours for whites. Specialty sits longer, sometimes a full day. The lab's only two people, and end of week it backs up.

Once QA clears it, it ships. So for that Meridian order — if it runs Tuesday afternoon, finishes Tuesday night, clears QA Wednesday morning — it's out the door Wednesday, well ahead of Friday.

*(takes another sip of coffee)*

That's the clean version, anyway. Reality is messier — the filler on Line 2 jams every week or two, materials occasionally short, QA finds something off and we have to adjust and retest. But that's the basic flow.

## Assistant
Good, that's helpful. You mentioned the filler on Line 2 jams every week or two, and when a line goes down at six in the morning you're reshuffling at the huddle. 

**What actually happened the last time Line 2 went down? What was supposed to be running, what did you do with it, and where did you move things to?**

## User
*(grimaces slightly)*

Oh, that was... two weeks ago? Maybe three. Line 2 was in the middle of a big white run — I think it was VW-03, the contractor-grade flat — and the filler jammed around 6 AM. Bag broke in the hopper, made a mess, whole thing locked up.

At the huddle, maintenance said it'd be at least a couple hours to clear and reset. Turned out to be more like half a shift, but we didn't know that yet.

*(leans forward, gesturing)*

So I had to figure out what to do with the rest of that run. Line 1 was already on a tint — couldn't just stop that mid-batch. Line 3 was free, but... *(pauses)* Line 3 is slower on whites, and honestly I hate moving a half-finished run because you lose the setup, you're re-doing the fill-up, it's inefficient. So I decided to just wait it out on Line 2, let maintenance fix it, finish the run there.

But that pushed everything else back. I had a tint order that was supposed to start on Line 2 that afternoon — moved that to Line 1 the next morning instead, which meant Line 1 had to wash down from tint to... no, wait, it was

## Assistant
— it's fine, you don't need to reconstruct every move from that day. Let me ask it differently:

**When Line 2 goes down mid-run like that, what are your actual options? Can you pause the run and restart it later on the same line, can you move it to another line, do you have to scrap what's in progress? And what decides which option you pick?**

## User
*(nods, relieved to speak generally)*

Okay, yeah — so if a line goes down mid-run, I've basically got three options.

**One:** Wait it out. If maintenance says it's going to be an hour or two, and the run's almost done anyway, I just let the line sit and finish it when it's back up. The product's already in the tanks, you're not losing much except time.

**Two:** Move the rest of the run to another line. That's a pain — you lose the fill-up you already paid, you're re-doing the setup on the new line, and you need that line to be free *and* qualified for the product. But if Line 2's going to be down half a shift or more and I've got capacity elsewhere, sometimes I'll do it.

**Three:** Scrap what's in progress and restart the whole run later. I almost never do that unless something's really wrong — like if QA says the batch is already off-spec, or the line's going to be down for days. Too wasteful.

*(leans back)*

What decides? Mostly how long maintenance thinks it'll take, and whether I've got another line that can take it without screwing up something more urgent. And honestly... *(shrugs)* gut feel. If it's a Meridian order and the due date's tight, I'm more aggressive about moving it. If it's a small distributor order that can slip a few days, I'll wait.

## Assistant
Alright, so you've got three lines with different capabilities. Let me make sure I understand the constraints.

**You mentioned Line 2 is faster for whites and it's the only one qualified for Meridian. What are the actual differences between your three lines — what can run where, and how do their speeds compare?**

## User
*(settles in)*

Okay, so — **Line 1** is the old workhorse. It's slower, but it's qualified for everything. All the whites, all the tints, and all the specialty clears. It's the reliable one, but you pay for that in speed.

**Line 2** is the fast line. It's about twice as fast as Line 1, at least on whites — that's where you really see it. That's why all the Meridian whites go there; the volume needs that speed. But Line 2 was never piped for the specialty resins, so it can't run the clears at all. Whites and tints only.

**Line 3** is the newest. It's quick — somewhere between the two, maybe closer to Line 2's speed. But it's still being qualified product by product. It can run most of the whites and some of the tints, but there are still a couple tint SKUs that haven't been signed off yet. And it does specialties — that's newer, but it's qualified for them.

*(pauses, thinking)*

Oh, and Line 3 only runs day shift unless we get overtime approved. Lines 1 and 2 run two shifts normally.

So if I've got a big white order, I want Line 2. Specialty, it's Line 1 or 3. And if Line 2's jammed and I need to move a white... Line 1 or Line 3, depending on what's free and whether Line 3 is actually qualified for that particular SKU.

Does that cover it?

## Assistant
Yes, that's clear. Now let's dig into the changeover piece, since that's the big trade-off you're making.

**You said white-to-tint is 45 minutes and tint-to-white is a full 3-hour washdown. What about the other combinations — white-to-white, tint-to-tint, and anything involving the specialty clears? And does it matter which line, or are those times pretty much the same across all three?**

## User
[Evaluation stop instruction; not expert evidence] The interview turn budget is exhausted. Emit the full current Markdown runbook IR in one `runbook-ir` fenced block. Do not ask another question, construct the Petri net, or read construction resources. Preserve every unresolved unknown, not-yet-asked item, declined or deferred item, assumption, conflict, correction, contextual coexistence, omission, and loss.

## Assistant
```runbook-ir
# Coatings Plant Production Scheduling Model

## Model Purpose and Objectives

**Primary simulation questions:**
- Are orders getting out on time?
- How many changeover hours are being consumed?
- Is there a smarter sequence that reduces changeover time?
- What is the best reshuffle when Line 2 goes down?

**Intended decision support:**
- Test scheduling decisions before making them in production
- Evaluate trade-off: hold line idle waiting for same product-family order vs. wash down and run next order
- Pre-plan responses to Line 2 filler failures

**Success measures:**
- On-time delivery (especially Meridian customer - risk of fines and delisting if late)
- Changeover hours (boss wants these reduced to recover capacity)
- Ability to recover lost time through better sequencing

**Audience:** Master scheduler and management

## Process Boundary and Triggers

**Boundary:**
- Starts: Monday morning ~8 AM when demand book drops from ERP
- Ends: Orders ship after QA clearance (typically by Friday, sometimes slips to Monday)
- Inside boundary: Scheduling, line allocation, production execution, QA hold, shipping
- Outside boundary: ERP demand generation, materials supply (mentioned as occasionally short, not detailed)

**Trigger:** 
- Weekly demand book arrives Monday ~8 AM
- Spreadsheet with 40-60 orders per week (can reach 60 when busy)
- Each order: SKU, quantity, due date

**Horizon:** One-week planning cycle (Monday-Friday)

## Product Families and Distinctions

**Product families** (operation treats these differently due to changeover costs):
- **Whites** — high volume
- **Tinted colors** — moderate volume
- **Specialty clears** — handful per week

**Operational distinction:** Switching between families is expensive; scheduler groups by family when possible.

## Resources: Production Lines

### Line 1
- **Description:** Old workhorse
- **Speed:** Slower (baseline)
- **Qualification:** Everything — all whites, all tints, all specialty clears
- **Availability:** Two shifts normally
- **Notes:** Reliable; tiny holding tank between mill and fill (backs things up)

### Line 2
- **Description:** Fast line
- **Speed:** About 2x Line 1 speed on whites ("that's where you really see it")
- **Qualification:** Whites and tints only; cannot run specialty clears (never piped for specialty resins)
- **Availability:** Two shifts normally
- **Special constraints:** Meridian whites MUST run on Line 2 (customer audited this line years ago)
- **Reliability issue:** Filler jams every week or two
- **Notes:** Better holding tank between mill and fill than Line 1

### Line 3
- **Description:** Newest line
- **Speed:** Between Line 1 and Line 2, closer to Line 2's speed
- **Qualification:** Being qualified product-by-product; can run most whites, some tints (some tint SKUs not yet signed off), and specialties (qualified more recently)
- **Availability:** Day shift only unless overtime approved
- **Notes:** Still expanding qualification list

**NOT YET ASKED:** Specific list of which SKUs are qualified on Line 3.

## Process Spine: One Order From Demand Book to Ship

**Source case:** Meridian order VW-01 (high-volume interior white), 800 units, due Friday

### 1. Demand book arrival (Monday ~8 AM)
Order appears as line in spreadsheet: SKU, quantity, due date.

### 2. Scheduler builds allocation sheet
- **Activity:** Match orders to lines, sequence them
- **Performer:** Master scheduler
- **Approach:** Group orders by product family when possible (minimize expensive family-switches)
- **Constraints applied:**
  - Meridian whites → Line 2 (mandatory)
  - Specialty clears → Line 1 or Line 3 only
  - Line 3 → only if SKU qualified and capacity available
- **Time estimation:** Quantity ÷ rate + fill-up time + changeover time
- **Check:** Does it all fit in the week?

**NOT YET ASKED:** Specific rates (units/hour) by product-line combination. Scheduler has these "in my head — or in the sheet." Fill-up times by line or product.

### 3. Daily floor huddle (every morning 7:30 AM)
- **Participants:** Scheduler, line leads, maintenance, QA
- **Topics:** What finished overnight, what's running now, any problems
- **Activity:** Scheduler adjusts schedule on the fly (line jams, batch QA holds, materials slip)
- **Execution:** Verbal adjustments, people go execute

### 4. Order waits for sequenced slot
**Example:** VW-01 slotted for Tuesday afternoon, after another white finishes on Line 2.

### 5. Changeover
**Example case (white-to-white on Line 2):** Quick rinse, 20-30 minutes. Crew cleans residual from last batch, flushes system.

**Known changeover times:**
- White → white: 20-30 minutes (quick rinse)
- White → tint: ~45 minutes
- Tint → white: 3 hours (full washdown; pigment carryover ruins white batch)

**NOT YET ASKED:**
- Tint → tint changeover time
- Specialty clear changeover times (to/from whites, tints, other clears)
- Whether changeover times vary by line

**Ramp scrap:** First few units after any changeover don't meet spec (residual from rinse, concentrations stabilizing). Scrapped or reworked. Worse after big washdowns (tint → white). "Not so bad" after quick rinse.

**NOT YET ASKED:** Scrap quantities by changeover type. Quality tracks scrap as monthly percentage; scheduler does not have per-changeover figures.

### 6. Production run
**Stages (in sequence):**
1. **Mix:** Blend base resin with additives in mix tank
2. **Mill:** Grind to particle size
3. **Tint and letdown:** For whites, mostly thinning to spec (no pigment)
4. **Fill and pack:** Into cans, labeled, palletized

**Holding tanks:** Between stages. Mill can keep feeding while fill catches up or vice versa. Line 2 tank (between mill and fill) is better than Line 1's tiny tank.

**NOT YET ASKED:** Holding tank capacities, whether they constrain throughput.

**Run time example:** 800 units on Line 2 for whites took "about half a shift" (quantity at Line 2 rate + fill-up time + ramp settling after changeover).

**NOT YET ASKED:** Hours per shift. Specific production rates.

### 7. QA hold
- **Duration:** ~4 hours for whites; sometimes full day for specialty
- **Activity:** Lab pulls samples, runs tests
- **Resource:** 2-person lab
- **Congestion:** Backs up end of week

**NOT YET ASKED:** QA failure rate, what happens when batch fails QA (mentioned "adjust and retest" as occasional issue).

### 8. Ship
Once QA clears, order ships.

**Example timeline:** Run Tuesday afternoon, finish Tuesday night, clear QA Wednesday morning, ship Wednesday (well ahead of Friday due date).

**Reality qualifier (from scheduler):** "That's the clean version. Reality is messier — filler on Line 2 jams every week or two, materials occasionally short, QA finds something off and we have to adjust and retest."

## Disruptions and Recovery

### Line 2 filler jam (occurs every week or two)

**Last occurrence (2-3 weeks ago):**
- Line 2 mid-run on VW-03 (contractor-grade flat white), filler jammed ~6 AM
- Cause: Bag broke in hopper, made a mess, whole thing locked up
- Maintenance estimate at huddle: "at least a couple hours"
- Actual duration: "more like half a shift"

**Three options when line goes down mid-run:**

1. **Wait it out**
   - When: Maintenance says 1-2 hours and run almost done
   - Product already in tanks, only losing time
   
2. **Move rest of run to another line**
   - Cost: Lose fill-up already paid, redo setup on new line
   - Prerequisites: New line must be free AND qualified for the product
   - When: Line will be down half a shift or more AND capacity available elsewhere
   
3. **Scrap in-progress, restart whole run later**
   - When: Almost never; only if batch already off-spec or line down for days
   - Reason: Too wasteful

**Decision factors (scheduler's account):**
- Maintenance time estimate
- Availability of another qualified line
- Whether moving would "screw up something more urgent"
- "Gut feel"
- If Meridian order with tight due date → more aggressive about moving
- If small distributor order that can slip a few days → wait

**NOT YET ASKED:**
- Frequency distribution of Line 2 jams
- Duration distribution of Line 2 downtime
- Frequency and nature of "materials occasionally short"
- What happens to work already in holding tanks when line stops mid-run

### Other disruptions mentioned but not detailed:
- Batch fails QA hold → adjust and retest (frequency and impact not asked)
- Materials slip (frequency, which materials, advance warning not asked)

## Scheduling Constraints and Policies

### Hard constraints (from scheduler account):
- Meridian whites MUST go on Line 2 (customer requirement, audited that line)
- Specialty clears can ONLY go on Lines 1 or 3 (Line 2 not piped for specialty resins)
- Line 3 SKU-by-SKU qualification (some tints not yet signed off)

### Practiced policies:
- Group orders by product family when possible (minimize changeover cost)
- Prefer white-to-white sequences over white-tint-white (avoid 3-hour washdown)
- When contention exists: Meridian orders get priority (due to penalty/delisting risk)

### Trade-off under uncertainty (scheduler's stated dilemma):
- If Line 2 finishing a white and another white order "coming in a couple hours," hold line idle vs. wash down to tint?
- Scheduler "thinks waiting sometimes makes sense" but cannot prove it
- Boss wants fewer changeover hours

**NOT YET ASKED:**
- How "couple hours" or other wait-time thresholds factor into practiced decision
- Whether orders actually arrive during the week or all appear Monday in demand book
- Whether partial orders or rush orders ever interrupt the plan

## Quantities, Rates, Time

**Known:**
- Demand book: 40-60 orders/week
- Example order: 800 units
- Line 2 speed: ~2x Line 1 on whites
- Line 3 speed: between L1 and L2, closer to L2
- Line 2 on 800-unit white: "about half a shift"
- Changeover times: see Process Spine section 5
- QA hold: ~4 hours whites, up to full day specialty
- Shifts: Lines 1 and 2 run two shifts; Line 3 day shift only (unless overtime)

**NOT YET ASKED:**
- Specific units/hour rates by product-line combination
- Hours per shift
- Fill-up time by line or product
- Ramp scrap quantities
- Distribution of order sizes
- Distribution of due dates within the week
- Product family distribution (what % of weekly demand is whites vs. tints vs. specialty)
- Whether batches have minimum or maximum sizes
- Line 2 jam frequency (every week or two → distribution?)
- Line 2 downtime duration (couple hours to half shift → distribution?)

## Initial Conditions and State

**NOT YET ASKED:**
- What state are lines in at Monday 8 AM when demand book arrives? (Clean? Mid-run? Last product family run?)
- Are there any orders in progress or in QA hold from prior week?
- Initial inventory or work-in-process?

## Validation and Evidence Sources

**Validation intent (from scheduler):**
- Model should show on-time delivery performance
- Model should count changeover hours
- Model should allow testing alternative sequences
- Model should support pre-planning reshuffles when Line 2 fails

**NOT YET ASKED:**
- What observation, replay, or comparison would make the model credible enough to use?
- What historical data is available (past demand books, actual run logs, changeover records, downtime logs)?
- Are actual rates, changeover times, QA hold times recorded somewhere, or only in scheduler's head/sheet?

## Open Questions and Unresolved Material

### Critical for construction but not yet asked:
1. Specific production rates (units/hour) for product-line combinations
2. Changeover times: tint-to-tint, all specialty combinations, whether times vary by line
3. Fill-up times
4. Ramp scrap quantities by changeover type
5. Hours per shift
6. Line 3 SKU qualification details
7. Initial state at start of simulation week
8. Whether orders can be split across lines or must run whole on one line
9. Holding tank capacities and constraints
10. Frequency distributions: Line 2 jams, downtime durations, QA failures, materials shortages
11. Due date distribution in demand book
12. Product family distribution in demand book
13. Validation: what would make model credible, what historical data exists

### Consequential unknowns flagged by scheduler:
- Exact scrap per changeover type (Quality has monthly %, scheduler doesn't have detail)
- Exact rates (scheduler has them "in my head — or in the sheet" but not stated in interview)

### Deliberate simplifications or omissions:
- None explicitly proposed yet

### Assumptions:
- None explicitly introduced yet

### Conflicts or corrections:
- None yet

### Contextual variations noted but not fully explored:
- Line 2 downtime: "couple hours" vs. "more like half a shift" (context: initial estimate vs. actual)
- QA hold: "about 4 hours" for whites, "sometimes full day" for specialty, "backs up end of week" (context-dependent duration)
- Scheduler's practiced policy varies by customer urgency and due date pressure

## Target Representation Notes

**Target formalism:** Petri-net-style process model (specific format not known to scheduler; "I'm not the modelling person")

**Construction not yet attempted.** No Petrinaut tools invoked. No net elements defined.

**When construction begins, will need to infer:**
- How to represent line eligibility constraints
- How to represent scheduler's practiced priority rules under contention
- How to represent three-option recovery logic when Line 2 fails
- How to represent holding tanks and multi-stage production flow
- Whether to model individual units, batches, or orders as tokens
- How to represent ramp scrap and QA hold
- How to represent calendar (shift boundaries, day shift only for Line 3, week boundary)

**Consequential gaps that block faithful construction:**
- Missing rates prevent accurate time modeling
- Missing changeover time matrix prevents accurate sequencing cost
- Missing failure/disruption frequency distributions prevent realistic stochastic behavior
- Missing initial state prevents simulation start
- Missing validation criteria prevent assessing whether constructed model is fit for purpose
```
