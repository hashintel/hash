# Coverage Alternative — Target-Formalism Primary

This is a candidate replacement for the plugin profile's **Coverage** register. It organizes attention by distinctions the SDCPN-oriented workpiece and construction path may need, while treating Ciaran's goals, triggers, actors, locations, resources, steps, and process failures as domain-typology perspectives that can map across several concepts. It is for comparison at the current fog-line, not an additional resource the agent should read alongside `profile.md`.

## Coverage

Coverage identifies target-relevant information the workpiece may need for the stated purpose. The concepts are filing and checking addresses, not a questionnaire, a closed capture ontology, or an instruction to create one node of each kind.

### Objective

Preserve what the model must answer, compare, or help decide; who will use the answer; what may be varied; what should improve or be avoided; relevant priorities or trade-offs; and what would make the answer credible enough. Connect each objective to the operational material it depends on or mark it unsupported.

Ciaran's goals, safety conditions, importance, and desired/tolerated thresholds enter here, while their concrete measures and limits may also enter Metric or Constraint.

### Entity distinction

Preserve kinds of things the operation treats differently: what flows, what performs work, what is contended, and what state or properties change behavior. Include population shape, availability, qualification, compatibility, location effect, and whether distinctions vary across contexts.

Ciaran's actors, resources, work items, and some locations enter here. “Resource” is a role an entity plays; it also invokes Policy, Constraint, Boundary Condition, and Activity coverage.

Possible SDCPN consequences include colour sets, typed elements, resource tokens, and type-dependent parameters.

### Boundary condition

Preserve initial populations and state, arrivals and departures, calendars, external inputs and events, source reliability, admission triggers, prerequisites outside the process, and the chosen process boundary and horizon.

Ciaran's scheduled, received, threshold, and event triggers may enter here when they originate outside the normal flow; internal triggers may instead belong to Ordering Flow, Policy, Dynamics, or Activity.

Possible SDCPN consequences include scenario state, parameters, source transitions, and guards.

### Activity

Preserve what happens in operational vocabulary: preconditions, performer, inputs, whether each is consumed/reserved/read, outputs and state changes, duration, event occurrence, success and failure, recovery, mode-change loss, and dependence on type or context.

Ciaran's steps and operational failure questions enter primarily here. A step may require several target structures during construction; Coverage does not assume one activity equals one transition.

Possible SDCPN consequences include factored start/progress/finish transitions, intermediate places, resource arcs, timing, and typed outcomes.

### Ordering flow

Preserve sequence, concurrency, branching, joining, enabling triggers, loops, retry, recovery, terminal outcomes, and the conditions that choose among paths. Activities without explicit relation do not yet form a process spine.

Ciaran's unhappy paths, retry of part or all of a process, and “what happens next” questions enter here together with Activity and Policy.

Possible SDCPN consequences include arcs, arc types, exclusive branches, loops, and recovery paths.

### Policy

Preserve the rule used when more than one thing could happen or more than one claimant wants a capability: practiced priority, tie-breaking, release, override authority, prescribed alternatives, and contextual regimes. Distinguish correction, unresolved conflict, and conditions under which several accounts coexist.

Ciaran's approvals, decision responsibility, and some goals or avoidance rules may enter here when they decide behavior rather than merely evaluate it.

Possible SDCPN consequences include guards and priorities. Unsupported political or tacit judgment remains workpiece-only.

### Constraint

Preserve capacity, eligibility, compatibility, qualification, conservation, safety or regulatory limits, thresholds, and what happens when a limit is reached. A stated bound without operational consequence may be contextual rather than constructible.

Ciaran's caps, essentially-infinite resources, safety conditions, and quantities to keep above or below enter here.

Possible SDCPN consequences include capacities, guards, invariants checked over state, and explicit loss when no current projection exists.

### Metric

Preserve what is measured, how it is computed or observed, what “better” means, relevant typical or tail behavior, and any trade-off the person actually uses. Do not force qualitative objectives into invented weights.

Ciaran's measures, importance, desired probabilities, and thresholds may enter here together with Objective and Constraint.

Possible SDCPN consequences include scalar functions over simulation state and post-run comparisons; qualitative judgments may remain outside the net.

### Dynamics

Preserve quantities that change continuously while no discrete event occurs: direction and rate, variation, dependence on state, consequential threshold, triggered event, reset, and interaction among several changing components.

Ciaran's threshold triggers and time-varying resource properties may enter here when the change is continuous rather than an arrival or ordinary activity.

Possible SDCPN consequences include differential equations on real-valued elements, guards, and transitions triggered by crossings.

### Data binding

Preserve the model variable, real source or feed, units, update behavior, reliability, and the evidence gap the binding would close. Stop before implementation detail unless the stated purpose depends on it.

Ciaran's note about drawing timings from event datasets enters here as a prospective binding, not evidence that such a connection exists.

Current construction may retain data bindings only in the workpiece and loss report.

### Validation criterion

Preserve the observation, replay, historical comparison, expert judgment, or acceptance conversation that would establish that the model is credible enough for its intended use. Do not ask the person to predict the model's answer and store that prediction as structure.

Ciaran's process goals and measures inform validation, but validation remains distinct from the behavior being modeled.

### Cross-cutting quantity, evidence, and context

Any concept may carry duration, rate, probability, count, capacity, or threshold; applicable entity or operating context; prescribed and practiced regimes; source and supported precision; exact expert evidence; normalization; agent inference; assumption; unknown, unasked, declined, or deferred state; conflict; correction; contextual coexistence; omission; and target loss.

These are workpiece obligations where consequential, not mandatory fields on every statement.

### Domain perspectives that are not automatically target concepts

- **Actor:** may perform an Activity, decide a Policy, supply evidence, or be an Entity distinction.
- **Location:** may affect Boundary Condition, Entity state, Activity duration, Constraint, eligibility, or travel; it is not automatically a Petri-net place.
- **Resource:** combines an Entity distinction with availability, capacity, acquisition/release Activities, and contention Policy.
- **Trigger:** may be a Boundary Condition, Ordering Flow condition, Policy, Dynamics threshold, or Activity outcome.
- **Process failure:** may be an Activity outcome, event, alternative Ordering Flow, retry loop, Constraint violation, or terminal result.
- **Queue or waiting:** is explained by surrounding conditions and may emerge as construction structure rather than an independently elicited concept.
- **Scenario:** is assembled from boundary conditions, initial state, parameters, and candidate policies at simulation time.

## What this shape makes easy

- Seeing whether every distinction the target construction path may need has an explicit attention and checking address.
- Letting universal slice and sweep operations route directly to formalism-relevant Coverage concepts.
- Keeping target ontology, workpiece sufficiency, and construction consequences aligned.

## What this shape makes harder

- Finding material using the broad categories a process expert or colleague may naturally supply.
- Avoiding schema-shaped questioning when the formalism concepts are prominent.
- Representing actors, locations, resources, triggers, and failures that intentionally cross several target concepts without repeatedly translating them.
