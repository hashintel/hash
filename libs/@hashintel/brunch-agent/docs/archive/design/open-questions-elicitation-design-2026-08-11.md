# Eliciting process models: open questions (known unknowns)

## Why this document

The September goal is a demo in which an agent interviews a domain expert and elicits a process model of a cyber-physical system, projected to a Petri net in Petrinaut. For the eliciting agent to do that job well, it needs more than a questionnaire or a checklist, it needs **strategies and policies**: what to probe for, in what order, how to test answers, how to map answers to model outputs, how to know when it has enough, etc.

Below are some questions to help inform that design, and which are currently known unknowns. Even partial answers, anecdotes, or "read this paper / talk to this person" pointers are valuable. Please comment inline.

---

## 1. How does model-building actually start?

1.1. When you (or anyone you've observed) build a model of an operational system, what are the actual **inputs**? Documents, data extracts, conversations, site visits, literature — in what proportion?

1.2. Standing in front of the person who runs the system — the master scheduler, the fleet manager — what are the **first five questions**, and what model element does each answer feed (structure, types/colours, rates, constraints, objectives)?

1.3. What is the **dependency order** of questions — which answers do you need upstream because they change what you ask next?

1.4. Which answers do you want as **numbers**, which as **distributions**, which as **stories/scenarios**? When might you ask for "a specific bad day" instead of an average?

## 2. How do you reach what nobody wrote down?

2.1. Taxonomies (e.g. product families), penalty weights, unwritten constraints ("that product always runs on line 2") are repeatedly called out as load-bearing _and_ undocumented. What **phrasings actually work** to elicit them from a domain expert?

2.2. The "describe a bad day / what keeps you up at night" question reaches knowledge that exists only in heads (black-swan intuitions absent from event logs). What other questions of this type do you know or use?

2.3. When the person isn't forthcoming, does escalating to **constructed hypotheticals** ("imagine that while you're doing Y, you get a call that Z…") work in practice? What are the failure modes?

## 3. Structure: invented or assembled?

3.1. How much of a net is assembled from **recurring motifs** — queue/buffer, resource pool, failure/repair, changeover, inspection — versus invented fresh? Could we **enumerate the motif catalogue**? _(Why: high leverage. If nets are mostly motif instantiation, the elicitor can interview against a catalogue — "which of these patterns is present, with what parameters?" — instead of synthesising free-form structure.)_

3.2. Are there motifs specific to _cyber-physical_ systems (sensing/actuation loops, degradation processes, live data feeds) beyond the operations-research standards?

## 4. When are you done?

4.1. What do you check before declaring "**I can now build this**"? Is there a minimal category set — structure/topology, types & colours, rates & distributions, initial marking, objective & penalties, constraints (hard/soft/unwritten), data bindings, validation data?

4.2. Is completeness **question-relative** — complete only with respect to the questions the model must answer? (Every spec'd use case carries a "questions the model answers" table.) Should the elicitor therefore elicit _those questions_ first?

4.3. Is a **written fact-list** (per PRO-99: "all the facts necessary to make the net") the right completion artifact, or is the real criterion behavioural — the model reproduces a historical trace, or the expert _recognizes_ simulated pathologies ("yes, that's our Friday pile-up")?

4.4. When a simulation matches the naive calculation (spreadsheet) **too well**, what do you suspect first — a genuinely simple system, or a missing coupling? What do you check?

## 5. How do you cross-examine?

5.1. What are your standard **traps and tests** for gaps and weak assumptions? Candidates already visible in our documents: token conservation ("where do these come from / go?"), boundary probing ("what did you deliberately leave out?"), conflict policy ("when two X compete for one Y, who wins, by what rule?"), data-vs-decision conflation, assumed quantities that should be emergent (line throughput).

5.2. When two interpretations of the expert's words diverge, do you use **contrastive cases** ("in situation A would you do X or Y?")? Real examples welcome.

5.3. When domain experts **disagree with each other**, what do you do — and what should an agent do?

## 6. Which systems earn which formalism?

6.1. For each capability on the ladder — timed → stochastic → coloured → _dynamically_ coloured → guards/conflict policy → subnets → live data feed — **what evidence in a domain expert's answers tells you the system needs it**, and what tells you it doesn't?

6.2. Working hypothesis to attack: _most systems don't earn the full SDCPN stack; a simpler PN variant (or another structure entirely) is often the better model._ Where is this wrong? Which capability is needed more often than people expect, and which is prestige?

6.3. The September goal statement says "showcase SDCPN features." Our current use-case pool is thin on systems that genuinely strain dynamic colouring. Which candidate use case best _earns_ the showcase?

## 7. What lives outside the net?

7.1. The corpus already names elicitable content with no canonical home in the net: decision policies at conflict points, objective functions and penalty weights, goals and rationale, regulatory/business constraints, conservation laws, theoretical-vs-actual process (manuals vs. event logs), data-feed bindings, validation criteria. **What else belongs on this list?**

7.2. If the elicited description is an **intermediate representation** of which the net is one projection — what does that representation's schema need to hold, at minimum, for the September use case?
