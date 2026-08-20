# Expert meeting prep — cyber-physical process models & elicitation

2026-08-11. Prep for meeting with modelling-expert colleague. Purpose: stabilize and bound
understanding of the "cyber-physical" domain, and capture how an expert modeller would
himself elicit, from a domain expert, what he needs to build a faithful model.

Sources synthesized: Brunch — September Plan (Notion), Production Process Scheduling
Optimization (Notion, the one Spec'd exemplar), Petri net business use cases (Notion page +
database), SDCPN Library — Ideas (inbox), SAILS public report (inbox).

---

## A. What already seems stable (don't spend meeting time re-deriving)

1. **In-house "SDCPN" decomposes into feature axes**, not one monolith. PN class: Timed ·
   Stochastic · Deterministic · Statically vs Dynamically Typed/Coloured · Cyclic/Acyclic.
   PN features: subnets · concurrency · execution conflict resolution · resource contention ·
   live data feed. A given use case draws the axes it needs (the scheduling exemplar is
   statically-coloured timed, in deterministic and stochastic variants).
2. **A consistent anatomy template** for describing a candidate system: physical layer /
   cyber layer / events / continuous state / emergent behaviour (SDCPN Library doc), echoed
   in the DB schema (Physical system, Cyber component, Phenomena).
3. **What a "done" model definition looks like** (the scheduling exemplar's table of
   contents): one-liner → problem & context → system sketch (physical + cyber) → why this
   formalism → formal problem statement (Given / Decide / Maximise) → places, transitions,
   colours → questions the model answers → data requirements → limitations → validation bar.
4. **The elicitation-heavy inputs are the unwritten ones.** Scheduling doc, verbatim: "the
   family taxonomy, ramp scrap structure and penalty weights are the three things nobody has
   written down, and all three are load-bearing." Pattern: taxonomies, cost/penalty weights,
   unwritten constraints ("products that 'always' run on line 2").
5. **Validation notion**: reproduce a historical period's actual behaviour from recorded
   inputs before counterfactuals mean anything; closed-form sanity checks (net with failures
   off must reproduce the spreadsheet formula).
6. **The net evaluates; it does not decide.** Optimisation/analysis layers sit on top and are
   Petrinaut-team scope. Also: output may be a *model* (description of a system) or a *plan*
   (actions to undertake) — FE-1330 names both.
7. **"Cyber" in practice so far = enterprise data systems** (ERP, MES, historian, CMMS,
   scheduling layer), i.e. the sources/consumers of model data — not exotic control loops.
8. **SAILS framing**: the net is a candidate *world model* in the gatekeeper triad (world
   model + safety specification + verifier); tacit knowledge is a named deployment barrier;
   practitioners distrust what they can't edit or trace.

## B. Meeting shape (suggested, ~55 min)

1. **Bound the domain** (5–10 min) — his operational definition of "cyber-physical control
   system"; where the modelled-system boundary sits.
2. **Role-play elicitation** (15 min) — he interviews you (or narrates) for one scenario he
   knows cold; you capture questions *and their grounding*.
3. **Completeness & cross-examination** (15 min) — his definition-of-done and his traps.
4. **The SDCPN feature ladder** (15 min) — which expressive capabilities a system must *earn*
   and what evidence earns each.
5. **Meta** (5 min) — what he wishes he'd asked earlier in past engagements; where interviews
   fail.

## C. Sharpened questions

### C1. Bounding the domain

- "Define 'cyber-physical control system' the way you'd defend it to a referee. What's an
  example of a system that is *not* one, that a layperson might think is?"
- "In the scheduling spec, the 'cyber' side is ERP/MES/historian. Is the cyber layer always
  just the data estate, or does it sometimes include an existing automated controller whose
  behaviour must itself be modelled?"
- "Where does the model boundary sit relative to the controller being designed? (SAILS: the
  net is the *world model*, the AI is the *controller*.) When you model, are you modelling
  the plant, the controller, or both — and how do you decide?"

### C2. His elicitation questions, with grounding (the PRO-98 seed)

- "You're in front of the plant's master scheduler, blank page. What are your first five
  questions — and for each, which model element does the answer feed?" (Structure? colour?
  rate? constraint? objective?)
- "What's the *dependency order* of your questions — what does an early answer change about
  what you ask next?" (An elicitor needs interviewing policy, not just a checklist.)
- "Which answers do you ask for as *numbers*, which as *distributions*, which as *stories*?
  When do you ask for 'a specific bad day' rather than an average?"
- "How do you elicit things nobody wrote down — taxonomies, penalty weights, unwritten
  constraints? What phrasings actually work on a domain expert?"
- "How much of a net do you assemble from recurring motifs (queue/buffer, resource pool,
  failure/repair, changeover, inspection) versus invent fresh? Could you enumerate your motif
  catalogue?" — *high leverage: if nets are mostly motif instantiation, elicitation can
  interview against a motif catalogue instead of synthesising free-form structure.*

### C3. Completeness criteria (definition-for-purpose-of-modelling-and-simulation)

- "What do you check before declaring 'I can now build this'? Is there a minimal category
  set — structure/topology, types & colours, rates & distributions, initial marking,
  objective & penalties, constraints (hard/soft/unwritten), data bindings, validation data?"
- "Is completeness *question-relative* — complete only relative to the questions the model
  must answer (every spec'd use case carries a 'questions the model answers' table)? Should
  an elicitor therefore elicit the questions first?"
- "PRO-99 wants 'a written list containing all the facts necessary to make the net.' Is a
  fact-list the right form, or is the real criterion behavioural (can reproduce a historical
  trace)?"
- "What would you accept as evidence that a model definition elicited by an AI interviewer is
  complete? What's your acceptance test?" (Feeds PRO-104 benchmarks.)

### C4. Cross-examination (gap & weak-assumption tests)

- "What are your standard traps? e.g.: token conservation ('where do these entities come
  from and where do they go?'); boundary probing ('what did you deliberately leave out?');
  conflict policy ('when two X compete for one Y, who wins, by what rule?')."
- "How do you catch *data-vs-decision conflation*? (Scheduling doc: supplier-delay belongs in
  the Materials guard, deliberate idling belongs in `wait` — same field, opposite meanings.)"
- "How do you detect an *assumed* quantity that should be *emergent*? (Line throughput is the
  canonical case: the spreadsheet assumes it; the net derives it.)"
- "What contrastive cases do you use when two interpretations of the expert's words diverge?
  Give a real example." (Maps to our disambiguate-style questioning.)
- "When domain experts disagree with each other, what do you do — and what should an AI
  interviewer do?"
- "What arrives late and forces rework? What question, asked in week one, would have
  prevented it?"

### C5. The SDCPN feature ladder (which systems *earn* which capability)

For each capability: **what evidence in a domain expert's answers tells you the system needs
it — and what tells you it doesn't?**

| Capability | Earning question (draft — have him correct) |
|---|---|
| Timed | Do durations matter to any question the model must answer? |
| Stochastic | Does variability change a decision, or would nominal values give the same answer? Which distributions, from what data? |
| Coloured (static) | Do token attributes change behaviour (durations read from token colour), or is one token type enough? |
| **Dynamically coloured** | Does continuous state evolve *between* events and feed back into event timing/guards (degradation, temperature, battery)? Or can it be discretised into thresholds? |
| Guards / conflict resolution | Is there a decision rule at contention points, and is it policy (elicitable) or optimisation (external)? |
| Subnets / templating | Are there repeated structural units that must stay in sync? |
| Live data feed / marking injection | Will the model be re-run from observed current state (reactive use)? |
| Cyclic | Steady-state operation vs one-shot horizon? |

- "My working hypothesis: *most systems don't earn the full SDCPN stack, and a simpler PN
  variant — or a different structure entirely — is often the better model.* Where am I wrong?
  Which capability is more often needed than people expect, and which is prestige?"
- "What can a Petri net of any variant *not* capture that you routinely need? (Goals,
  rationale, spatial layout, continuous control laws…) Where do you record those?"

### C6. Meta / practice

- "In your last three modelling engagements, how much calendar time was elicitation vs
  model-building vs validation?"
- "If you had an AI interviewer that produced the fact-list + provenance for you, what would
  you *not* trust it with?"
- "What makes a natural-language summary of a net trustworthy to a domain expert?" (FE-1335's
  deterministic-summary requirement.)

## D. Capture instructions (for after)

Meeting notes → `docs/inbox/` with the usual timestamped name. The outputs feed, at minimum:
the elicitation checklist (PRO-98), reference-use-case criteria (PRO-99), the
SDCPN-earning/abstraction-ladder question, and the motif-catalogue hypothesis. These become
resolved fog or ticket seeds when the map is charted.
