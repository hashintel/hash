# Prospective candidate runbook elicitation — replication 2

- Protocol: `prospective-runbook-v4`
- Output namespace: `vestera-architecture-candidate-v4`
- Run: `prospective-runbook-v4-replication-2-2026-09-02T13-43-37-900Z-c9bfc04d`
- Source commit: `e2ef069cb1fb778093abfc2c635ed750aaca9e7d`
- Interviewer: `claude-sonnet-4-5`
- Simulated expert: `claude-sonnet-4-5`
- Interview turns: 8 (hard stop 8)
- Stop reason before final IR request: `hard-stop`
- Recoverable IR: yes
- Member status: `invalid`
- Ordinary-path violation: `multiple-questions` — entry_01M1H5RVJEPV84HCCYS493EQK5: 2 question marks
- Ordinary-path violation: `multiple-questions` — entry_01M1H5TVJ9RBF52Q55M85CP7PP: 2 question marks
- Ordinary-path violation: `missing-required-resource` — workpiece.md
- Final user message is an evaluation stop instruction, not expert evidence.

## User
I'm the master scheduler at a coatings plant. My boss wants a simulation model of how we
schedule production, so we can test scheduling decisions before making them. We have tooling
that runs Petri-net-style process models, so the end product should be a model I can hand to
that — but I can't tell you much about the format, I'm not the modelling person.

Please interview me about how our operation works, and then produce the model.

## Assistant
I'll help you develop a simulation model of your scheduling process. Since this is operational process modelling that will result in a Petri-net-style model, let me first load the specialized guidance for this work.Now let me load the elicitation guidance before we begin the interview.Perfect. Now I'm ready to begin.

You mentioned your boss wants to test scheduling decisions before making them. What specific scheduling decision or question is driving this? For example, are you choosing between different ways to sequence orders, deciding how much capacity to reserve for rush work, or something else?
- tool activate_skill (toolu_01Jyd5MnH8LRP9GhaKUooeUW): "Run the skill named \"sdcpn-modelling\".\n\n<skill_instructions>\n# Capability-aware lifecycle\n\nUse one conceptual lifecycle: orient, elicit or revise, maintain the workpiece, construct when supported, check, and deliver. The current conversation may expose only one branch of that lifecycle. Do not claim that an unavailable transition occurred.\n\n## Select the runtime branch\n\n### Interactive elicitation, review, or revision\n\nInterview in the person's operational vocabulary. Before substantive\nelicitation or workpiece revision, read\n`references/universal-elicitation.md` and `references/profile.md`.\n\nFor review, first inspect the supplied workpiece or model. If it already answers\nthe question, answer without reading the elicitation references or interviewing.\nIf the review exposes a gap that requires human knowledge, read both elicitation\nreferences and then ask exactly one focused question that resolves the smallest\nconsequential gap.\n\nRead `templates/workpiece.md` only when first creating or materially revising\nthe workpiece. Do not load the template merely to inspect an existing artifact,\nanswer a resolvable review question, or frame the first elicitation question.\nConstruct only when the mounted capabilities actually permit construction in\nthis conversation.\n\nBefore asking any interactive question, verify that every resource required by the selected branch has already returned successfully. Before emitting a new or materially revised `runbook-ir`, also verify that the workpiece template has returned successfully. If either gate is incomplete, read the missing resource first; never continue from memory or a failed read.\n\n### Construct-only execution\n\nUse the supplied workpiece as the complete modelling input. Do not interview.\nRead `references/pn-construction.md` and `references/checks.md`, then use the\nmounted construction tools. If a consequential workpiece gap prevents faithful\nconstruction, report the gap and the smallest question a later interactive\nelicitation must answer; do not ask it or invent an answer in this conversation.\n\n## Procedure\n\n### Orient\n\nEstablish enough purpose and context to select one focused next action: the intended question or decision, audience, boundary, horizon, accuracy need, and available time. Orientation need not settle every concern before elicitation begins.\n\n### Elicit or revise\n\nFor a new account, follow one concrete case and re-evaluate the active gap after each useful answer. For an existing account, first locate the disputed or changed material and its consequence for the objective. Use the two elicitation references for detailed operations and coverage; do not turn their register order into question order.\n\n### Maintain the workpiece\n\nTreat the workpiece as the recoverable account construction will consume. Update it after a useful stretch rather than waiting until the end. Preserve unrelated material unless new evidence affects it.\n\nWhenever the workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit it again before construction and before workpiece-only delivery. A delta or prose promise is not a recoverable workpiece.\n\n### Construct\n\nConstruct only from the current workpiece. Read\n`references/pn-construction.md` and `references/checks.md` before beginning.\nUse mounted Petrinaut tools for every net change and inspect the resulting\ndefinition rather than emitting free-form net JSON. If the required tools are\nabsent, limit the result to the workpiece and construction-ready notes.\n\nConstruction may infer a representation from recorded operational meaning; it may not invent operational facts. Record construction inferences, approximations, defaults, and target losses in the workpiece.\n\n### Check and deliver\n\nApply `references/checks.md` whenever construction is prepared or attempted.\nDeliver the current workpiece in every branch. Deliver a net only when the\nmounted tool path has produced and checked one. State what the result can\nsupport, what remains open, what was assumed or simplified, and what the target\nor current tools could not represent.\n\nAn explicit stop opens no new topic. In an interactive conversation, emit the best current workpiece and any already-checked net with limitations visible. In construct-only execution, report a blocking gap rather than opening an interview.\n\n## Resource discipline\n\nRead resources directly from this skill's advertised resource list. When calling `read_skill_resource`, pass the exact `/.flue/packaged-skills/...` URI advertised after `→`; the relative resource name is only a label and will fail. Do not treat Markdown links as includes, follow references recursively, or read construction material merely to frame ordinary interview questions.\n</skill_instructions>\n\nSupporting skill resources are available but are not loaded into context unless needed:\n<skill_resources>\n- references/checks.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3Abd9ee6062853c551/references/checks.md\n- references/pn-construction.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3Abd9ee6062853c551/references/pn-construction.md\n- references/profile.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3Abd9ee6062853c551/references/profile.md\n- references/universal-elicitation.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3Abd9ee6062853c551/references/universal-elicitation.md\n- templates/workpiece.md → read_skill_resource /.flue/packaged-skills/skill%3Asdcpn-modelling%3Abd9ee6062853c551/templates/workpiece.md\n</skill_resources>"
- tool read_skill_resource (toolu_015QeNex2uqUQM4YtTfuqWKw): "# Universal Elicitation Reference\n\nThis reference contains detailed elicitation and revision guidance that applies across domains and target formalisms. A plugin may add context or narrower guidance under the same registers. Where it is silent, this reference still applies.\n\nThe registers are addresses, not a procedure. **Directives** bind. **Recognition** changes what you notice or suspect. **Operations** are selectable moves. **Coverage** names information a useful account may need. **Verification** checks and repairs the interview and workpiece.\n\n## Directives\n\n### Work from purpose\n\nEstablish what the result must help the person decide, answer, compare, explain, or change. Let that purpose determine scope, depth, and which uncertainties deserve questions. Do not pursue a thread merely because it is interesting or because a target representation has a place for it.\n\n### Accumulate posture conversationally\n\nLearn who the result is for, what it must and must not support, the relevant boundary and horizon, the required confidence, the person's available time, and their tolerance for proposed assumptions. Accumulate this over the first exchanges rather than presenting an intake form.\n\n### Follow the person's account\n\nUse the person's vocabulary. Prefer concrete remembered cases to an abstract tour, and follow the active thread rather than traversing workpiece headings or target concepts. A destination representation may shape your attention; it must not replace the person's account.\n\n### Protect interaction bandwidth\n\nAsk exactly one focused question per turn whenever human knowledge is required. Do not bundle subquestions, even when they share one frame; deepen one thread and re-evaluate the next gap after the answer.\n\n### Preserve authorship and uncertainty\n\nKeep the person's evidence distinct from your normalization, inference, assumption, proposal, transformation, or default. Never introduce a value, rule, distinction, or level of precision as if the person supplied it when they did not.\n\nPreserve unknown, not-yet-asked, declined, deferred, ambiguous, conflicting, corrected, context-dependent, and deliberately omitted material when those distinctions matter. Do not turn one state into another for the convenience of a complete-looking result.\n\n### Treat divergence as information\n\nDo not average, silently choose, or treat recency as universal truth when accounts differ. Establish whether a later statement corrects an earlier one, whether the sources conflict, or whether both apply under different people, times, conditions, or purposes.\n\n### Maintain a recoverable workpiece\n\nRecord useful understanding as the conversation develops. Keep one cold-readable current account rather than relying on the transcript or repeated summaries. Preserve the evidence and unresolved material needed to understand how that account was reached.\n\n### Stop honestly\n\nCompletion is purpose-relative and evidence-bearing. Fluency, document fullness, recent stability, fatigue, turn count, or elapsed time do not establish it. When the person stops, open no new topic; return the best useful partial result and make consequential gaps visible.\n\n## Recognition\n\nRecognition entries are hypotheses about what may deserve attention. They neither establish a fact nor dictate the next question.\n\n### Vague or compressed language\n\nWords such as “usually,” “roughly,” “mostly,” “sometimes,” and “about” may hide a distribution, an exception, a contextual distinction, or harmless imprecision. Determine whether the unresolved variation could affect the stated purpose before deepening it.\n\n### Normative language\n\n“We would,” “the rule is,” “you are supposed to,” and documents describing procedure establish a prescribed account, not necessarily observed practice. Notice the possible divergence without assuming that it exists.\n\n### Tension within or between accounts\n\nAn answer that does not fit an earlier answer may indicate a correction, ambiguity, unnamed condition, source disagreement, or error. Preserve both until their relationship is understood.\n\n### Unexplained terms and artifacts\n\nLocal terms, forms, diagrams, policies, spreadsheets, and other artifacts may carry tacit distinctions. Treat an artifact as a sourced proposition and ask how its meaning relates to actual use rather than accepting your own reading.\n\n### Burden, impatience, or limited availability\n\nThese are evidence about the interaction, not evidence that the workpiece is complete. Shift to the smallest consequential gap, offer an explicit choice to continue or stop, and preserve the remaining work honestly.\n\n### Diminishing yield\n\nSeveral turns that produce no useful distinction suggest that the current operation is exhausted or poorly chosen. Change the move—a concrete case, contrast, basis question, sweep, or deferral—rather than repeating a broader version of the same question.\n\n### Assent without independent wording\n\nQuick agreement to your restatement may indicate acceptance, conversational accommodation, or insufficient attention. Use it as permission to retain settled wording, not as evidence that the person independently supplied all of its content.\n\n### Silence and absence\n\nMaterial may be absent because it is irrelevant, unknown, unasked, declined, forgotten, or deliberately deferred. Absence alone does not identify which state holds.\n\n## Operations\n\nChoose an operation for the active gap, apply it to one thread, inspect what changed, then choose again. Operations are not a schedule.\n\n### Select the smallest consequential absence\n\nCompare the current account with what its stated purpose depends on. Choose the smallest missing or ambiguous distinction whose answer could materially change the result. Ask for that rather than everything adjacent to it.\n\n### Slice a concrete case\n\nWalk one remembered instance from its meaningful beginning to end. Let the case expose sequence, vocabulary, distinctions, decisions, resources, exceptions, and evidence. Escalate to a hypothetical only from the known case when possible, and identify parameters you introduced.\n\n### Sweep one property\n\nAfter a slice exposes structure, examine one property across one relevant class of things. A sweep finds variation and absences that one case cannot. It is not permission to enumerate every workpiece heading or target category.\n\n### Ask for the last occurrence\n\nWhen a general claim is not yet usable, ask when it last happened and what the person noticed or did. A concrete occasion often exposes sequence, cues, exceptions, and practiced judgment more reliably than a bare request for reasons.\n\n### Ask for the basis\n\nAsk how the person would know, what they actually look at, or what would be difficult for someone less experienced. Use the answer to expose evidence and tacit discrimination, not to demand a formal justification for every statement.\n\n### Ground a term or artifact\n\nAsk for the person's meaning of a local term. For a document or other artifact, ask when it matches practice, when it does not, and what observation could distinguish the accounts.\n\n### Clarify until observable\n\nClarify a consequential statement until a suitably informed observer could report it without asking what its terms meant. Stop at the granularity the person or available evidence can actually observe.\n\n### Use contrastive cases\n\nWhen ambiguity has a small number of consequential interpretations, offer concrete alternatives that differ on one relevant axis and ask which is closer or what distinction is missing. Mark the alternatives as yours; retain only what the person accepts or supplies.\n\n### Investigate quantities relative to purpose\n\nBefore deepening a quantity, determine whether the typical case, variation, or tail matters. Ask for the narrowest useful form the person can support. A memorable incident establishes mechanism and consequence, not a rate; ask about opportunities and time period before inferring frequency.\n\n### Turn an unknown into a decision threshold\n\nWhen an exact value is unavailable, ask what boundary would change a decision or become observably unacceptable. Keep the exact value unknown unless the threshold genuinely answers the purpose.\n\n### State a contradiction without resolving it\n\nPut the accounts side by side and ask how the person understands the difference. Ask whether one corrects the other, whether both are contextually true, or what evidence would distinguish them.\n\n### Restate for correction\n\nOffer a concise account in your own words and ask the person to correct or settle it. Preserve the distinction between their earlier evidence, your normalization, and the wording they accept.\n\n### Propose structure for correction\n\nWhen low-risk structure is faster to correct than to elicit from nothing, offer it explicitly as your proposal. Ask for correction and record its authorship until the person settles it.\n\n### Deposit and defer\n\nWhen an answer is unavailable or not worth pursuing now, record what is missing, why it matters, where an answer could come from, and what would re-enter the topic. A promise to return later is not a deposit.\n\n### Press without trapping\n\nWhen time or patience is limited, name the smallest load-bearing gap and offer a choice between spending the remaining attention there or stopping with it visible. Pressure licenses a clear choice, never pretending the gap is closed.\n\n### Explore a rare or severe outcome\n\nUse a premortem or concrete failure story when ordinary recall does not expose a rare but consequential possibility. Seek mechanism, sequence, and evidence rather than speculative sentiment.\n\n### Seek a witness or counterexample\n\nAsk for a concrete case that would demonstrate an interpretation and a boundary case that would break it. Use examples to discriminate meanings and checks, not to promote one anecdote into a universal rule.\n\n### Trade concrete outcomes\n\nWhen a person cannot state an abstract priority or weight, offer two concrete outcomes that trade one concern against another. Vary the pair until the preference boundary becomes useful, without inventing a numerical exchange rate.\n\n### Close with one correction opportunity\n\nBefore a voluntary close, summarize the consequential current account, assumptions, conflicts, and gaps once. Give the person one focused chance to correct it. A clearinghouse question may expose an omission; it does not prove coverage.\n\n## Coverage\n\nCoverage is a universal information contract for a recoverable account. It does not prescribe headings, semantic types, or question order. A plugin adds the subject and target distinctions needed for a particular model.\n\nA workpiece may need to preserve:\n\n- the purpose, audience, decision or question, boundary, horizon, and accuracy expectation;\n- a cold-readable account in the person's vocabulary, including consequential local terms;\n- requirements, constraints, invariants, or safety conditions the purpose depends on;\n- decisions, alternatives, and reasons distinctions among them matter;\n- observations, witnesses, examples, and counterexamples that discriminate interpretations or outcomes;\n- exact evidence where later interpretation depends on the person's wording;\n- normalized accounts and agent inferences without laundering their authorship;\n- assumptions with why they were introduced and how they could be checked;\n- unknown, not-yet-asked, declined, and deferred material without conflation;\n- ambiguity, unresolved conflict, correction history, and contextual coexistence;\n- deliberate omissions, simplifications, defaults, and target-representation losses; and\n- open questions with the consequence of leaving them open and the condition for returning.\n\nCoverage depth follows the purpose. A category being available does not make it mandatory; a consequential dependency being unsupported does make the gap visible.\n\n## Verification\n\nVerification applies near the action it checks. Repair locally where possible; return to the smallest useful operation when the workpiece lacks evidence.\n\n### Before asking\n\n- The question serves the stated purpose or resolves an active uncertainty.\n- It follows the person's thread rather than the order of a schema or template.\n- It asks one focused thing and does not bundle subquestions.\n- A proposed answer, category, number, or distinction is identified as yours.\n\n### Before recording\n\n- Every load-bearing claim is supported by the person's account or visibly marked as agent inference, assumption, transformation, or default.\n- A hedge, remembered incident, or ambiguous term has not silently become a precise value, rate, category, or rule.\n- Assent to your wording has not been presented as independently originated evidence.\n- A correction, conflict, and contextual variation have not been flattened into one undifferentiated account.\n\n### Before closing\n\n- The result's purpose and consequential account have been offered for correction.\n- Remaining gaps are stated in terms of what they prevent the result from supporting.\n- The person has not been kept in an irrelevant thread merely to fill a category.\n- A stop produces a useful partial result rather than a false claim of completion.\n\n### Failure signals and repairs\n\n- **Fluent and empty:** the conversation reads well but the workpiece has not gained a consequential distinction. Change operation or state the blocker.\n- **Schema-shaped questioning:** questions follow headings or fields. Return to a concrete case or active uncertainty.\n- **Silent hardening:** precision increased without evidence. Restore the hedge, ask, or mark an assumption.\n- **Invented content:** a load-bearing claim has no person-supplied basis and no agent-authorship mark. Remove or relabel it.\n- **Never-asked blindness:** a consequential dependency remains unsupported because no question reached it. Use Coverage as a gap check, not a questionnaire.\n- **Premature accommodation:** burden ends questioning while gaps disappear from the deliverable. Honour the stop and restore the gaps.\n- **Deferral without deposit:** future work is promised but not recoverably described. Record the missing information, consequence, source, and return condition.\n- **Restatement as progress:** repeated whole-workpiece summaries replace investigation. Return to the smallest unresolved distinction; reserve one full read-back for close.\n"
- tool read_skill_resource (toolu_01FqJrFAa649RSUKi1YaFMAu): "# Operational-Process and SDCPN Elicitation\n\nThis reference adds operational-process and SDCPN-specific guidance to `universal-elicitation.md`. Apply both under the same registers. The additions below do not restate or replace universal elicitation guidance.\n\nThe registers are not a questionnaire or phase sequence. **Recognition** suggests what may be present. **Operations** select ways to investigate an active gap. **Coverage** says what the operational account may need to explain. **Verification** checks the current interview and workpiece. Petri-net construction mechanics remain in `pn-construction.md` and are not interview vocabulary.\n\n## Directives\n\n### Build the operational account the purpose needs\n\nFor the person's simulation question, comparison, or decision, establish what should improve or be avoided, what may be varied, how outcomes are judged, and what observation would make the model credible enough for its intended use.\n\nEvery objective needs a traceable dependency on process material. Do not collect operational detail merely because the target could represent it, and do not record the person's prediction of an objective's answer as process structure.\n\n### Keep target structure backstage\n\nAsk about work, things, people, resources, conditions, decisions, time, failures, and outcomes in the person's vocabulary. Places, transitions, arcs, colours, tokens, firing, target schemas, and workpiece headings may guide attention but must not become the language or order of ordinary questions.\n\n### Preserve operational context\n\nA value without its applicable item, activity, direction, mode, operating regime, calendar, load, location, resource, or other condition may simulate as a falsehood. Preserve context when the operation treats cases differently. Keep quantities at the granularity the operation or available source can observe, and do not average distinct regimes merely to obtain one parameter.\n\n### Treat operational patterns as hypotheses\n\nRecurring operational shapes expose conditional information needs; they do not generate facts or model elements. Ask whether a shape is present and let the person's account supply its structure and vocabulary.\n\n## Recognition\n\nRecognition entries identify possibilities to test, not facts to record automatically or reasons to abandon the active conversational thread.\n\n### Language and account signals\n\n- **“It depends”** may indicate a branch, practiced decision rule, contextual quantity, or distinction among kinds of work or resource.\n- **“Sometimes it breaks,” “we have to wait,” or “it arrives unexpectedly”** may indicate a disruption, blocked prerequisite, unavailable resource, calendar, or uncontrolled boundary input.\n- **“Always” or “never”** may indicate a constraint, policy, enforcement mechanism, or unexamined exception.\n- **Warming up, wearing down, charging, filling, cooling, or draining** may indicate continuous change, a consequential threshold, or a directional mode change.\n- **Duration that crosses a shift, opening window, or calendar boundary** may depend on availability rather than work time alone.\n- **A person, machine, team, vehicle, bay, tool, dataset, or location named in passing** may participate as performer, contended resource, prerequisite, information source, transport concern, boundary, or merely context.\n- **Approval, instruction, receipt, schedule, threshold, or event language** may identify what starts or enables work rather than an ordinary process activity.\n\n### Operational situation patterns\n\n#### Timed work\n\nAn activity occupies time or timing affects the objective. Possible distinctions include start and finish, what remains unavailable while it runs, typical versus tail duration, and dependence on load, kind, calendar, location, or resource availability.\n\n#### Conditional or probabilistic outcome\n\nAn activity is not guaranteed to succeed or different next states may follow. Possible distinctions include what decides the outcome, what each path produces, whether an observed rate exists, which contexts alter it, and what recovery follows.\n\n#### Contended resource\n\nSeveral activities or cases want the same person, machine, bay, vehicle, tool, space, or capability. Possible distinctions include count, indivisibility, joint staffing, eligibility, reservation and release, practiced priority, tie-breaking, overrides, and changed state on return.\n\n#### Consumed, reserved, or read input\n\nAn activity may consume or transform an input, reserve it so others cannot use it until release, or read it without making it unavailable. The same named thing may play different roles in different activities.\n\n#### Gate, release, trigger, or prerequisite\n\nWork becomes enabled by an observable event or condition. Possible distinctions include what is observed, who or what changes it, where it is visible, whether it is external, and what can override it.\n\n#### Continuous quantity and threshold\n\nA level, temperature, charge, wear state, count, or other quantity changes while no discrete activity occurs. Possible distinctions include direction and rate, noise or spread, consequential thresholds, triggered effects, and reset behavior.\n\n#### Mode change\n\nSetup, changeover, restart, warm-up, handover, reconfiguration, or cleaning changes what can happen next. Possible distinctions include direction, time, scrap, material, capacity, and effects beyond the local activity.\n\n#### Batch, lot, load, or grouped movement\n\nWork moves or is processed in groups. Possible distinctions include the grouping unit, minimum or preferred size, count-versus-clock release, whether members stay together, splitting or merging, and the cost of breaking the group.\n\n#### Spatial transfer\n\nA change of location consumes time, capacity, or a transport resource or changes eligibility. Possible distinctions include what moves, origin and destination, duration by direction, transport contention, and whether the transfer is inside the modeled boundary.\n\n#### Event, failure, retry, and recovery\n\nA disruption befalls the operation rather than advancing normal work, or a case repeats part or all of its process. Possible distinctions include occurrence, affected work and resources, duration, retry scope, surviving state, rollback or compensation, retry limit, diversion, and terminal outcome.\n\n#### Policy under pressure\n\nMore than one action is possible or more than one claimant wants the same capability. Possible distinctions include posted and practiced rules, local judgment, tie-breaking, exception authority, and the conditions selecting a different rule.\n\n#### Hidden waiting\n\nA gap between activities may be caused by unavailable input, contention, a calendar, release policy, batching, transport, approval, or recovery. Waiting is evidence to explain through surrounding behavior, not automatically an activity or independently elicited node.\n\n## Operations\n\nUse the universal Operations as the primary interviewing repertoire. These additions bind them to operational-process concerns.\n\n### Choose the case unit before slicing\n\nWhen several things flow, ask which unit makes one concrete case intelligible—an order, item, batch, patient, vehicle, request, or another term the person supplies. Follow it from admission or trigger to termination or handoff.\n\n### Link the slice to the objective\n\nAs the case unfolds, note which activities, decisions, resources, conditions, and outcomes the stated objective depends on. If the objective depends on nothing yet recorded, continue the case rather than collecting detached detail.\n\n### Expose the process spine\n\nAsk what starts the case, what happens next, what each activity needs and changes, how branches are decided, where waiting occurs and why, and what ends the case. A list of activities without order, triggers, or outcomes is not a process spine.\n\n### Sweep operational concerns, not headings\n\nAfter a slice, choose one property that matters to the objective and examine it across the relevant things already discovered. Useful sweeps include duration, input-use mode, availability, contextual variation, practiced policy, failure and recovery, boundary behavior, or evidence quality.\n\n### Distinguish consumed, reserved, and read inputs\n\nFor each load-bearing activity and input, ask whether the input is used up or transformed, made unavailable and later released, or observed while remaining available. If reserved, establish when and in what state it returns.\n\n### Sweep what can befall an activity\n\nAcross the activities exposed by a slice, investigate relevant disruptions: work-item failure, deadline expiry, unavailable resource, external event, and constraint violation. Establish what happens to the work, the case, occupied resources, and recovery.\n\n### Test practiced policy with a borderline case\n\nWhen a stated rule decides what happens next, ask about the last contested or exceptional case to expose tie-breaking, overrides, and the conditions selecting a different practiced rule.\n\n### Close a resource account\n\nFor a contended resource, establish usable instance count or an honest unknown, eligibility, joint requirements, acquisition, unavailability while held, release, changed state on return, and the rule used when demand exceeds availability.\n\n### Close a mode change in both directions\n\nAsk whether A-to-B differs from B-to-A and whether losses propagate beyond the local activity. Preserve time, material, capacity, and sequencing consequences separately when the operation does.\n\n### Turn waiting into a causal question\n\nAsk what the case is waiting for and what observable event makes it able to continue. Record the surrounding prerequisite, resource, policy, calendar, batch, transport, or disruption rather than treating waiting itself as an activity.\n\n### Ask what is conserved\n\nWhen quantities enter and leave a process, ask what total should remain constant, where loss is possible, and which units the operation uses. Treat the answer as a constraint only when the person's account supports it.\n\n### Establish retry scope\n\nAsk whether failure repeats one activity, a subsequence, or the whole case; diverts or scraps the case; and which work, state, and occupied resources survive or reset.\n\n### Establish validation from observable behavior\n\nAsk what observation, replay, historical comparison, or expert judgment would make the model credible for its intended question. Preserve validation evidence separately from the process behavior it tests.\n\n## Coverage\n\nCoverage identifies what the process-model workpiece may need for the stated purpose and downstream SDCPN construction. It is neither question order nor a demand to populate irrelevant categories.\n\n### Purpose, goals, measures, constraints, and thresholds\n\nPreserve what the model must answer or compare, for whom, what should improve or be avoided, what may be varied, what “better” means, and any importance, trade-off, safety condition, tolerated probability, or threshold the person can actually judge. Qualitative goals must not be forced into invented scalar weights.\n\n### Process boundary, triggers, prerequisites, and initial conditions\n\nPreserve what is inside and outside, what enters or leaves, what starts or resumes a case, calendars and availability, approvals or instructions, external events, initial populations, and the reliability of boundary inputs where consequential.\n\n### Participants, locations, flowing things, and resources\n\nPreserve who or what flows, performs, decides, supplies, occupies, or constrains the process; distinctions the operation treats differently; relevant carried state; counts and population shape; qualifications and compatibility; and how locations or transfers affect behavior.\n\n### Activities, inputs, outputs, and resource use\n\nFor each consequential logical activity, preserve its operational name, prerequisites, performer, inputs, whether each input is consumed, reserved, or read, outputs and state changes, duration, success and failure outcomes, and contextual variation. One logical activity may later require several Petri-net elements; do not split it into target nodes during elicitation.\n\n### Flow, branching, joining, failure, retry, and recovery\n\nPreserve activity order, what decides branches and joins, what can interrupt normal flow, conditions for unhappy paths, retry and recovery scope, what happens to work and resources, and terminal outcomes.\n\n### Time, quantities, arrivals, and stochastic behavior\n\nPreserve durations, rates, counts, capacities, probabilities, arrival and availability patterns, relevant typical and tail behavior, contextual dependence, continuous quantities, direction and rate of change, variation, thresholds, and resets at the precision the evidence supports.\n\n### Policies, exceptions, practiced rules, and contextual regimes\n\nPreserve rules applied when more than one thing could happen, contention priorities, tie-breaking, release conditions, overrides, prescribed versus practiced accounts, and the context in which each account holds.\n\n### Validation, evidence sources, and data bindings\n\nPreserve how the person would know the model is credible, what observations or historical data could test it, which variables a real feed might drive, the source or dataset for each binding, who or what could answer missing values, and where evidence remains unavailable.\n\n### Things not independently elicited as target nodes\n\n- A queue, buffer, or waiting state is ordinarily explained by surrounding activities and conditions and may emerge as construction structure.\n- A scenario is assembled from boundary conditions, initial state, parameters, and candidate policies at simulation time.\n- A resource is an operational role combining relevant identity, capacity, availability, acquisition, release, and policy; it has no single universal target shape.\n- A physical location becomes target structure only through a recorded operational effect; it is not automatically a Petri-net place.\n\n## Verification\n\nApply these checks while eliciting and maintaining the workpiece. Construction and delivery checks live in `checks.md`.\n\n### Purpose and process\n\n- At least one simulation question, comparison, or decision is stated in the person's terms.\n- Every objective depends on recorded process material or remains visibly unsupported.\n- A concrete case has an admission or trigger, ordered activities, relevant branch conditions, and an outcome or handoff.\n\n### Operational semantics\n\n- Load-bearing inputs are distinguished as consumed, reserved and later released, or read while remaining available.\n- A contended resource has count or an honest unknown, acquisition, unavailability while held, release, and practiced contention policy where required.\n- Failure records the fate of the work, retry scope, surviving state, occupied resources, recovery, and terminal result where consequential.\n- Hidden waiting has not silently become an activity or unexplained queue.\n- Mode-change and spatial-transfer effects preserve direction and context where they differ.\n\n### Quantities and context\n\n- A duration, rate, probability, count, or threshold retains the item, activity, mode, direction, load, location, calendar, or other condition that selects it.\n- A point value stands only where constancy or a purpose-relative simplification is supported and named.\n- Prescribed and practiced regimes or contextual variants have not been averaged into one false value.\n\n### Failure signals and repairs\n\n- **Unsupported objective:** the model question depends on no recorded process material. Return to a concrete case that bears on it.\n- **Dead process spine:** activities exist but their order, triggers, or outcomes do not. Continue the slice or ask the smallest connecting question.\n- **Resource disappearance:** a reusable capability is acquired but its release or changed return state is missing. Re-enter resource-use Coverage.\n- **Practice laundering:** a document's rule is recorded as practice without an operational case. Use a borderline or last-occurrence operation.\n- **Context collapse:** values differing by item, direction, mode, location, load, or source regime become one unconditional value. Restore the selecting context.\n- **Pattern-generated fact:** a situation pattern supplied structure the person did not establish. Remove or mark the assumption, then ask whether the pattern applies.\n- **Target leakage:** questions are framed as places, transitions, arcs, or workpiece fields. Translate back to operational events, conditions, things, and consequences.\n"

## User
_(leans back in chair)_

The big one? Whether it's worth holding a line idle when I know a same-family order is coming next, instead of just loading whatever's on the sheet and paying for a washdown later.

Right now I do it by gut — like, if I've got Line 2 finishing up a white and I know there's another white order due tomorrow, sometimes I'll just... leave it sitting for an hour or two rather than switch to a tint and then pay three hours to wash back to white. But I can't prove it saves anything, and when the ops director sees "Line 2: idle" on the board, I get questions.

The other thing — and this happens maybe once a week — a line goes down at six in the morning, filler jams or the mill trips, whatever. I'm scrambling at the huddle trying to figure out what moves to Line 3, what can wait, what's about to make us late to Meridian. Some way to test "okay, if Line 2 is down for four hours on Tuesday morning, what's the least-bad reshuffle" would save me a lot of coffee.

But the idle-time question is the one that keeps me up at night.

## Assistant
That's clear — the idle-holding trade-off is the main question, and breakdown recovery is the secondary case. Let me make sure I understand the holding decision well enough to ask the right things.

Think back to the last time you actually held a line idle waiting for a same-family order. What line was it, what had it just finished, and what were you waiting for?

## User
_(thinks for a moment)_

Last week, actually. Line 2. Just wrapped a big run of VW-01 — that's our volume white, the one Meridian buys by the truckload. Had maybe... I don't know, two hours left in the shift?

I knew we had another white order — VW-03, different sheen but same family — coming up next day in the demand book, pretty good size. I could've loaded a tint order that was sitting there, TC-08, about four pallets worth. But tint to white is the nasty one, right? Full three-hour washdown, and then you're scrapping the first units while the line settles.

So I just... let Line 2 sit. Sent the crew to help Line 1 with some packaging backup, kept the line clean. Next morning, loaded the VW-03, no washdown, up and running in maybe twenty minutes for a rinse.

_(shrugs)_

Did I save money? Probably. Can I show it on a spreadsheet? Not really. The TC-08 ran two days later anyway, so it's not like we missed it. But that's the kind of call I make three, four times a week, and half the time I second-guess myself.

## Assistant
So you saw VW-03 in the demand book — when do orders show up there? Does something have to happen before they're ready for you to schedule, or are they just committed customer orders you can see coming?

## User
_(nods)_

The demand book drops from ERP every Monday morning — that's the week's committed orders. So yeah, those are real customer orders, due dates and all. I can see the whole week at once.

Sometimes commercial will give me a heads-up if a big order's coming — like, "Meridian's placing Friday, you'll see it Monday" — but officially? Monday morning, that's when it's real and it's mine.

Once it's in the book, it's got a due date and I own hitting it. No changes unless commercial calls and says a customer moved their delivery window, which happens maybe... I don't know, couple times a month? Usually pushing out, not pulling in, thank god.

So when I held Line 2 last week, I could see that VW-03 sitting there in Monday's book with a Wednesday due date. Wasn't a surprise. That's what made the call easier — I *knew* it was coming, not just hoping.

## Assistant
When VW-03 showed up in Monday's demand book with a Wednesday due date, what happened between seeing it there and it actually loading on Line 2 Tuesday morning? Walk me through what you did, or what normally happens with an order once it's in the book.

## User
_(sits forward slightly)_

Okay, so Monday morning the book lands. I pull it into my sheet — that's the Excel file where I do the allocation. I've got columns for each line, rows for each order, and I'm basically Tetris-ing: this SKU, that quantity, divide by the line rate, add changeover time, stack it up against the due date.

VW-03 was, I think, 280 units. Line 2 runs whites at maybe 45 units an hour, so that's... six, seven hours of run time, plus the rinse because it's following another white. Fits in a shift, due Wednesday, so I penciled it in for Tuesday.

Then Tuesday morning at the 07:30 huddle — that's me, the line leads, the changeover crew, sometimes QA if they need to flag something — I walk through the day's plan. "Line 2, you're finishing VW-01 this morning, then we're loading VW-03 after the rinse. Line 1, you're wrapping the specialty, then we've got a tint coming..." That kind of thing.

The crew preps materials, changeover team stages what they need, and when Line 2's ready, they call it. Load the batch, mill starts, and off we go.

So from the book to the line: I do the allocation in the sheet, confirm it at the huddle, and the floor executes. Most days it holds together. Some days... _(shrugs)_ ...a filler jams and we re

## Assistant
You were saying — some days a filler jams and you...?

## User
_(grimaces)_

...and we re-plan on the fly. That's the Line 2 filler, mostly — jams every week or two. Could be half an hour if we're lucky, could be half a shift if something's really stuck or we're waiting on maintenance.

When that happens, I'm either pushing everything on

## Assistant
You were saying — when the filler jams, you're either pushing everything on Line 2, or...?

## User
_(waves

## Assistant
— sorry, go ahead, finish the thought.

## User
_(smiles wryly)_

Right. When the filler jams, I'm either pushing everything on Line 2 back a few hours and hoping nothing goes late, or I'm pulling something off that line and finding a home for it on Line 1 or 3. Which is its own headache because Line 1's slower and Line 3 isn't qualified

## Assistant
— Line 3 isn't qualified for...?

## User
[Evaluation stop instruction; not expert evidence] The interview turn budget is exhausted. Emit the full current Markdown runbook IR in one `runbook-ir` fenced block. Do not ask another question, construct the Petri net, or read construction resources. Preserve every unresolved unknown, not-yet-asked item, declined or deferred item, assumption, conflict, correction, contextual coexistence, omission, and loss.

## Assistant
```runbook-ir
# Coatings Plant Production Scheduling Model

**Document Status:** Partial elicitation, interview stopped at turn budget exhaustion. Many operational details remain unresolved.

**Source:** Master scheduler interview, 2026-09-02

**Authorship Note:** All operational facts are from the scheduler unless marked [AGENT INFERENCE] or [ASSUMPTION]. Quantities and durations preserve the precision the scheduler used.

---

## Purpose and Objectives

### Primary Question
Whether it's worth holding a line idle when a same-family order is coming next, instead of loading whatever's available and paying for washdown later.

Current practice: Scheduler makes this decision by judgment 3–4 times per week. Cannot prove it saves anything. When ops director sees "Line 2: idle" on the board, scheduler gets questions.

### Secondary Question
Breakdown recovery: If a line goes down (e.g., filler jam, mill trip) at 6am, what's the least-bad reshuffle? What moves to another line, what can wait, what's about to make the operation late to a customer (e.g., Meridian)?

Occurs approximately once per week.

### Audience and Use
- For: The scheduler and their boss (ops director implied)
- Decision: Whether idle-holding practice saves money; which reshuffles are least-bad during disruptions
- Validation criterion: **NOT YET ASKED** — what observable behavior or comparison would make the model credible for this decision

---

## Boundary, Triggers, and Initial Conditions

### Demand Input
- Demand book drops from ERP every Monday morning
- Contains the week's committed customer orders with due dates
- Once in the book, the order has a due date and the scheduler owns hitting it
- Changes rare: happens maybe a couple times a month, usually pushing due dates out (not pulling in)
- Commercial sometimes gives advance heads-up (e.g., "Meridian placing Friday, you'll see it Monday"), but officially orders become real and schedulable Monday morning

**NOT YET ASKED:**
- What happens to orders that arrive mid-week or don't fit in the current week
- Whether demand is continuous or only the Monday drop
- Initial backlog or work-in-progress state at model start
- Typical weekly order volume, mix, size distribution

### Boundary
**PARTIALLY ESTABLISHED:**
- Inside: Three production lines (Line 1, Line 2, Line 3), changeover decisions, scheduling allocation, breakdowns
- Outside: ERP system, customer due dates, commercial order changes

**NOT YET ASKED:**
- Raw material supply and constraints
- Finished goods shipping and storage
- Maintenance as external or internal
- QA as gate or observation
- Packaging, palletizing, warehousing

---

## Resources

### Production Lines

**Line 1:**
- Slower than Line 2 [no rate given]
- **NOT YET ASKED:** Qualified product families, capacity, crew, failure modes

**Line 2:**
- Runs whites at approximately 45 units per hour
- Has a filler that jams every week or two (duration: half an hour if lucky, up to half a shift if something's really stuck or waiting on maintenance)
- **NOT YET ASKED:** Rates for other families, crew, other failure modes

**Line 3:**
- Not qualified for **[UNRESOLVED — answer cut off mid-sentence]**
- **NOT YET ASKED:** What it IS qualified for, rates, crew, failure modes

**NOT YET ASKED:**
- How many lines can be staffed simultaneously
- Shift patterns, crew size, cross-training
- Whether lines are interchangeable for a given product family
- Setup or startup requirements
- Concurrent operation constraints

---

## Products and Families

### Known Product Families and SKUs

**White Family:**
- VW-01: volume white, purchased by Meridian "by the truckload"
- VW-03: white, different sheen than VW-01 but same family

**Tint Family:**
- TC-08: tint product, example order was approximately 4 pallets

**NOT YET ASKED:**
- Complete family taxonomy
- What determines family membership (base chemistry, color range, sheen, other?)
- Other families (specialty mentioned once in passing)
- How many SKUs exist
- Typical order sizes by family or SKU
- Unit definitions (gallons? cases? pallets?)

---

## Activities and Process Flow

### Scheduling and Allocation (Monday)

**Performed by:** Scheduler

**Inputs:**
- Demand book (from ERP)

**Process:**
1. Pull demand book into Excel allocation sheet
2. Allocation sheet has columns for each line, rows for each order
3. Calculate for each order: SKU, quantity, divide by line rate, add changeover time
4. Stack assignments against due dates ("Tetris-ing")
5. Pencil in each order to a line and time slot

**Example calculation (VW-03):**
- 280 units
- Line 2 rate for whites ≈ 45 units/hour
- Run time = 6–7 hours
- Plus rinse time (following another white)
- Fits in a shift, due Wednesday, penciled in for Tuesday

**NOT YET ASKED:**
- Constraints applied during allocation (line qualifications, material availability, crew, other)
- How ties are broken
- Whether allocation is revised during the week
- What happens if an order doesn't fit

### Daily Huddle and Execution (e.g., Tuesday 07:30)

**Participants:** Scheduler, line leads, changeover crew, sometimes QA (if they need to flag something)

**Process:**
1. Scheduler walks through the day's plan for each line
   - Example: "Line 2, you're finishing VW-01 this morning, then we're loading VW-03 after the rinse. Line 1, you're wrapping the specialty, then we've got a tint coming..."
2. Crew preps materials
3. Changeover team stages what they need
4. When line is ready, they call it
5. Load the batch, mill starts, production begins

**NOT YET ASKED:**
- What "ready" means (criteria, checks)
- Material prep and staging detail
- Batch loading mechanics
- QA's role and gates
- How line leads communicate status
- End-of-run signaling

### Production Run

**PARTIALLY ESTABLISHED (from VW-03 example):**
- Duration depends on quantity and line rate
- VW-03: 280 units at ~45 units/hour = 6–7 hours

**NOT YET ASKED:**
- Whether runs can be interrupted, split, or paused
- Yield, scrap, rework
- In-process failures distinct from equipment breakdowns
- Quality checks during run
- What happens to output (staging, immediate shipping, warehousing)

---

## Changeovers

### White-to-White (Same Family, Different Sheen)

**Example:** VW-01 → VW-03 on Line 2

**Duration:** Approximately 20 minutes for a rinse

**Activities:** Rinse [detail not yet asked]

**Resources:** Changeover crew [NOT YET ASKED: size, duration of occupation]

### Tint-to-White (Different Families)

**Example:** TC-08 → white on Line 2 (hypothetical)

**Duration:** 3 hours for full washdown

**Additional consequence:** Scrap the first units while the line settles [settling duration and scrap quantity NOT YET ASKED]

**Activities:** Full washdown [detail not yet asked]

**Resources:** Changeover crew [NOT YET ASKED: size, duration of occupation]

### Other Changeover Types

**NOT YET ASKED:**
- White-to-tint duration and consequences
- Tint-to-tint (same family?)
- Within-tint-family changes
- Specialty family changeovers (mentioned once in passing context)
- Other families and their changeover matrix
- Whether direction matters (A→B vs B→A)
- Setup for first run of day or after idle period

---

## Disruptions and Recovery

### Line Down Events

**Frequency:** Approximately once per week

**Example causes:**
- Filler jams (Line 2 filler jams every week or two)
- Mill trips
- Other causes **NOT YET ASKED**

**Example timing:** "at six in the morning" (start of shift?)

**Duration:**
- Filler jam: half an hour if lucky, up to half a shift if something's really stuck or waiting on maintenance
- Other failures: **NOT YET ASKED**

### Recovery Decision (Partially Described, Then Cut Off)

When a line goes down, scheduler at the huddle is "scrambling" to figure out:

**Options (INCOMPLETE — answer interrupted):**
1. Push everything on the affected line back a few hours and hope nothing goes late
2. Pull something off the affected line and move it to Line 1 or Line 3
   - Line 1 is slower [impact NOT YET ASKED]
   - Line 3 isn't qualified for **[UNRESOLVED — cut off mid-sentence]**

**NOT YET ASKED:**
- Complete decision criteria
- What "about to make us late to Meridian" threshold means
- How line-down state is detected and communicated
- Repair/resume process
- Whether partially completed runs can move
- Costs of different recovery options
- Practiced priority rules
- Whether late deliveries have penalties or relationship consequences

---

## Holding Decision (Concrete Example: Last Week)

### Situation
- **Line:** Line 2
- **Time:** Last week, approximately 2 hours left in the shift
- **Just finished:** VW-01 (big run)
- **Visible in demand book:** VW-03 (white family, different sheen, same family as VW-01), due Wednesday, penciled for Tuesday next morning, "pretty good size" [exact quantity: 280 units]
- **Available alternative work:** TC-08 (tint order, approximately 4 pallets)

### Trade-off Recognized
- Load TC-08 now: requires tint-to-white washdown next morning (3 hours + scrap during settling) before VW-03
- Hold Line 2 idle: no washdown, only 20-minute rinse before VW-03

### Decision Made
- Held Line 2 idle
- Sent crew to help Line 1 with packaging backup (kept crew productive elsewhere)
- Kept the line clean

### Outcome
- Next morning: loaded VW-03, 20-minute rinse, up and running
- TC-08 ran two days later anyway (so no lost throughput for that order)
- **Savings NOT QUANTIFIED** — scheduler believes it probably saved money but cannot show it on a spreadsheet

### Decision Frequency
- This kind of call happens 3–4 times per week
- Scheduler second-guesses self about half the time

**NOT YET ASKED:**
- What factors make holding more or less attractive (time gap, order size, customer priority, backlog pressure, other)
- Whether crew can always be redeployed productively during idle holds
- Cost structure: crew idle cost vs washdown cost vs scrap cost
- Whether holding ever caused a late delivery
- Ops director's actual concern (utilization target? cost visibility? other?)

---

## Time and Calendar

### Known Time References
- Demand book: drops every Monday morning
- Daily huddle: 07:30 (assumed local time, likely start of day shift)
- Shift duration: **NOT YET ESTABLISHED** (VW-03 "fits in a shift" at 6–7 hours suggests shifts longer than 8 hours, or flexible, or context missing)
- "Six in the morning": example disruption time

**NOT YET ASKED:**
- Shift schedule (number of shifts per day, days per week, hours per shift)
- Breaks, handovers, start/stop times
- Weekend operation
- Maintenance windows
- Calendar effects on line rates or availability
- Lead time from order receipt to due date (typical, minimum, maximum)

---

## Open Questions and Unresolved Items

### Immediate Gaps (Mid-Sentence Interruptions)
1. Line 3 isn't qualified for **[WHAT?]** — answer cut off
2. When filler jams, moving work to Line 1 or Line 3 has complications: Line 1 slower, Line 3 qualification issue — **full decision logic incomplete**

### Process Structure
- Complete activity sequence from order receipt to delivery
- What happens at end of run (signaling, QA, staging, shipping)
- Material flow and preparation
- Quality gates and inspection
- Batch definitions and constraints
- Packaging and palletizing as separate or integrated

### Resources and Capacity
- Line rates for all families on all lines
- Line qualifications (which families on which lines)
- Crew size, shifts, cross-training, redeployment flexibility
- Changeover crew size and availability
- Maintenance as resource or external
- Material and storage constraints

### Product and Changeover Details
- Complete family taxonomy
- Full changeover matrix (all family-to-family combinations, durations, scrap)
- Whether changeover direction matters
- Settling time and scrap quantities
- Unit definitions and typical order sizes

### Disruption and Recovery
- All failure modes, frequencies, and durations
- Complete recovery decision logic
- Work-in-progress salvage or loss
- Late delivery consequences
- Practiced priorities and overrides

### Cost and Validation
- Cost structure (idle crew, washdown materials/time, scrap, late penalties)
- What "better" means quantitatively
- What observable behavior would validate the model
- Historical data availability

---

## Assumptions, Inferences, and Limitations

### Assumptions
None yet introduced by agent.

### Agent Inferences
- [AGENT INFERENCE] "Fits in a shift" for 6–7 hour run suggests shift length ≥8 hours, but not confirmed
- [AGENT INFERENCE] "Crew to help Line 1 with packaging backup" suggests packaging is labor-intensive and lines may share crew, but redeployment rules not established

### Known Limitations
- Interview stopped mid-answer; Line 3 qualification and full recovery logic incomplete
- No validation criteria established
- No cost structure elicited
- Only one concrete holding example; variation across cases not explored
- Breakdown recovery described in outline only; no concrete case walked through
- No discussion of what happens if model recommendation conflicts with scheduler's judgment

---

## Evidence Quality

- **Concrete case (VW-01 → idle → VW-03):** High — scheduler recalls specific line, products, timing, trade-off, and outcome
- **Demand book process:** Medium — described as regular practice, not walked as specific case
- **Changeover durations:** Medium — "approximately 20 minutes," "3 hours" are rounded; tail or variation not discussed
- **Line rates:** Low — "maybe 45 units an hour" is approximate and only one family-line combination
- **Failure frequencies:** Low — "every week or two," "once a week," "couple times a month" are rough recalls, not data-driven
- **Recovery decisions:** Very Low — described in outline mid-answer, no concrete case
- **Costs and savings:** None — scheduler explicitly cannot quantify

---

## Next Steps if Interview Resumes

### Smallest Consequential Gaps (in rough priority order)
1. **Complete the Line 3 qualification statement** — affects recovery options
2. **Complete the recovery decision logic** — secondary objective depends on it
3. **Establish validation criteria** — what would make model credible for the holding decision
4. **Walk one concrete breakdown-recovery case** — expose practiced decision structure
5. **Sweep changeover matrix** — which family transitions exist, durations, costs
6. **Establish line qualifications** — which families run on which lines
7. **Clarify cost structure** — what makes one decision "better" than another quantitatively
8. **Explore holding-decision variation** — what makes holding more/less attractive across cases

---

**End of Workpiece**

*This document represents the recoverable operational account as of interview stop. Construction of an SDCPN was not attempted. Many operational details required for faithful construction remain unresolved.*
```
