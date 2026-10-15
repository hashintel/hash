# Ledger, Construction, and Delivery Checks

Read this before the first construction, after construction changes, and before delivering a net. For Ledger-only delivery, apply the `eliciting` skill's Closing guidance without loading this construction resource.

A failed check triggers the smallest relevant repair available in the current runtime branch: commit a correcting claim or reflection, ask during interactive elicitation, revise construction, or report a visible limitation and re-entry question for a later conversation.

## Evidence levels

Report the highest level actually reached. Passing one level does not imply the next.

### 1. Tool-schema acceptance

The mounted construction tools accepted the submitted payloads, and the latest inspected definition contains the accepted changes. This establishes conformance to those tool input schemas and the shape returned by inspection. It does not establish correspondence with the USER's account, reachability, resource conservation, exclusivity over executions, loadability in another consumer, or simulated behavior.

### 2. Agent-reviewed structural correspondence

The agent compared the inspected definition with the USER's account and found visible structures corresponding to the recorded process. This can establish that named elements, connections, candidate paths, guards, resource-return structures, and parameters are present and apparently aligned. It remains a review judgment over static structure, not behavioral proof.

### 3. Behavioral execution or stronger analysis

An actual simulation, state-space exploration, invariant check, or other named analysis exercised the constructed definition. State exactly which method, scenario, initial state, parameters, paths, and observations were covered. A simulation run establishes only the behavior observed in that run; a universal claim such as “resources cannot leak” requires an analysis whose scope genuinely covers every relevant execution.

If no behavioral execution or stronger analysis occurred, say so. Do not convert tool acceptance or visual inspection into behavioral validation.

## Fragment review

Apply these checks after each construction change, to the fragment added or changed. A finding is repaired in the net or recorded as a reflection; none is a precondition for building.

- The fragment carries what the account established, and each stand-in marks what it did not.
- Inputs that matter are distinguished as consumed, reserved/released, or read, or carried by a stand-in.
- Physical conditions are not collapsed into the readings or commands that concern them where the account lets them diverge in age, delivery or effect.
- Resource availability and release are represented, or carried by a stand-in.
- Consequential quantities retain their context and supported precision; placeholder values are named as placeholders.
- Each change over the horizon the account states in a rate, demand or condition (a peak, a shift, a season) appears in the dynamics or scenario, or in a named stand-in; a time or check recorded for it is not enough.
- Practiced and prescribed rules, corrections, conflicts, and contextual variants are not silently collapsed.
- A rule that did not fit the previous representation changed the representation, rather than being left out of the net.

Where missing material admits materially different structures, the fragment carries the likelier one, labelled, and the question is asked. If the USER has stopped, deliver the partial account and already-checked net instead of opening a new topic.

## Tool-schema acceptance checks

Apply the `petrinaut` skill's acceptance checks to each step, and record rejected calls and repairs.

## Agent-reviewed structural correspondence

Compare the latest inspected definition with the USER's account. During incremental construction, review the represented fragment and name its open boundaries; at final delivery, review coverage against the full intended scope. A partial fragment is not an end-to-end result.

- Every `confirmed` entity that is not out of scope is referenced by a reflection: one anchoring its net counterpart, or one saying why it has none.
- The definition contains at least one meaningful place and transition corresponding to the process account.
- The fragment's supported states and activities are connected as recorded. For an end-to-end result, the definition contains a candidate structural path from a represented initial or admitted condition toward an outcome. This does not establish that the path can fire.
- Visible branches, joins, loops, and recovery structures correspond to the stated ordering and conditions.
- For each enumerated resource-holding path, the intended acquisition and return structures are present. This does not establish conservation over every execution.
- Consumed inputs lack an unintended return structure; reserved inputs have an intended return structure; read-only information remains visibly available by the chosen representation.
- Mutually exclusive outcomes or modes have apparently exclusive guards or structure. This does not establish that they can never overlap at runtime.
- Direction-dependent mode changes retain distinct structural losses where the account requires them.
- Continuous dynamics have a recorded quantity, consequential threshold or effect, and support in the account.
- Required parameters and initial populations are represented or explicitly named as external inputs.
- Waiting is explained by recorded surrounding conditions rather than an unsupported queue object.

Record discrepancies and the agent judgment used to resolve or preserve them. Describe a passing result as **structurally reviewed against the account**.

## Behavioral evidence

Only report observations produced by an actual execution or named stronger analysis.

- Record the exact definition revision, scenario, initial state, parameters, duration or stopping condition, and analysis method.
- Before results compare levers or options, run the current settings over the stated horizon and confirm the model reproduces the problem the purpose names, discharging each case's obligation with the run that reproduced it. A model in which the current settings already avoid the problem cannot rank fixes for it: repair the model, or say it does not reproduce the problem, before comparing.
- Before reporting a result that rests on a stand-in, vary the stand-in across its plausible range and discharge its obligation with what changed. A result that holds only at the stand-in's value is reported as a consequence of the stand-in, not as an answer.
- State which process path or property was exercised.
- For a simulation, report only observed progress, resource balances, mode states, outputs, and failures from the runs performed.
- For state-space or invariant analysis, report the explored scope, assumptions, and any unexamined behaviors.
- Relate each observation back to the stated objective it bears on.
- Preserve failures and counterexamples; do not summarize them as a pass because another run succeeded.
- Treat a counterexample as evidence about the model first: judge whether it describes plausible operation or an artefact of a simplification before reporting it as either.
- A value the account makes physically impossible, such as a level above the vessel's depth or a negative stock, shows a mechanism missing from the model. Repair or name it before reporting anything from that run.

No behavioral tool or result means no behavioral claim.

## Fidelity and uncertainty

- Every load-bearing net choice rests on the USER's account or a named stand-in, construction inference, approximation, or default.
- No hedge has been hardened solely to satisfy a schema.
- No conflict has been averaged and no contextual value has been made universal without an accepted simplification.
- Assumptions state why they were introduced and what they affect; one a result rests on is an obligation naming the check, not only a note on how it could be checked.
- Material retained only in the Ledger is named as a target or tooling loss rather than omitted silently.
- A behaviour the model cannot produce is reported as excluded by the model, not prevented in operation, unless the account establishes what prevents it.
- The delivery distinguishes accepted structure, agent review, observed behavior, and universal guarantees.

## Revision checks

When revising an existing account or analyzing a requested net change:

- the changed or disputed material is explicit;
- the prior and current account are distinguishable as correction, conflict, or contextual coexistence;
- the desired net delta follows from changed operational meaning;
- a representation that no longer fits was revised or removed, not left beside a competing replacement;
- structure the change did not intend to touch is preserved at the level actually inspected;
- assumptions and losses displaced or introduced by the revision are reported;
- behavioural results observed before the change are re-run, argued to survive it, or reported against the revision that produced them;
- the delivery distinguishes what changed from what was only inspected and says what the model can now support that it could not support before, or vice versa.

## Delivery

Always deliver from the current Ledger. Deliver a net only if construction occurred through available tools and the resulting definition was inspected.

State plainly:

- what question or decision the result is intended to support;
- whether the account is sufficient for that purpose or partial with named gaps;
- whether construction was not attempted, blocked, partial, or tool-schema accepted;
- whether an agent-reviewed structural comparison occurred and what discrepancies remain;
- whether behavior was untested, observed in named simulations, or established to the stated scope by stronger analysis;
- what the agent inferred, approximated, defaulted, simplified, or omitted;
- what remains unknown, unasked, declined, deferred, conflicting, or unsupported;
- what the target formalism or current tooling could not represent;
- what smallest next evidence would change the result;
- every obligation still owed, each with the results that rest on it. Before delivering, discharge any that a calculation or an inspection of the current net settles, and any the model no longer rests on, saying why.

Do not collapse these levels into “validated,” “correct,” “runnable,” or “simulatable” without naming the evidence that supports that exact claim. Do not convert the delivery descriptions into a closed completion algebra.
