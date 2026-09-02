# Workpiece, Construction, and Delivery Checks

Read this when preparing to construct, after construction changes, and before delivering a net. For workpiece-only delivery, apply the universal and plugin Verification registers without loading this construction resource.

A failed check triggers the smallest relevant repair available in the current runtime branch: amend the workpiece, ask during interactive elicitation, revise construction, or report a visible limitation and re-entry question for a later conversation.

## Evidence levels

Report the highest level actually reached. Passing one level does not imply the next.

### 1. Tool-schema acceptance

The mounted construction tools accepted the submitted payloads, and the latest inspected definition contains the accepted changes. This establishes conformance to those tool input schemas and the shape returned by inspection. It does not establish correspondence with the workpiece, reachability, resource conservation, exclusivity over executions, loadability in another consumer, or simulated behavior.

### 2. Agent-reviewed structural correspondence

The agent compared the inspected definition with the workpiece and found visible structures corresponding to the recorded process. This can establish that named elements, connections, candidate paths, guards, resource-return structures, and parameters are present and apparently aligned. It remains a review judgment over static structure, not behavioral proof.

### 3. Behavioral execution or stronger analysis

An actual simulation, state-space exploration, invariant check, or other named analysis exercised the constructed definition. State exactly which method, scenario, initial state, parameters, paths, and observations were covered. A simulation run establishes only the behavior observed in that run; a universal claim such as “resources cannot leak” requires an analysis whose scope genuinely covers every relevant execution.

If no behavioral execution or stronger analysis occurred, say so. Do not convert tool acceptance or visual inspection into behavioral validation.

## Before construction

- The intended question, comparison, or decision is stated in the person's terms.
- The boundary and a meaningful concrete case are cold-readable from the workpiece.
- The process spine says what flows, what admits it, what happens and in what order, what changes the path, where waiting comes from, and what outcome or handoff ends it.
- Inputs that matter are distinguished as consumed, reserved/released, or read.
- Required resource availability and release are recorded or visibly unknown.
- Consequential quantities retain their context and supported precision.
- Practiced and prescribed rules, corrections, conflicts, and contextual variants are not silently collapsed.
- Construction can proceed without recovering a load-bearing fact from transcript memory.
- Assumptions, unresolved matters, omissions, and anticipated losses are visible.

If the missing material admits materially different process structures, formulate the smallest resolving question before constructing. Ask it only during interactive elicitation; in construct-only execution, return it as a blocking re-entry question. If the person has stopped, deliver the partial workpiece instead of opening a new topic.

## Tool-schema acceptance checks

- Every intended construction call was accepted or its rejection remains explicitly unresolved.
- The latest inspected definition contains each accepted place, transition, type, parameter, and connection under the identifier returned or supplied.
- Every referenced endpoint exists in the inspected definition.
- Arc weights or multiplicities are positive and conform to the mounted schema.
- No later step depends on a rejected or absent change.

Re-inspect after dependent stages and once at the end. Record rejected calls and repairs. Describe this result as **tool-schema accepted**, not valid, runnable, or simulated.

## Agent-reviewed structural correspondence

Compare the latest inspected definition with the authoritative workpiece claims.

- The definition contains at least one meaningful place and transition corresponding to the process account.
- It contains a candidate structural path from a represented initial or admitted condition toward an outcome. This does not establish that the path can fire.
- Visible branches, joins, loops, and recovery structures correspond to the workpiece's stated ordering and conditions.
- For each enumerated resource-holding path, the intended acquisition and return structures are present. This does not establish conservation over every execution.
- Consumed inputs lack an unintended return structure; reserved inputs have an intended return structure; read-only information remains visibly available by the chosen representation.
- Mutually exclusive outcomes or modes have apparently exclusive guards or structure. This does not establish that they can never overlap at runtime.
- Direction-dependent mode changes retain distinct structural losses where the workpiece requires them.
- Continuous dynamics have a recorded quantity, consequential threshold or effect, and workpiece support.
- Required parameters and initial populations are represented or explicitly named as external inputs.
- Waiting is explained by recorded surrounding conditions rather than an unsupported queue object.

Record discrepancies and the agent judgment used to resolve or preserve them. Describe a passing result as **structurally reviewed against the workpiece**.

## Behavioral evidence

Only report observations produced by an actual execution or named stronger analysis.

- Record the exact definition revision, scenario, initial state, parameters, duration or stopping condition, and analysis method.
- State which process path or property was exercised.
- For a simulation, report only observed progress, resource balances, mode states, outputs, and failures from the runs performed.
- For state-space or invariant analysis, report the explored scope, assumptions, and any unexamined behaviors.
- Relate each observation back to the workpiece objective it bears on.
- Preserve failures and counterexamples; do not summarize them as a pass because another run succeeded.

No behavioral tool or result means no behavioral claim.

## Fidelity and uncertainty

- Every load-bearing net choice traces to an authoritative workpiece claim or a named construction inference, approximation, or default.
- No hedge has been hardened solely to satisfy a schema.
- No conflict has been averaged and no contextual value has been made universal without an accepted simplification.
- Assumptions state why they were introduced, what they affect, and how they could be checked.
- Material retained only in the workpiece is named as a target or tooling loss rather than omitted silently.
- The delivery distinguishes accepted structure, agent review, observed behavior, and universal guarantees.

## Revision checks

When revising an existing workpiece or analyzing a requested net change:

- the changed or disputed workpiece material is explicit;
- the prior and current account are distinguishable as correction, conflict, or contextual coexistence;
- the desired net delta follows from changed workpiece meaning;
- unsupported update or removal operations are reported rather than imitated with competing additive structure;
- any applied additive net changes preserve the intended existing structure at the level actually inspected;
- assumptions and losses displaced or introduced by the revision are reported;
- the delivery distinguishes what changed from what was only inspected and says what the model can now support that it could not support before, or vice versa.

## Delivery

Always deliver the current recoverable workpiece. Deliver a net only if construction occurred through available tools and the resulting definition was inspected.

State plainly:

- what question or decision the result is intended to support;
- whether the workpiece is sufficient for that purpose or partial with named gaps;
- whether construction was not attempted, blocked, partial, or tool-schema accepted;
- whether an agent-reviewed structural comparison occurred and what discrepancies remain;
- whether behavior was untested, observed in named simulations, or established to the stated scope by stronger analysis;
- what the agent inferred, approximated, defaulted, simplified, or omitted;
- what remains unknown, unasked, declined, deferred, conflicting, or unsupported;
- what the target formalism or current tooling could not represent;
- what smallest next evidence would change the result.

Do not collapse these levels into “validated,” “correct,” “runnable,” or “simulatable” without naming the evidence that supports that exact claim. Do not convert the delivery descriptions into a closed completion algebra.
