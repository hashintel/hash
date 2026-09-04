# Kleppmann's Geolog design rationale

- Source: claude
- URL: https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a
- Exported: 2026-04-18T12:57:01.276Z
- Format: XML-style turn markers with raw markdown bodies

<turn index="001" role="user" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

I'd like you to help me understand this document.

</turn>

<turn index="001" role="assistant" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

This is Kleppmann's personal motivation essay for Geolog, structured as a chain of "why not the obvious alternative?" arguments that each justify a design decision by ruling out the nearest off-the-shelf option.

**The argumentative spine.** He starts from a national-security framing (AI-enabled offense is outpacing defense, destabilizing the offense-defense balance, so mass formal verification is a stabilizing defensive technology) and then walks inward through a series of negative arguments. *Why not Lean?* — designed for humans, bolts AI support on retroactively; no multi-agent collaboration primitives; LSP-based feedback loop is too slow; text representation requires parsing to reach the structured form agents actually reason over. *Why not an existing DBMS?* — server-centric systems block the fast feedback loop and parallel branching workflow needed for many agents; Git has local-first branching but only handles text; Automerge is closest but its data model is JSON. *Why a new data model?* — existing models capture a single version, whereas proofs are sequences of reasoning steps; SQL's constraint vocabulary is too weak to guarantee well-formedness under concurrent merges without serializable transactions. *Why geometric logic specifically?* — restricting to the fragment of first-order logic without negation (and with restricted implication/quantifiers) gives logical monotonicity, which means constraints can be checked incrementally on new writes without re-checking the whole database.

**The technical payload.** Geolog is three things braided together: (1) a dependently typed language for declaring relational schemas with arbitrarily expressive structural constraints, (2) a local-first database with CRDT-style merging and version history as a first-class queryable object, and (3) a general substrate for any diagrammatic model of computation — ASTs, IRs, string diagrams, Petri nets, circuits, spreadsheets — because any of these can be defined as a Geolog theory (schema + axioms). The proof-checker/database equivalence is the crucial move: if your theory encodes proof rules as axioms, then database constraint checking *is* proof checking, and any stored data is automatically accompanied by a verified proof of its well-formedness. The roadmap section (MLIR SSA as the first non-trivial theory, Hexane as the columnar storage engine factored out of Automerge, BFT via hash graphs, possibly SNARKs for succinct proof transport) is where it becomes clear they're reusing Automerge's substrate and swapping only the data-model layer.

**Connections to your work.** A few things stand out given your CPN architecture. Petri nets are explicitly named as one of the diagrammatic models Geolog is intended to subsume, so the forward-compatibility story is real — your CPN safety invariants would become axioms in a Geolog theory, with the token game encoded as structural constraints rather than runtime checks. Keyhive is named as a component already being absorbed into the Categorical Core's substrate, which tightens the integration story for your HCI layer. And the logical-monotonicity property from the geometric logic restriction is an interesting formal cousin of your "non-monotone in trust" illegality criterion — Geolog's design guarantees at the logic level that adding facts never invalidates prior theorems, which is structurally the property your four-way test demands.

Want me to go deeper on any particular section — the geometric logic argument, the physical data layout discussion, the BFT/SNARK sketch, or the mapping from your CPN work onto a Geolog theory?

</turn>

<turn index="002" role="user" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

I want to get a better grip on how agentic inputs and outputs are well-served by this. I probably need analogies to understand it better, because I don't actually know about what distinguishes geometric logic, for example

</turn>

<turn index="002" role="assistant" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

Good instinct — the geometric-logic piece is doing a lot of quiet work in this document, and once it clicks, the whole "why is this good for agents" argument falls into place. Let me build this up in layers.

**The core analogy: a kitchen with a very particular rule about ingredients.**

Imagine a professional kitchen where many cooks work in parallel on a shared menu. The kitchen has rules — "every sauce must have a fat and an acid," "no dish leaves the pass without being plated." Now imagine two flavors of rulebook.

*Rulebook A (classical logic, what Lean or SQL-with-triggers lets you write):* Rules can say things like "a dish is valid if it does NOT contain allergen X," or "a menu is complete if EVERY station has finished." These rules refer to absence and totality. The problem: if a cook adds a new ingredient somewhere, you might have to re-inspect every dish on every station to confirm nothing silently became invalid. Adding information can break things that were previously fine, because a rule that said "no X exists anywhere" can be falsified by adding an X somewhere you weren't looking.

*Rulebook B (geometric logic, what Geolog uses):* Rules can only say things like "IF these ingredients are present together, THEN this other thing must also be present." Rules are about positive co-occurrence — patterns that, when you see them, demand more patterns. They cannot say "this must be absent" or "this must be the only one." The consequence: adding new facts can only ever *demand more facts*, never *falsify existing ones*. This is what Kleppmann means by **logical monotonicity** — more information monotonically grows what's true, and nothing previously established can be retracted by new writes.

That property is the whole game for agents.

**Why monotonicity is the right shape for agentic I/O.**

Think about what an agent does when writing a proof or a program: it proposes small additions — a lemma, a rewrite step, a new node in an IR graph. In a non-monotonic system, every such addition is potentially a bomb: it might invalidate something another agent proved yesterday, and the system has to re-check the world to find out. Agents would have to hold a global picture in their heads (or the database would have to re-verify globally on every write), which destroys the fast feedback loop Kleppmann keeps insisting on.

In a monotone system, an agent's output is a pure *contribution*. You wrote something; either it violates a local constraint (rejected immediately, with a precise explanation of which constraint and which rows), or it's accepted and joins the pile. No one else's work can be silently invalidated. This is why Kleppmann can claim the proof checker is incremental: it only has to look at what just got added, not re-examine everything.

Now the branching/merging story makes sense too. Two agents working on separate branches are each monotonically accumulating facts. When you merge, you're unioning two piles of positive assertions. The only thing that can go wrong is that the union contains a pattern that triggers a constraint neither branch triggered alone — and because constraints are local ("if these patterns co-occur, then..."), the system can point at exactly which rows collide. Compare this to merging two Git branches that each added a function called `foo`: Git has no idea what `foo` means, so it just shows you two conflicting text blobs and shrugs.

**An analogy for the input side: the difference between reading a novel and querying a library catalog.**

When an agent interacts with Lean today, it's effectively reading the novel — it gets text shoveled at it, and has to parse that text into the structure it actually wants to reason over (the AST, the proof state, the available tactics). Every round trip pays the cost of flattening structure into text and re-parsing it. Kleppmann's footnote on page 4 is sharp about this: yes, the LLM consumes tokens, but there's no reason the *database's* primary representation should be textual. Text is a display format, not a reasoning format.

Geolog instead offers the library catalog. The agent asks precise questions: "what are the inputs to this instruction?", "which rewrite rules have already been applied to this subgraph?", "what's the version history of this lemma?" — and gets small, structured answers. The agent pulls exactly what it needs. This is why the MCP-to-LSP-to-Lean chain feels baroque: it's three layers of translation between the agent's structured queries and the text-based substrate. Geolog collapses the stack.

**An analogy for the output side: writing Lego instructions vs. writing an essay.**

An agent producing a proof step in Lean is writing an essay — a string of tokens that has to parse, type-check, and advance the proof state, all as one atomic success-or-failure event. If any of it's wrong, you get a compiler error and try again.

An agent producing a proof step in Geolog is snapping a Lego brick onto the structure. The "brick" is a small set of new rows in specific tables, each row being a structured fact ("this node is a rewrite of that node, via rule R"). The database checks: does this brick fit the pattern constraints? If yes, it clicks into place; if no, the rejection tells you precisely which stud didn't align. No parsing, no textual ambiguity, no "did you mean...". The atomic unit of progress is a structured contribution, not a text edit.

**Putting it together: why this shape specifically suits many agents in parallel.**

Four properties chain together:

The geometric-logic restriction gives you monotonicity. Monotonicity means local writes can't invalidate remote work, which means agents don't need global coordination, which means they can run local-first on their own replicas without network round-trips. Local-first plus monotonicity means branching and merging are well-defined (you're unioning fact-sets), which means parallel exploration of proof strategies is cheap. Cheap parallel exploration is exactly what you need when a single proof might require millions of small steps and you don't know in advance which strategy will pan out.

And because constraints are declared in the theory rather than enforced by transactions, the data *shape* is guaranteed — you can't end up with a malformed AST or a cyclic "linear" list as a merge artifact, which is the failure mode SQL databases have to prevent via serialization (and which Git just shrugs at entirely).

**The connection back to your CPN work.**

You'll notice the resonance: your architectural commitment to the Petri net as authoritative state rather than monitoring overlay is structurally the same move Kleppmann is making for Geolog — the formal object *is* the database, not a shadow of one. And your "non-monotone in trust" illegality criterion is a domain-specific instance of exactly the property Geolog builds in at the logic level. You've been reaching for monotonicity as a safety property for capability state; Geolog offers it as a foundational property of the substrate itself. When your CPN invariants eventually get expressed as a Geolog theory, the token game becomes a set of geometric sequents, and firing a transition becomes a structured write that either satisfies the axioms or gets rejected with a precise diagnostic.

Does it help to go deeper on any of these? I could unpack *what geometric logic can't express* (the cases where you'd want negation and have to work around it), or walk through a concrete worked example of a small Geolog theory for, say, a linked list or a tiny IR — sometimes seeing the actual sequents makes the "patterns demand patterns" idea much more concrete.

</turn>

<turn index="003" role="user" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

you said "higher level theory" at some point, and it feels like the point I need to dig in to: this sounds like we need to not only figure out how to express programs in geometric logic with local rules, but also all the other levels of reasoning and abstraction that are involved in any complex scenario/situation/system. Agents are not just writing code, and even within code as a domain, the rules for syntax can be local but the really critical work of how to compose a system and how to designs its part for composition, is happening on a different level of abstraction

</turn>

<turn index="003" role="assistant" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

Yes — you've put your finger on exactly the thing that makes Geolog more interesting (and more ambitious) than "a database for ASTs." The higher-level theory idea is doing philosophical work that's easy to miss on first reading, and it's *precisely* about the multi-level abstraction problem you're pointing at.

Let me try to unpack what "higher-level theory" actually means mechanically, and then why it matters for the composition problem you're naming.

**The mechanical picture first.**

A Geolog theory defines a universe of discourse: what entities exist, what relations can hold between them, what patterns are required or forbidden. So a theory of "MLIR programs" defines things like operations, values, blocks, regions, and the constraints that make a well-formed SSA graph — inputs-dominate-uses, types match, etc. An *instance* of that theory is a particular program.

Now here's the move: a higher-level theory is one whose *entities* are instances of the lower-level theory. So you can have a theory of "MLIR programs" at level 1, and at level 2 a theory of "sequences of MLIR programs related by rewrite steps," where each entity at level 2 is a whole program-instance from level 1, and the relations are things like "program B is the result of applying rewrite rule R to program A." The axioms at level 2 constrain *the relationships between whole programs*, not between operations within a single program.

You can stack this. Level 3 might be a theory of "optimization pipelines" whose entities are sequences-of-rewrites (level-2 objects), with constraints about which pipelines preserve which semantic properties. Level 4 might reason about *families* of pipelines, or about the compiler-as-a-whole.

Crucially, each level uses the same geometric-logic constraint machinery. The monotonicity property holds at every level. And — this is the part Kleppmann emphasizes briefly but is load-bearing — higher-level theories can *reference across* lower-level instances. A level-2 fact can say "the `foo` node in program A corresponds to the `foo'` node in program B." The lower-level instances are immutable with respect to themselves (a program is what it is), but the higher-level theory weaves them into a larger structure.

**Why this matters for the composition problem you named.**

You're right that syntactic well-formedness is the easy part. The hard part of engineering — and of proof, and of science — is reasoning about *how parts compose into wholes whose properties aren't just the union of the parts' properties*. A module is well-typed; does the system built from many modules satisfy its security properties? A Petri net transition is well-formed; does the whole net enforce the information-flow policy you care about? An individual agent action is permitted; does the *pattern* of actions constitute something you want?

What Geolog's layered-theory approach offers here is: **the compositional reasoning lives in a higher-level theory whose axioms are about the composition itself, and whose entities are the components.** This is different from, and more principled than, two common alternatives:

*The "bigger flat theory" alternative:* you could try to encode everything in one giant theory — programs, rewrites, pipelines, security properties, all at the same level. This quickly becomes unworkable because constraints that are natural at one level of abstraction ("these two programs are semantically equivalent") get smeared across many rules at a lower level, and you lose the ability to reason modularly.

*The "external proof assistant glues separate databases" alternative:* you could have one database for programs, another for rewrites, and use Lean or some external system to reason about their relationship. But then the relationship itself isn't a first-class object in your substrate — you can't query it, version it, merge it, or let agents contribute to it the same way they contribute to the components.

Geolog says: each level of abstraction gets its own theory, with its own entities, relations, and axioms, and *the levels are composable inside the system*. A proof that a rewrite preserves semantics is a set of level-2 facts satisfying level-2 axioms. A proof that a compilation pipeline produces a secure binary from a source program is a level-3 fact — and it can cite, as evidence, specific level-2 objects (individual rewrites with their preservation proofs) which in turn cite level-1 objects (the specific programs).

**The analogy that might help: scientific theories stacked on each other.**

Think about how physics is organized. Particle physics defines entities (quarks, leptons) and their interactions. Nuclear physics takes those and composes them into nucleons, with its own entities (protons, neutrons, binding energies) and its own laws. Chemistry composes nucleons-plus-electrons into atoms and molecules, with its own laws (valence, reaction kinetics) that *don't mention quarks*. Biology composes molecules into cells. Each level has its own ontology and its own axioms. The higher levels aren't reducible-in-practice to the lower ones — you can't do protein folding by simulating quarks — but they're *grounded* in them: every biological claim is, in principle, compatible with every chemical claim, which is compatible with every physical claim.

Geolog's layered theories offer something like this as a database structure. Each layer has its own "physics" (axioms in geometric logic), its own entities, and its own reasoning. But layers can reference each other, and the references are structural rather than textual — a level-2 fact doesn't *describe* a level-1 program in English, it *points at* it.

**Now the part that should interest you most.**

The composition problem you named — "how to design parts for composition" — is what category theorists mean when they talk about string diagrams, operads, and the algebra of composable systems. And this is, I suspect, not a coincidence with Geolog's design. The "Categorical Core" name isn't branding; the whole substrate is built around the insight that *the same mathematical structure that makes composition work in category theory — objects, morphisms, and the laws they satisfy — is what we want as the shape of a database for reasoning about composable systems*. Each Geolog theory is, roughly, a specification of a category: what objects are, what morphisms between them are allowed, what equations those morphisms satisfy. Higher-level theories are categories whose objects are lower-level instances.

This gives you a principled answer to "where does the reasoning about composition live?": it lives in a theory whose axioms are precisely the laws of composition you care about. For a Petri net, the level-1 theory defines well-formed nets, but a level-2 theory might define *net composition operations* (parallel composition, sequential composition, hiding) and their algebraic laws. A proof that composing two secure nets yields a secure net is a level-2 statement — and it's a proof you can store, version, and let multiple agents contribute to, the same way they contribute to the nets themselves.

**The honest limitations.**

It's worth saying: Kleppmann presents this as a "I don't know of any existing database that has a comparably powerful data model" — and that phrasing is doing real work. The layered-theory composition is an *aspiration with a clear mathematical foundation*, not a feature that's been extensively road-tested. The document is candid that the physical data layout questions for single-level theories aren't settled yet, let alone cross-level references at scale. The MLIR example is meant to be the first non-trivial case, and the paper is honest that even that's ambitious.

Also, the "anything compositional can be a higher-level theory" claim has a gotcha: *designing good theories at each level is itself the hard intellectual work*. Geolog gives you a powerful language for expressing multi-level structure, but it doesn't tell you *what the right ontology is* at each level. That remains a design act — which is why Kleppmann talks about Geolog theory authors giving hints, and why I suspect the HCI research questions in your workstream are going to matter a lot here. Someone has to decide what the objects at level 2 are, and whether that's the right carve-up for the reasoning you want to do. This is not a problem the substrate solves; it's a problem the substrate makes *possible to work on cleanly*.

**The tie back to your architecture.**

You're already doing this in your CPN work, whether you frame it this way or not. Your token colors, phase guards, and airlock transitions are level-1 stuff — the local syntax of the net. Your "epistemic phase as a structural primitive" move is arguably a level-2 claim: you're saying the *relationships between nets in different phases* are a thing with its own axioms (which transitions can bridge phases, under what token conditions). Your four-way illegality test is a level-3-ish claim: it's about properties that reason about whole trajectories of actions, not individual transitions. The fact that you've been reaching for these layers suggests the abstraction problem you're naming is already live in your design — you just haven't had a substrate that lets you express the layers as first-class composable objects rather than as separate informal conventions that have to stay consistent by hand.

The Geolog bet is that giving you that substrate will change what's tractable. Whether it does is, as Kleppmann says, still a hypothesis.

Do you want me to try sketching what a two-level Geolog-style theory might actually look like for a tiny fragment of your CPN architecture — maybe the epistemic-phase guard idea? Seeing it concrete, even in a toy form, might help separate what the substrate buys you from what still has to be designed by you.

</turn>

<turn index="004" role="user" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

Yes I would be very curious to see that. Sometimes I think the tone of talk from the category theorists has a tendency to blur the sense of what is possible vs what is actually worked out, or almost as if the design part was somehow trivial... 😓 but figuring out how to map real domains and abstractions to this seems extremely challenging to me

</turn>

<turn index="004" role="assistant" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

Your frustration is warranted — there's a real failure mode in category-theory-inflected technical writing where the expressive power of the formalism gets conflated with the *content* of a good model in that formalism. "You can express it as a theory" is not the same as "the theory is worked out," and the gap is often enormous. Let me try to be honest about that gap as we go, by actually *doing* the design work and flagging where I'm making real choices versus where the substrate is helping.

I'll use a deliberately tiny fragment of your architecture: a single agent with an epistemic phase (explore vs. exploit) and a capability (read access to a document). This is small enough to actually finish, and it'll surface the design choices immediately.

**Level 1: the state of the world.**

At the bottom level we need to say what kinds of things exist and how they relate *at one moment*. This is the "instance at a point in time" picture. Let me sketch it in pseudo-Geolog-ish syntax — the exact surface syntax doesn't matter, what matters is what's being declared:

```
Types:
  Agent
  Capability
  Phase  -- just two values: Explore, Exploit
  Document

Relations:
  inPhase(Agent, Phase)         -- agent is currently in phase
  holds(Agent, Capability)       -- agent currently has capability
  grants(Capability, Document)   -- capability grants access to document

Axioms (constraints):
  A1: every Agent is in exactly one Phase
  A2: every Capability grants access to at least one Document
```

Right away you should feel the ache: "every Agent in *exactly one* Phase" wants to say "no two phase-assignments" which is a negation-like claim. In geometric logic you express this positively: you declare that `inPhase` is *functional* — if `inPhase(a, p1)` and `inPhase(a, p2)` then `p1 = p2`. The equality here is a positive fact being demanded, not an absence being asserted. This is a real workaround pattern in geometric-logic schemas, and it's already a small design decision: you've had to decide that "an agent's phase" is a function rather than a relation, which seemed obvious here but won't always be.

The "at least one" in A2 is also a geometric-logic-shaped axiom — it says "whenever a `Capability` exists, there *must also exist* a `Document` it grants access to." This is a pattern-demands-pattern axiom, exactly the shape we want. It's also a real design commitment: I've decided capabilities can't exist without referents. Maybe I want that, maybe I don't. The substrate forces me to be explicit.

**Now the first real design decision surfaces.**

I need to represent that "holding a capability in phase P" is different from "holding a capability in phase Q" — this is the heart of your airlock idea, that phase changes should invalidate capabilities. How do I model this?

Option A: make `holds` a three-place relation `holds(Agent, Capability, Phase)`. Capabilities are held-in-a-phase, and phase transitions just correspond to different holdings.

Option B: make capabilities themselves phase-scoped — each capability is "a read capability for document D *in phase explore*" — and `holds(Agent, Capability)` stays two-place.

Option C: introduce an intermediate entity, `Grant`, which is the *event* of an agent being granted a capability in a phase, and `holds` is derived from active grants.

These are genuinely different models with different downstream consequences. Option A is simplest but makes it awkward to talk about a capability "surviving" a phase change in cases where that's allowed. Option B reifies the phase-capability product, which might explode combinatorially. Option C introduces temporal structure that'll be useful later but is overkill now.

*The substrate does not tell me which to pick.* This is exactly the design-is-not-trivial point you were naming. I'm going to go with Option C because it'll set up the level-2 story better, but I want to be clear this is a judgment call informed by where I'm planning to go, not a derivation.

So, revised level 1:

```
Types: Agent, Capability, Phase, Document, Grant

Relations:
  inPhase(Agent, Phase)
  grants(Capability, Document)
  grantOf(Grant, Capability)     -- which capability this grant is for
  grantTo(Grant, Agent)           -- which agent received it
  grantInPhase(Grant, Phase)      -- which phase it was issued in
  active(Grant)                   -- is this grant currently in force

Axioms:
  A1: inPhase is functional per agent
  A2: every Capability grants to at least one Document
  A3: every Grant has exactly one Capability, one Agent, one Phase
  A4: if active(g) and grantTo(g,a) and grantInPhase(g,p), 
      then inPhase(a, p)
      -- "an active grant's phase must match its agent's current phase"
```

A4 is the airlock axiom in miniature. Read it out loud: "whenever we see an active grant that was issued to an agent in a particular phase, we must *also* see that agent currently being in that phase." If the agent's phase changes, A4 is violated unless the grant becomes inactive. The substrate enforces this structurally — you literally cannot write "agent moved to explore phase" into the database while an active exploit-phase grant for that agent exists. The write gets rejected with exactly that diagnostic.

Notice what just happened: a *security property you care about* — capabilities don't survive phase transitions — became a structural axiom of your schema. You don't have a monitor checking for violations; the database will not let violations be recorded. This is the analogue of your "Petri net as authoritative state" principle, now rendered in geometric logic.

**Level 2: trajectories, where the interesting reasoning lives.**

Level 1 only describes single moments. But almost everything interesting about your architecture is about *how state evolves*: phase transitions are moments when capabilities must be revoked, trajectories through the net have properties, the four-way illegality test is about move sequences, not static configurations.

A level-2 theory treats level-1 instances as its entities. Let me try:

```
Types:
  State           -- each entity here IS an entire level-1 instance
  Transition      -- a labeled edge between two states
  TransitionKind  -- {PhaseChange, GrantIssue, GrantRevoke, Use}

Relations:
  from(Transition, State)
  to(Transition, State)
  kind(Transition, TransitionKind)
  precedes(State, State)   -- derived: reachability
```

And now the interesting axioms — the ones that encode your architectural commitments as structural constraints at the trajectory level:

```
B1: every Transition has exactly one from, one to, one kind

B2: AIRLOCK: if kind(t, PhaseChange) and from(t, s1) and to(t, s2)
    and some agent a differs in phase between s1 and s2,
    then no Grant is active(_) in s2 that was grantTo(_, a)
    -- phase transitions zero out the agent's active grants

B3: MONOTONE EVIDENCE: if some proposition P was established at state s1,
    and precedes(s1, s2), then P is still evidenced at s2
    -- this is your "non-monotone in trust" criterion as a structural axiom
```

B2 is where the real money is. Notice the shape: a transition *of a particular kind* demands a particular structural relationship between its endpoints. The geometric logic axiom is "whenever you see a PhaseChange transition with these endpoints, you must also see [constraints on the endpoints]." Adding such a transition to the database without the endpoints satisfying the constraints is a rejected write.

B3 is where I need to be honest with you about the limits. "Non-monotone in trust" is tricky to formalize because *what counts as trust-relevant evidence* is itself a modeling decision. I've waved at it with "some proposition P was established" but that's not a real axiom yet — it's a schema for a family of axioms, one for each kind of evidence you care about tracking. In practice you'd need to enumerate: signed attestations from other agents, completed human reviews, passed checks, etc., and B3 becomes a bunch of specific axioms, one per evidence type, each of the form "if evidence E was valid at s1 and s1 precedes s2, then E is valid at s2."

This is exactly the kind of place where the category theorists' tone can mislead. "Evidence monotonicity is just an axiom at the trajectory level" sounds clean. *Actually enumerating your evidence types and proving the monotonicity claim holds for each of them* is a substantial piece of engineering and domain modeling. The substrate makes it *expressible*. It does not make it *easy*.

**What I want to highlight about what just happened.**

Three things worth noticing, because they're the actual payoff for the effort:

First, the level-1 theory knows nothing about trajectories, phases-as-moments, or sequencing. It's a static theory. The level-2 theory treats level-1 states as opaque entities and reasons about their relationships. These are cleanly separable concerns, and an agent contributing to the database could be working entirely at level 2 — proposing a new transition between two existing states — without needing to re-derive anything about the internal structure of those states. That's the compositional win.

Second, your architectural principles have become *axioms of the level-2 theory*. The airlock isn't a runtime check, it's a structural invariant. The non-monotone-in-trust criterion isn't a review checklist, it's (once you enumerate evidence types) a family of sequents. Agents that propose writes have their proposals rejected by the substrate when they violate these, with diagnostics pointing at exactly which axiom and which rows. This is what Kleppmann means by constraint-checking-equals-proof-checking: your security properties are enforced at the same level where the data is stored.

Third — and this is the honest flip side — *I made a dozen design decisions to get here*, and most of them were not mechanical. Whether `Grant` is an entity. Whether `holds` is derived. What counts as evidence for B3. Whether phases are a type or an attribute. These choices determine what's easy to express, what queries are natural, what violations get caught, and what gets smeared across many axioms. The substrate gives you a very clean language for committing to a model. It does not tell you what model to build.

**What I'd want to know before going further.**

If this were actually your project and not a toy, the next design questions would be: is the level-1/level-2 cut at the right place? Maybe states-and-transitions should be level 1 (because your CPN already is a state-transition system), and level 2 is about *properties of trajectories* — things like "all trajectories from an explore-phase state to an exploit-phase state pass through a human-approval state." Those are specifications of what kind of trajectory you'll accept, and they're compositional: you can conjoin them, quantify them over classes of agents, etc. Level 3 might then be about *policies* — families of trajectory-specifications that an organization commits to. Your HCI work on delegation interfaces lives somewhere around level 2 or 3, because delegation is fundamentally about "what trajectory-shapes will I accept from a delegate."

None of this carve-up is forced by the substrate. All of it is the design work you correctly identified as non-trivial. What Geolog offers is that *once you've decided on the carve-up*, each level is an expressible theory with enforced invariants, agents can contribute to each level independently, and you can reason formally about the relationships between levels. What Geolog does *not* offer is a way to skip the domain-modeling work — and the category-theoretic framing, for all its power, can make that work look deceptively tidy when the actual labor is deciding what your ontology is and what's worth making structural.

Does this concretize it usefully? I'm aware I've been pretty dense and haven't fully worked out even this toy example — I could go further on any piece: actually trying to phrase the monotonicity axiom B3 for a specific evidence type, sketching the level-3 policy theory, or going sideways into what the *merge conflict* would look like if two agents proposed contradictory trajectory-level claims.

</turn>

<turn index="005" role="user" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

This is quite helpful. I can get a glimpse of what would make it very powerful, although I don't quite see clearly how the axioms in the forms you stated them are simpler to check than if they were phrased differently; I think the main thing I notice in your later paragraphs is that we're proposing a science and discipline of database modelling for which we're going to be at a severe shortage of expert practitioners! Good relational database modelling is already not trivial at scale, and not everyone is good at thinking in those terms; these ones are even more demanding

</turn>

<turn index="005" role="assistant" url="https://claude.ai/chat/88560689-e753-45d2-8d52-e3ed0ec8af8a">

You've put your finger on two things that are worth separating, because one of them has a fairly crisp technical answer and the other is a genuine sociological problem that I don't think the Geolog folks have a great answer to.

**On the "why is this form easier to check" question.**

You're right to be skeptical that the axioms as I wrote them look obviously easier — prose like "whenever an active grant exists, the agent must be in a matching phase" could be read as a perfectly normal database trigger or assertion in any system. The efficiency claim is real but it operates at a level below the surface syntax, and I think I glossed it. Let me try to make it concrete.

A geometric sequent has a specific shape: `∀x⃗. φ(x⃗) → ∃y⃗. ψ(x⃗, y⃗)` where both `φ` and `ψ` are conjunctions of atomic facts — literally just "this relation holds between these things, AND this relation holds between these things." No "not," no "or" in the conclusion, no nested quantifiers over negations. The universal outside and the existential inside are the only quantifiers allowed.

The efficiency payoff comes from this exact shape, and it comes in two parts.

*Pattern-matching instead of search.* To check whether a new write violates any axiom, the system needs to find: "does the new fact create a pattern matching some `φ` whose required `ψ` isn't present?" This is a join — you're pattern-matching the conjunctive `φ` against the database. Joins are what relational databases are genuinely good at, and decades of query planning technology applies. Crucially, the answer to "does pattern `φ` match?" can only *become true* when you add facts, never become false — because `φ` is a positive conjunction. So you only need to check axioms whose `φ` contains at least one of the relations you just wrote to. Everything else is provably untouched.

Contrast with a constraint like "no agent holds two conflicting capabilities." The natural phrasing uses negation or uniqueness. To check it incrementally, you need to know whether *any* conflicting pair exists — and that's a question whose answer can flip either direction as you add or remove facts. You end up needing either (a) serializable transactions that lock enough of the database to reason globally, or (b) materialized counters/indexes that you maintain by hand and hope you got right. Both work, both are expensive, both are what SQL-plus-triggers actually does in practice.

*Monotone repair.* When a geometric axiom is violated — `φ` matched but required `ψ` is missing — there's a well-defined sense in which the repair is "add facts to make `ψ` true." The axiom tells you exactly what's missing. With negation-heavy constraints the repair might be "remove something" or "change something," which interacts badly with concurrent writers. Geometric constraints have a kind of "chase" procedure (this is the technical term, from database theory) where you can mechanically fill in what's demanded.

Now, the honest caveat: in my examples I *did* sneak in equalities ("inPhase is functional") and negation-shaped properties ("no active grant exists for this agent"). These are expressible in geometric logic but only through specific encodings — equality is itself a relation with axioms, "no X exists" becomes "if X exists, then contradiction" where contradiction is a designated empty-conclusion axiom. These encodings are real but they're not free. Part of the design skill you're pointing at is *knowing which negation-shaped properties have clean geometric encodings and which don't*. "Exactly one phase per agent" does (via functionality). "No two agents have overlapping capabilities" is genuinely harder and may force you to restructure your schema to make the property structural rather than a predicate.

So the efficiency claim is honest but sharp: it applies to axioms in the geometric fragment, and part of the domain modeling skill is getting your properties *into* that fragment by designing your schema appropriately. When you can, you get incremental checking and clean merge semantics for free. When you can't, you have to refactor or fall back to non-incremental queries.

**On the expert shortage.**

This is the part where I think you're identifying something the SGAI documents don't really grapple with, and I want to take it seriously rather than hand-wave.

Good relational schema design is already a craft that most working programmers are mediocre at. The number of production databases where people conflated "the form the UI wants to display" with "the normalized relational model" is... approximately all of them. Database normalization is taught, has decades of pedagogy behind it, has clear heuristics (the normal forms), and most people still get it wrong when the domain is complicated. And that's *without* dependent types, without multi-level theories composing into each other, without geometric logic's specific constraints on how you can phrase things, and without the extra burden of designing for AI agents to contribute rather than humans.

The Geolog bet seems to be that *the people who will be writing Geolog theories are themselves going to be heavily AI-assisted*, and that this changes the calculus — it's okay for the substrate to be demanding if the primary users have an AI sitting next to them helping navigate the design space. There's something to this. A well-equipped AI could plausibly know all the standard encoding tricks (how to express functionality, how to encode "at most one," how to structure a higher-level theory), and could surface the standard failure modes. It could suggest "you've written something that looks like it wants negation; here are three ways to refactor into geometric shape, with these tradeoffs."

But I think you're right that this is glossed in the documentation I've seen. The MLIR example in the roadmap is instructive: it's a case where *the ontology already exists* (MLIR is a well-specified IR with established semantics), so the Geolog theory is more like a translation exercise than a design-from-scratch exercise. The hard cases — your CPN work, cyber-physical modeling, scientific domains — *don't come with a pre-existing formal ontology*, and someone has to make the judgment calls I kept flagging in the toy example. Is a `Grant` a first-class entity? Is evidence level 2 or level 3? Where do temporal aspects live?

There's a deeper version of the shortage worry too. In SQL-land, when you design a schema badly, you can at least *refactor later* — migrations are painful but tractable. In Geolog-land, because higher-level theories reference lower-level ones and proofs get stored against specific theory definitions, a schema change potentially invalidates proofs. There's a research question here that I don't think has a clear answer yet: what are the good patterns for *evolving* a theory as you learn more about a domain? In the paper Kleppmann mentions that the version history can encode the evolution of a proof, but I don't think he addresses the evolution of *the theory itself* — and that's where the practitioner-shortage bites hardest, because early theories will be wrong and people will need to revise them.

There's also a selection-effect issue worth naming: the people currently excited about Geolog are, roughly, category theorists and formal methods researchers who *enjoy* this kind of modeling and are temperamentally suited to it. That's fine for the early research phase. But "enough people can build good theories that this becomes infrastructure for critical software" requires either that the substrate gets dramatically friendlier for more normal engineers, or that the AI-assistance story is good enough to paper over the skill gap, or that the domain of application stays narrow enough that a small expert community can handle it. The documents are optimistic about paths one and two; I haven't seen them seriously address what happens if neither pans out.

A modest but real point in their favor: the "theories compose" property means you might not need every team to design theories from scratch. If someone designs a really good theory for "compilable IRs with rewrite-preserving optimization passes," everyone else can use it and reason *with* it without needing to have built it. This is the same economic logic as libraries in programming — most programmers don't write their own data structures because someone else already did, well. Whether this ecosystem emerges for Geolog theories is an open empirical question, and it depends on whether the early theories are good enough to become shared foundations rather than each project rolling its own.

I think the honest summary is: Kleppmann's document makes a strong case that *if* we could write these theories well, they'd give us something genuinely new and valuable, especially for the large-scale formal verification goal. The "if" is doing a lot of work, and the paper is candid about the physical-layout and performance-engineering challenges while being much less candid about the domain-modeling and practitioner-ecosystem challenges. Your instinct that the design work is underrated is, I think, correct — and it's the kind of concern that tends to get sharper the closer you are to actually doing the work, which is probably why you're feeling it and the more theoretically-oriented participants in the program may not be.

The HCI workstream you're in is, interestingly, one of the places where this concern is most salient. Because if the substrate's usability depends on tooling that helps people design theories well — surfacing encoding options, flagging schema smells, visualizing cross-level references, supporting theory evolution — that's HCI work. It's not glamorous compared to the category-theoretic foundations, but it may be load-bearing for whether the whole thing is actually practical at the scales the national-security argument requires.

</turn>