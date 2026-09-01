# Coverage Alternative — Domain-Typology Primary

This is a candidate replacement for the plugin profile's **Coverage** register. It organizes attention by how a person describes an operational process while preserving the distinctions downstream SDCPN construction may need. Construction mappings remain in the construction resource. It is reproduced separately to compare navigation at the current fog-line; it is not an additional resource the agent should read alongside `profile.md`.

## Coverage

Coverage identifies what the workpiece may need for the stated objective and downstream SDCPN construction. It is not a questionnaire, a closed ontology, or a demand to populate irrelevant sections.

### Purpose, goals, measures, constraints, and thresholds

Preserve what the model must answer or compare, for whom, what should improve or be avoided, what may be varied, what “better” means, and any importance, trade-off, safety condition, or threshold the person can actually judge. An objective needs a traceable dependency on the operational account. Quantitative objectives may need metrics; qualitative objectives must not be forced into invented weights.

Keep qualitative goals and trade-offs in the workpiece when the person cannot support a numerical measure. Construction guidance owns the later choice of target representation.

### Process boundary, triggers, prerequisites, and initial conditions

Preserve what is inside and outside, what enters or leaves, what starts a case, calendars and availability, approvals or instructions, external events, initial populations, and reliability of boundary inputs. Distinguish a trigger from an ordinary activity and a prerequisite from a resource that the activity consumes.

These concerns define the operational starting and enabling context. Construction guidance owns how that context is represented.

### Participants, locations, flowing things, and resources

Preserve who or what flows, performs, decides, supplies, occupies, or constrains the process; distinctions the operation treats differently; relevant carried state; counts and population shape; qualifications and compatibility; and how locations affect behavior. A resource is a domain-facing role, not necessarily a separate target kind: its instances may be represented as typed elements subject to policy, capacity, and availability.

A physical location deserves target representation only when the operation treats being there as consequential. Construction guidance owns the representational choice.

### Activities, inputs, outputs, and resource use

For each consequential activity, preserve its name in operational vocabulary, preconditions, performer, inputs, whether each input is consumed/reserved/read, outputs and state changes, duration, success and failure outcomes, occurrence if it is an event, mode-change loss, and variation by type or context.

### Flow, branching, joining, failure, retry, and recovery

Preserve the order activities occur, what decides branches and joins, what can interrupt normal flow, conditions for unhappy paths, retry and recovery behavior, what happens to work and resources, and terminal outcomes. Activities without stated order do not yet form a constructible process spine.

### Time, quantities, arrivals, and stochastic behavior

Preserve durations, rates, counts, capacities, probabilities, arrival and availability patterns, relevant typical and tail behavior, dependence on type/load/calendar/state, continuous quantities, direction and rate of change, variation, thresholds, and resets. Keep unsupported precision broad or parameterized rather than manufacturing a distribution.

### Policies, exceptions, practiced rules, and contextual regimes

Preserve the rule applied when more than one thing could happen, contention priorities, tie-breaking, release conditions, overrides, prescribed versus practiced accounts, and the context in which each account holds. Determine whether divergence is correction, unresolved conflict, or contextual coexistence.

Construction later determines which rules are representable. Political judgment, unnamed exceptions, and unsupported conditions remain workpiece-only and must appear as losses rather than invented logic.

### Validation, evidence sources, and data bindings

Preserve how the person would know the model is credible for its intended question, what observations or historical data could test it, which variables a real feed might drive, who or what is authoritative for missing values, and where evidence remains unavailable.

Live data connections and qualitative validation may remain unsupported by the current target tooling; preserve them in the workpiece rather than implying implementation.

### Cross-cutting evidence and uncertainty

For every consequential concern, preserve the person's exact evidence where wording matters; normalized account; agent inference; assumption with reason and check; unknown, unasked, declined, or deferred material; unresolved conflict; correction; contextual variation; omission; and known target loss as applicable. These are workpiece obligations, not mandatory labels on every sentence.

### Things not independently elicited as target nodes

- A queue, buffer, or waiting state is ordinarily explained by the activities and conditions around it and may emerge as target structure during construction.
- A scenario is assembled for simulation from boundary conditions, initial state, parameters, and candidate policies; it is not necessarily one elicited process element.
- A resource is an operational role that may combine entity distinctions, capacity, availability, and policy rather than requiring one universal target node shape.
- A location is operational context until its effect on state, eligibility, travel, capacity, boundary, or resource use is established.

## What this shape makes easy

- Finding material in the vocabulary a process expert is likely to use.
- Filing Ciaran's goals, triggers, actors, locations, resources, steps, and failure/recovery concerns without first translating them into target kinds.
- Keeping consumed/reserved/read semantics and the process spine close to the account that supplies them.

## What this shape makes harder

- Seeing whether every target-formalism concept needed for construction has an explicit home.
- Distinguishing one domain concern that maps to several target concepts.
- Using target kinds directly as the index for formalism-specific completion checks.
