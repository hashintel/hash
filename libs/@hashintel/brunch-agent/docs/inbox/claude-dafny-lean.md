# Intent Specification and Formal Verification

- Source: claude
- URL: https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4
- Exported: 2026-05-04T08:54:13.422Z
- Format: XML-style turn markers with raw markdown bodies

<turn index="002" role="user" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

As it happens, we're working on a spec elicitation tool for software, but our notion of "spec" has been considerably looser and less formal up to now. I'm thinking about ways to tighten it, and would like to discuss these two articles:

* [From Intent to Proof: Dafny Verification for Web Apps | Midspiral](https://midspiral.com/blog/from-intent-to-proof-dafny-verification-for-web-apps/)
* [Intent Formalization: A Grand Challenge for Reliable Coding in the Age of AI Agents](https://arxiv.org/pdf/2603.17150)

</turn>

<turn index="002" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Synthesizing spectrum framing to tighten spec elicitation approach
Synthesizing spectrum framing to tighten spec elicitation approach
Claude's response was interrupted
Retry

</turn>

<turn index="003" role="user" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

I can pass you the PDF for the latter, if that fetch is not working

</turn>

<turn index="003" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Yes, please do — I got the abstract and a fair bit from search snippets but the full text would be much better for actually discussing the argument's structure and the specific examples (TiCoder etc.). Drop it in whenever you're ready.

</turn>

<turn index="004" role="user" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

When I was said our current flow was informal, I really wasn't joking though. The attached file is an example of what the `memory/SPEC.md` document looks like in the project where we are developing this tool. This "spec" document is the result of an agent-skills-driven workflow that I've been using in development of the tool, and it reflets our current spec for the tool itself.

As you can probably surmise, it operates as a "drill-down" interview with the user to resolve "what they want to build" from a high-level down to details, but only to a level that is so far typical for coding assistants, and so far, this is in a form which is designed to lend itself well to planning, namely a markdown document like this one

</turn>

<turn index="004" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Got the full text — thank you. These two pieces fit together well and I think reading them in tandem actually clarifies more than either alone. Let me try to draw out what I see as the productive structure, especially through the lens of what you're trying to do.

## How the two pieces relate

Lahiri's paper is the **map**; Midspiral's is one specific **territory**. Lahiri lays out a four-level spectrum — tests → code contracts → logical contracts → DSLs — and argues the spectrum is *complementary*, not alternative. Midspiral has picked one specific point on it (logical contracts in Dafny) and built an end-to-end pipeline. The Midspiral "Why Dafny?" sidebar makes this pragmatic choice explicit: JS compilation is first-class, SMT automation is good enough, and they're verifying programs rather than mathematics.

For your spec elicitation tool, this matters because **"tightening" doesn't have to mean jumping to Dafny.** The Lahiri spectrum gives you a progression: you can tighten the loosest parts of your current spec into tests, tighten tests into postconditions, tighten postconditions into invariants, and only escalate to logical contracts where the value warrants it. This is exactly the "thinnest validated artifact" discipline you've been working with on Black Triangles, applied to specifications instead of code. The right level for *eliciting* may not be the right level for *enforcing*, and the tool can make this layered structure explicit.

## The deep problem: the validation oracle

The single most important sentence in the Lahiri paper, for your purposes, is this: *"there is no oracle for specification correctness other than the user."* Both papers acknowledge this and neither solves it. This is the question that your spec elicitation tool actually exists to address — everything else is engineering around it.

The reason it's hard is structural. With code, you can run tests against it. With a spec, what do you run? Lahiri's answer (Lahiri 2024 + Endres et al.) is to evaluate specs against tests using soundness and completeness metrics:

- **Soundness**: the spec doesn't reject valid I/O pairs.
- **Completeness**: the spec rejects mutated (incorrect) outputs.

This is genuinely useful — it gives you a proxy oracle, even when no implementation exists yet. The "common elements" example on page 7 is striking: a Dafny spec that expert reviewers labeled "strong" was actually incomplete because they used `==>` where `<==>` was needed, and the empty list trivially satisfied it. Automated symbolic testing caught what humans missed. **You probably want this kind of metric inside your tool from very early on**, even if you never go anywhere near Dafny — because the same idea works on plain-language postconditions or pseudo-formal assertions: do they pass on inputs the user has affirmed, and do they fail on outputs the user has rejected?

The Midspiral piece also acknowledges this honestly under "Specification correctness is assumed, not verified" and "LLMs may modify your specification." The latter is interesting and underdiscussed: when proof fails, the LLM sometimes tries to fix the spec rather than the implementation. Their candid admission is that this is sometimes good (it surfaces over-constraints) and sometimes bad (silent drift). For your tool, that points at a concrete feature: **a structured changelog over the spec, with attribution (human vs. agent) and rationale per change.** Midspiral lists this as future work; you could lead on it.

## TiCoder is the elicitation pattern worth studying closely

The most directly applicable thing in the Lahiri paper for your tool is the TiCoder workflow (Figure 3, page 7). It inverts the usual elicitation flow:

- *Naive flow*: user writes spec → tool checks code against spec.
- *TiCoder flow*: tool generates candidate code; tool generates tests at points where candidates *disagree*; user labels yes/no/undef on the tests.

This shifts the user's cognitive task from **authoring formality** to **recognizing intent in concrete examples**. The latter is dramatically easier — most people can tell you whether `[1,2,2,3] → [1,3]` matches their intent even when they can't write the postcondition that distinguishes it from `[1,2,2,3] → [1,2,3]`. The reported numbers (40% → 84% on correct evaluation, with reduced cognitive load) are big enough to be worth taking seriously.

The deeper principle: **ambiguity-targeted disambiguation.** You don't ask the user about everything. You ask about exactly the points where plausible interpretations diverge. This connects directly to your "active interviewing" methodology — TiCoder is essentially active interviewing automated against a search space of candidate implementations.

## What I'd take from the Midspiral architecture

The kernel/domain/AppCore separation is the part of the Midspiral piece I'd think hardest about, because it generalizes beyond Dafny. The factoring is:

- **Kernel**: a generic, proven-once pattern of state evolution (replay, authority, multi-collaboration). Parameterized over a domain. Doesn't know what the state means.
- **Domain**: app-specific `Model`, `Action`, `Inv`. Must satisfy the kernel's proof obligations.
- **AppCore**: glue layer wiring a specific domain to a kernel.

The proof obligation `ApplyPreservesInv: Inv(m) ∧ Valid(m,a) ⟹ Inv(Apply(m,a))` is the universal contract: *if the rules held before the action, they hold after*. Everything else is plumbing.

Now here's where this connects sharply to your work: **a Coloured Petri Net is structurally a kernel in this sense.** It externalizes the legal-move machinery from the application semantics. The transitions of a CPN are precisely `Valid(m,a)` predicates; the firing rule is `Apply`; the place invariants are `Inv`. The four-way illegality test you've been working with — ungrounded, uncheckable, non-monotone in trust, irreversible without reason — is essentially a richer `Valid` predicate that goes beyond functional correctness into trust dynamics.

So one productive way to read these papers is: **Midspiral's "kernel" pattern is one specific shape of formalism for legal-move externalization. Yours is a different one, with stronger structural properties (concurrency, decidable reachability for some classes, native multi-token semantics).** The intent-formalization frame applies cleanly: a CPN is a spec that lives somewhere between code contracts and a DSL on Lahiri's spectrum.

## Concrete suggestions for the elicitation tool

A few things I'd be considering, given all of the above:

**1. Design for the spectrum, not a level.** Treat tests, postconditions, invariants, and (eventually) structural specs as artifacts that *coexist* and validate each other. Tests validate postconditions; postconditions surface invariant candidates; invariants anchor any heavier verification you reach for later. The Lahiri footnote on page 5 makes this complementarity explicit and it's a strong design principle.

**2. Build the spec validator before the spec generator.** It's tempting to start with "extract a spec from the user's words." But the validator is the harder and more valuable artifact — and once you have it, you can crank generators against it iteratively. Soundness/completeness over a growing test suite is a tractable starting metric.

**3. Make ambiguity the user-facing surface.** TiCoder generates tests *at points of disagreement among candidates*. That principle generalizes: anywhere your tool can produce two semantically distinct interpretations of the same prompt, that's where you should ask. Avoid asking about anything else.

**4. Track spec provenance and drift.** If LLMs are co-authoring specs, you need a structured record of what changed, who changed it, and why. This is implicit in your interest in claims records and behavioral observability — applied here, it gives you a "spec git log" that Midspiral hand-waves about as future work.

**5. Surface the spec, in human form, before any heavy machinery runs.** Midspiral's lesson learned ("a more transparent and efficient workflow would surface the generated domain obligations... back to the user in a human-readable form before proof generation begins") is generalizable. Don't make users review the spec embedded in compiled artifacts; make spec review a deliberate, designed step.

## Honest limitations worth holding onto

A few productive doubts I'd carry into the design:

The intent-formalization frame has been demonstrated mostly on **algorithmically clean, self-contained tasks** — `remove_duplicates`, `common_elements`, parsers from RFC text. Real production software has UX judgment, fuzzy requirements, evolving stakeholder context. The Lahiri "research agenda" (page 8) honestly lists "from benchmarks to real-world systems" as the first open problem. Your tool's value is going to depend heavily on whether the *parts* of your users' systems where formalization pays off can be cleanly separated from the parts where it doesn't.

Also: intent isn't a fixed object. People discover what they want by seeing the system behave. So spec elicitation is iterative learning, not extraction. Both papers gesture at this (TiCoder's iteration loop, Midspiral's "iterate" arrow in the workflow diagram) but neither develops it. This is plausibly where your tool can contribute something neither has: an elicitation model that treats the user's intent as something *being discovered* in dialogue with concrete behavioral examples and emerging structural constraints.

If it would help, the next thing I'd want to dig into is what *specifically* your current spec representation looks like — whether the path forward is mostly "add a tests layer," mostly "add CPN-shaped structural commitments," or mostly "add a validator over what you already have."

</turn>

<turn index="005" role="user" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Yes it would be helpful to see what more formal versions of the invariants, and also formal projections of the assumptions and lexicon, might look like; and also to dig deeper on how to tie acceptance criteria to requirements, in a way that doesn't leave a gap drift or disagreement

</turn>

<turn index="005" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Reading this, my first reaction is that you've undersold yourself. This isn't an informal spec — it's quite formally structured, just not in the dimension the Lahiri/Midspiral pieces measure formality along. That distinction is, I think, the most useful frame for thinking about what to tighten.

## The structure is already doing real work

What's "informal" here is the *content* of each item — natural language predicates, not Dafny postconditions. But the *frame* is doing significant formal work:

- A typed ontology over the items themselves: `requirement`, `assumption`, `decision`, `invariant`, `criterion`, `term`. The same ontology your tool elicits, applied to your tool — pleasingly self-referential.
- A cross-reference graph: invariants `Protect` and `Prove`, decisions `Supersede` and `Depend on`, assumptions are tied to validation approaches and dependent decisions, tests are mapped to invariants.
- Provenance and staleness ("Pruned 2026-04-23"), explicit confidence calibration on assumptions, an `Acknowledged Blind Spots` table that names *exactly* what isn't being checked and what would trigger a revisit.
- A lexicon discipline (R23) that asserts the ontology is "projected consistently through schema, shared registries, observer prompts, API types, fixtures, and UI copy" — i.e. a refinement contract between layers.

None of this is in Lahiri's spectrum, and only the first three are visible in Midspiral's structure. Both papers focus on *checkability*. Your format is doing something different: making the spec's own **epistemic state** legible — what's chosen, what's bet on, what's known unknown, what would invalidate each piece.

So I'd reframe the question. There are two orthogonal axes of "tightening" you could move on:

1. **Checkability** — the Lahiri axis. How mechanically verifiable is each item?
2. **Epistemic legibility** — yours. How visible are uncertainty, provenance, and dependencies between items?

Most of the literature focuses on (1). You've already invested heavily in (2), perhaps further than most published work. The interesting question is which axis to push next.

## Where the existing structure naturally wants to escalate

A few specific opportunities I see, leaning on the papers:

**Invariants → executable predicates.** Of all your categories, `Critical Invariants` is the one most clearly homologous to Lahiri's "logical contracts" or Midspiral's `ApplyPreservesInv`. Each I-item is already a statement that something *must remain true* across some seam, paired with the test files that exercise it. The natural escalation is to make the invariants themselves first-class artifacts — predicates evaluable independent of any one test, expressible as runtime assertions or property-test predicates. That gives you Lahiri's *soundness/completeness* leverage: do your existing tests entail the invariant? Could a mutation pass them while breaking the predicate? Right now an invariant like I48 ("Canonical knowledge kinds persist with provenance and project through typed entity collections... without ontology drift") only exists as prose plus a list of tests asserted to cover it. Promoting these to predicates wouldn't require Dafny — TypeScript runtime assertions, fast-check properties, or even invariant-witness functions paired with each item would close a real gap.

**Lexicon → checked refinement.** R23 is already a refinement contract in disguise. "Defined once and projected consistently" is precisely the kind of property that wants mechanical checking: a single source of truth for the ontology, with derived schema, types, fixtures, and observer prompts that can be statically verified against it. This is among the cheapest formality wins available — and probably the highest leverage, since it's the one place your spec actually claims a property *across* the artifact constellation.

**Acceptance Criteria → TiCoder-shaped disambiguation.** Your 21 Acceptance Criteria are aggregated re-statements of the 33 Requirements. The relation between them isn't formal — it's editorial. The Lahiri/TiCoder intuition is that this gap is exactly where ambiguity hides: a Requirement and an Acceptance Criterion can both feel "right" while disagreeing about edge cases. If you generate concrete behavioral examples that *distinguish* plausible readings of each criterion and ask the user yes/no, you collapse the ambiguity into approved tests that persist as regression artifacts. This is the cheapest checkability investment available and has the largest reported effect size in the paper (40% → 84% correct evaluation).

**Assumptions are already shaped for spec validation.** Your `Validation approach` column for each assumption is, structurally, a falsification recipe. That's striking — most spec formats don't track this at all. The natural next move is to make those approaches first-class plans rather than prose: "A66 is validated by [observer corpus probe X]" with a mechanical link to the actual probe artifact. Then "open" assumptions become a queue, and "validated" / "falsified" become structural transitions you can audit.

## The recursive observation

Brunch's spec being a Brunch-shaped artifact is structurally interesting, and I'd push it harder: **the elicitation flow is itself a workflow**, and a CPN reading falls out almost for free. The four phases are places; interview moves are transitions; colored tokens are knowledge items typed by your ontology; phase closeability and readiness are place invariants. Modeling Brunch this way would let the tool's own behavior carry the same kind of formal commitments it elicits from users. That's not a near-term suggestion — but it does mean that a CPN substrate underneath Brunch isn't a foreign import; it's a refinement of what's already implicit in your phase model.

## What I'd actually do next

If forced to pick one move: **make the invariants and the lexicon executable, before touching anything else.** Both have natural homes in your existing format, both are cheap relative to where they sit on the Lahiri spectrum, and both would give you a *checkable property* your current spec gestures at but cannot enforce. Once those exist, the question of whether to push further toward Dafny-style logical contracts becomes empirical — you'll have evidence about where prose-plus-tests is leaving real bugs uncaught, and where it isn't.

The thing I'd resist is trying to formalize Requirements 1–33 wholesale. Many of them are about UX shape ("the user must not be stranded with a bare generic composer") that is genuinely judgment-dependent. The Lahiri paper's first acknowledged limitation — "scaling beyond benchmark problems" — is exactly this: the parts of your system that warrant heavy formality and the parts that don't aren't uniformly distributed, and a tool that pretends otherwise will burn user attention on the wrong things.

If it'd help, I could sketch what an "executable invariant" version of one or two specific I-items in your file would look like — that might make this concrete faster than continuing in the abstract.

</turn>

<turn index="006" role="user" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

OK great, that's very interesting. I feel like some of the assertions you framed out would at least be partly covered (or reasonably assured) by good typing (discriminated unions, even branded types, etc.); but the greater formalism is better, and in any case is probably a win for the LLM collaboration workflow. Do you see opportunities to close these gaps by augmenting the data model of these items? Should requirements and criteria be more closely bound? I have wondered more than once whether they might even want to be the same thing (the latter a property on the former), but I do think there can be cases where a criterion is driven by more than one requirement, or a single requirement spans multiple criteria

</turn>

<turn index="006" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

I'll work through one good example of each, using actual items from your SPEC.md so the moves are grounded in your real material.

## Invariant → executable predicate

Take **I48**: *"Canonical knowledge kinds persist with provenance and project through typed entity collections, stable per-kind reference codes, turn-linked capture projection, and graph edges without ontology drift."*

In prose this is one invariant; mechanically it's a conjunction of five properties over workspace state. The move is to write the predicate once and let tests *apply* it rather than *encode* it:

```typescript
// invariants/i48.ts — the predicate IS the invariant
export type InvariantResult =
  | { satisfied: true }
  | { satisfied: false; violations: Violation[] };

export function I48_OntologyIntegrity(state: WorkspaceState): InvariantResult {
  const violations: Violation[] = [];

  // (a) every persisted item has provenance + canonical kind
  for (const item of state.knowledgeItems) {
    if (!item.provenance) {
      violations.push({ code: 'I48.a', itemId: item.id, msg: 'missing provenance' });
    }
    if (!CANONICAL_KINDS.includes(item.kind)) {
      violations.push({ code: 'I48.a', itemId: item.id, msg: `non-canonical kind ${item.kind}` });
    }
  }

  // (b) per-kind reference codes are stable: each item's code matches its
  //     position in the kind-scoped insertion order
  for (const kind of CANONICAL_KINDS) {
    const items = state.knowledgeItems
      .filter(i => i.kind === kind)
      .sort((a, b) => a.createdAt - b.createdAt);
    items.forEach((it, idx) => {
      const expected = `${REF_PREFIX[kind]}${idx + 1}`;
      if (it.code !== expected) {
        violations.push({ code: 'I48.b', itemId: it.id, msg: `code ${it.code}, expected ${expected}` });
      }
    });
  }

  // (c) every item links back to a turn that exists on the active path
  const activeTurns = new Set(state.activePath.map(t => t.id));
  for (const item of state.knowledgeItems) {
    if (!activeTurns.has(item.sourceTurnId)) {
      violations.push({ code: 'I48.c', itemId: item.id, msg: 'orphan or off-path turn link' });
    }
  }

  // (d) graph edges reference live items
  const itemIds = new Set(state.knowledgeItems.map(i => i.id));
  for (const e of state.knowledgeEdges) {
    if (!itemIds.has(e.from) || !itemIds.has(e.to)) {
      violations.push({ code: 'I48.d', edgeId: e.id, msg: 'edge to/from missing item' });
    }
  }

  return violations.length ? { satisfied: false, violations } : { satisfied: true };
}
```

Now this predicate becomes a load-bearing artifact. Several things become possible that aren't possible today:

- **Tests apply it instead of redefining it.** Each test in your `Protected by` column sets up a state and calls `I48_OntologyIntegrity(state).satisfied`. The invariant has one canonical statement; tests are witnesses, not paraphrases.
- **Property-based testing.** Generate random sequences of capture/edit/revisit operations against a fixture, check the invariant holds after each. This catches drift the example-based tests don't see.
- **Runtime checking in dev.** A middleware that asserts `I48` after every observer write — failed predicate becomes a stack trace, not a silent corruption.
- **Soundness/completeness in the Lahiri sense.** You can mutate a state (introduce a deliberate orphan edge, rename a code) and ask: does any test still fail? If not, your tests under-cover the predicate. This is a measurable spec quality metric.

The same move applies to I54 (phase-aware capture), I72 (phase outcomes), I101 (preface-card persistence). Each becomes a function `Ixxx(state): InvariantResult`.

A subtlety worth naming: some of your invariants are over **state**, others over **transitions**. I48 is a state invariant — true at any moment. I105 ("Grounding/design structured-response turns can unlock the next frontier before observer capture finishes") is a transition invariant — it constrains what's allowed to happen, not what's true. The latter wants a slightly different shape:

```typescript
// transition invariants check (state, action, state')
export function I105_FrontierUnlock(
  before: WorkspaceState,
  action: TurnSubmitted,
  after: WorkspaceState
): InvariantResult { /* ... */ }
```

This is exactly Midspiral's `ApplyPreservesInv` shape. Splitting your invariants into state-level vs transition-level makes the predicate types crisper.

## Lexicon → checked refinement

R23 ("the knowledge ontology is defined once and projected consistently...") is the easiest formal win in the file because the artifact-to-artifact relationship is mechanical, not semantic. Define once:

```typescript
// ontology/kinds.ts — the source of truth
export const KNOWLEDGE_KINDS = {
  goal:       { refPrefix: 'G',  label: 'Goal',       capturedIn: ['grounding', 'design'] },
  term:       { refPrefix: 'T',  label: 'Term',       capturedIn: ['grounding'] },
  context:    { refPrefix: 'C',  label: 'Context',    capturedIn: ['grounding'] },
  constraint: { refPrefix: 'X',  label: 'Constraint', capturedIn: ['grounding', 'design'] },
  decision:   { refPrefix: 'D',  label: 'Decision',   capturedIn: ['design'] },
  assumption: { refPrefix: 'A',  label: 'Assumption', capturedIn: ['grounding', 'design'] },
} as const;

export type KnowledgeKind = keyof typeof KNOWLEDGE_KINDS;
export const CANONICAL_KINDS = Object.keys(KNOWLEDGE_KINDS) as KnowledgeKind[];

// requirement, criterion intentionally absent — these only materialize
// through accepted review outputs (per R22, I54). Encoded as a separate
// REVIEW_OUTPUT_KINDS table, not bolted onto KNOWLEDGE_KINDS.
```

Now the drift check is a single test file:

```typescript
// drift.test.ts
describe('R23: ontology projects consistently', () => {
  it('schema enum matches canonical kinds', () => {
    expect([...DB_KIND_ENUM].sort()).toEqual([...CANONICAL_KINDS].sort());
  });

  it('observer prompt mentions every canonical kind exactly once in the kind list', () => {
    const prompt = readObserverPrompt();
    for (const k of CANONICAL_KINDS) {
      expect(prompt.match(new RegExp(`\\b${k}\\b`, 'g'))?.length).toBeGreaterThan(0);
    }
    // and no non-canonical kinds slip in
    const mentioned = extractKindMentions(prompt);
    expect(mentioned).toEqual(expect.arrayContaining(CANONICAL_KINDS));
    expect(CANONICAL_KINDS).toEqual(expect.arrayContaining(mentioned));
  });

  it('every kind has UI copy', () => {
    for (const k of CANONICAL_KINDS) expect(UI_KIND_LABELS[k]).toBeDefined();
  });

  it('every fixture builder produces only canonical kinds', () => {
    for (const f of ALL_FIXTURE_BUILDERS) {
      const state = f();
      for (const item of state.knowledgeItems) {
        expect(CANONICAL_KINDS).toContain(item.kind);
      }
    }
  });

  it('non-goal is encoded as a constraint subtype, not a top-level kind', () => {
    expect(CANONICAL_KINDS).not.toContain('non-goal');
    // and the subtype slot exists
    expect(CONSTRAINT_SUBTYPES).toContain('non-goal');
  });
});
```

What you've gained: R23 is no longer a hopeful sentence. The build either holds or breaks, and any drift introduced by an LLM editing a prompt or a hand-edit to a schema becomes a CI failure with a precise location. This also addresses Midspiral's "LLMs may modify your specification" risk in microcosm — drift is mechanically catchable for everything that touches the ontology.

## Assumption → probe

Take **A48**: *"Knowledge-graph edges are sufficient to drive accurate cascade preview for revisit work."* Validation approach: *"Structural cascade tests plus manual judgment about scope."*

The looseness here isn't bad — A48 is honestly uncertain. But "sufficient" and "accurate" are unmeasured terms, which means the assumption can't move from `open` to `validated` without further editorial work. The formal projection is to commit to a measurement:

```typescript
// probes/a48-cascade-accuracy.ts
type CascadeProbe = {
  name: string;
  fixture: () => WorkspaceState;
  revisedItem: KnowledgeItemId;
  // ground truth: what a careful human says is actually affected
  humanJudgedAffected: Set<KnowledgeItemId>;
  thresholds: { precisionMin: number; recallMin: number };
};

const PROBES: CascadeProbe[] = [
  {
    name: 'cross-phase decision link',
    fixture: () => crossPhaseDecisionLinkScenario(),
    revisedItem: 'D80',
    humanJudgedAffected: new Set(['I48', 'A49', 'R10']),
    thresholds: { precisionMin: 0.7, recallMin: 0.9 }, // recall matters more
  },
  // ... more probes
];

export function evaluateA48(): A48Verdict {
  const results = PROBES.map(p => {
    const predicted = computeCascadeFromEdges(p.fixture(), p.revisedItem);
    const truth = p.humanJudgedAffected;
    const tp = setIntersection(predicted, truth).size;
    const precision = predicted.size ? tp / predicted.size : 1;
    const recall = truth.size ? tp / truth.size : 1;
    return {
      probe: p.name,
      precision, recall,
      passes: precision >= p.thresholds.precisionMin
           && recall >= p.thresholds.recallMin,
    };
  });
  const allPass = results.every(r => r.passes);
  return { status: allPass ? 'validated' : 'falsified-or-open', results };
}
```

The interesting effect of writing this is what it forces *upstream*: the act of committing to thresholds and ground-truth probe sets compels you to specify what "accurate cascade preview" actually means. You stop being able to handwave "sufficient." The Lahiri paper's deepest point — *you cannot improve what you cannot measure* — applies here in miniature.

A subtle but important payoff: the assumption's **status** field becomes derivable, not editorial. `open` = no probes run since last change to relevant code; `validated` = all probes pass; `falsified` = at least one fails. This kills the "still says `open` six months later because nobody updated the table" failure mode that is endemic to long-lived assumption registers.

## Acceptance Criteria ↔ Requirements

This is the subtlest one and the place I think your file has a real, currently-invisible gap. Looking at AC1–AC21 next to R1–R33, the relationship is editorial — there's no mechanical link, and the two were almost certainly written at different times with different framings. AC1 says "local-first persistence in `.brunch/`"; R1 says "state in local `.brunch/`" and adds the API key requirement. Are these the same property? You and I can probably say "yes," but a future contributor or an agent editing the file can't tell, and the gap is exactly where drift lives.

I'd separate this into three structural relationships, because the same `AC↔R` link is doing different work in different rows.

**Relationship 1 — AC is an aggregate observable for several R's.** AC11 ("Grounding/design use workspace-owned turn cards... structural kickoff/recovery/handoff/completion affordances project without a bare generic composer") is observably true only when R17, R18, R25 (and possibly R20–22) are simultaneously satisfied. The fix is to make this explicit:

```typescript
// acceptance/ac11.ts
export const AC11 = {
  description: 'Grounding/design use workspace-owned turn cards…',
  derivedFrom: ['R17', 'R18', 'R25'] as const,
  observable: (state: WorkspaceState) => {
    return R17_check(state) && R18_check(state) && R25_check(state);
  },
};
```

And then a meta-test:

```typescript
it('every requirement is referenced by at least one acceptance criterion', () => {
  const referenced = new Set(ALL_AC.flatMap(ac => ac.derivedFrom));
  const missing = ALL_REQUIREMENTS.filter(r => !referenced.has(r.id));
  expect(missing).toEqual([]);
});
```

This is structurally trivial but catches an entire class of drift: a Requirement added without an Acceptance Criterion to observe it.

**Relationship 2 — AC is a refinement of R at a coarser observable layer.** AC1 is a coarse-grained restatement of R1. The right encoding is *AC1 must be implied by R1*, not the reverse. Then ambiguities about whether AC1's "start" entails R1's "opens working app in browser" become explicit reductions:

```typescript
// AC1 holds whenever R1 holds
export const AC1 = {
  description: 'npx brunch can start from a workspace directory…',
  impliedBy: ['R1'] as const,  // R1 ⟹ AC1
  // optional: the aspects of R1 that AC1 weakens
  weakening: ['API_KEY presence not surfaced at AC level'],
};
```

This makes the abstraction explicit. If R1 changes, you can ask: does AC1's `impliedBy` still hold? It also surfaces the *intentional* gaps — AC1 deliberately doesn't mention the API key because the AC layer is for a higher-fidelity reader. That's a defensible editorial choice, but right now nothing in your file *records* that it was a choice.

**Relationship 3 — TiCoder-style disambiguation for cases where the relationship is ambiguous.** This is the real win. For any AC↔R pair where reasonable readers could disagree about whether they're saying the same thing, generate concrete scenarios that force the question. Take R1 vs AC1 again:

```typescript
const R1_AC1_disambiguators: Scenario[] = [
  {
    label: 'no API key',
    setup: () => runWith({ env: {} }),
    candidateOutcomes: [
      'fails immediately with clear error',
      'starts but enters degraded mode',
      'starts and prompts for key in UI',
    ],
    pinnedAnswer: undefined, // ← user fills this in once, becomes regression test
    distinguishes: 'Does AC1 hide an API-key dependency that R1 makes explicit?',
  },
  {
    label: 'browser opens automatically vs URL printed',
    setup: () => runIn(tmpDir),
    candidateOutcomes: ['browser opens automatically', 'URL printed for manual open'],
    pinnedAnswer: undefined,
    distinguishes: 'Does R1\'s "opens" mean auto-open or available-to-open?',
  },
  {
    label: '.brunch/ already exists with prior state',
    setup: () => runIn(dirWithExistingBrunch),
    candidateOutcomes: ['resumes silently', 'shows resume prompt', 'starts fresh'],
    pinnedAnswer: undefined,
    distinguishes: 'Is "start" inclusive of resume?',
  },
];
```

A user (or you) labels each scenario once. The labels become **the canonical disambiguation** — they pin down what R1 and AC1 actually commit to, in a form that's executable as a regression test. The TiCoder paper's reported effect (40% → 84%) is large because this is exactly the kind of latent ambiguity that prose specifications hide and concrete examples expose.

You don't need to do this for every AC/R pair — only the ones where the relationship type isn't obviously (1) or (2). The signal that you need a TiCoder-style probe is exactly when you can't decide whether an AC and an R are saying the same thing, or when an LLM agent and a human reader would plausibly read them differently.

## What this gives you, structurally

After these moves:

- Every Critical Invariant has an executable witness (a predicate that can be checked over any state, not just the states tests happen to construct).
- Every Assumption has either probes that derive its status, or an explicit "deferred — qualitative only for now" marker that's distinct from "open."
- The Lexicon has a build-time refinement check across all derived artifacts.
- Every Acceptance Criterion declares its relationship to underlying Requirements as one of (aggregate / refinement / TiCoder-pinned), and orphan Requirements (no AC observing them) become a CI failure.

None of this is Dafny. It's all reachable from where your spec already lives. What it does is upgrade the cross-references from editorial commitments — a human asserting "I48 protects R22, R23" — to mechanical commitments that break the build when they stop holding. That's the hinge the two papers were circling: not "is the spec formal?" but "is the spec's claimed structure *checkable*?" Your existing structure was already richer than most. These moves make it load-bearing.

If any of these moves looks worth pulling on first, I'd start with the Lexicon check — it's the cheapest, has the largest immediate payoff, and gives you the experience of "specification became a CI artifact" before you commit to the more ambitious work on invariants and AC/R relationships.

</turn>

<turn index="007" role="user" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Ok so we're wading in to some deeper water now

For clarity: we're now talking about the ontologies and methodologies I'm using to develop brunch, no longer the ones it elicits, and even as it stands–as I'm sure you've noticed—the ontology that is *used* within this [SPEC.md](http://SPEC.md) file is not exactly the same as the one it *describes* as that which brunch product should help elicit, and then output: our product does not yet have invariants for example, nor do we have verification strategy mapping, let alone the newer models we're describing here
So, sticking with *building brunch* as the reference frame: I'll have to rewrite the agent-skills that I've been using to develop this, so that they are oriented to build and use this more advanced ontology; but one tension I anticipate here, is that the added structural complexity and inevitable added housekeeping (routine checking, reconciliation, retirement) that is involved is a strain on the LLM. I wonder if we can also make the WIP SPEC itself more verifiable for the contributing LLM coding assistant, than it currently is as a large document which must be continually parsed for structured data

</turn>

<turn index="007" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Yes — and this is the deepest part of the question, because the relationship between Requirements and Criteria is doing more conceptual work than your current flat layout makes visible. Let me work through both halves.

## How much typing actually buys you

You're right that a chunk of what I framed as "drift checks" is just type discipline that's been left as runtime convention. The minimum viable upgrade is something like:

```typescript
// branded ids — kinds can't be confused at use sites
type RequirementId = string & { readonly __brand: 'Requirement' };
type CriterionId   = string & { readonly __brand: 'Criterion' };
type PropertyId    = string & { readonly __brand: 'Property' };

// closed kind enum — non-goal cannot exist as a top-level kind
const CANONICAL_KINDS = ['goal', 'term', 'context', 'constraint',
                          'decision', 'assumption'] as const;
type KnowledgeKind = typeof CANONICAL_KINDS[number];

// non-goal lives where it belongs: as a constraint subtype
type Constraint =
  | { kind: 'constraint'; subtype: 'limit'; /* ... */ }
  | { kind: 'constraint'; subtype: 'non-goal'; /* ... */ };
```

Combined with `assertNever` in switch defaults, this kills cross-kind id confusion, the "non-goal as top-level kind" failure mode, and ungated kind handling. Most of the build-time check I wrote for the lexicon collapses to "if it compiles, the projection is consistent."

What types **don't** get you, even with branding and dependent-flavored tricks:

- That a predicate function's *body* matches what its *name and description* claim. `I48_OntologyIntegrity: (state) => InvariantResult` is well-typed whether or not it actually checks ontology integrity.
- Global graph properties at compile time — e.g., "every Requirement is observed by at least one Criterion." You can get partway with const-asserted arrays plus conditional types, but practically this wants a build-time validator pass over the spec graph.
- Semantic alignment between prose and predicate, full stop.

So a usable rule of thumb: **types pin shape; build-time validators pin graph properties; tests pin behavior; only the human pins semantic alignment between a prose claim and what's actually checked.** Each layer covers what the layer below cannot.

## On unifying Requirements and Criteria

I'd argue *neither merge nor leave as siblings* — factor out the primitive they both reference, and let each be a structured view over it.

The reason your "make criterion a property of requirement" instinct keeps not quite landing is that it conflates two different things:

- A Requirement is a **commitment** — "the system shall maintain P." Normative.
- An Acceptance Criterion is an **observation** — "we recognize P holds by observing O in scenario S." Epistemic.

These are sentences about the same proposition P, in different modes. They're 1:1 when the proposition is trivially its own witness; they're M:N when commitment and observation aggregate at different granularities — which they often do, because you commit at the level of "this thing must always be true" and observe at the level of "here's a coherent scenario that demonstrates it."

The factoring that gives you both:

```typescript
// the shared primitive: a checkable claim
type Property = {
  id: PropertyId;
  description: string;
  predicate?: (state: WorkspaceState) => InvariantResult;
  shape: PropertyShape;
};

type PropertyShape =
  | { kind: 'state-invariant' }
  | { kind: 'transition-invariant'; over: ActionKind[] }
  | { kind: 'reachability'; goal: PropertyId }
  | { kind: 'liveness'; eventually: PropertyId }
  | { kind: 'observable-only'; mode: 'walkthrough' | 'qualitative' };

// commitment: the system shall guarantee these properties
type Requirement = {
  id: RequirementId;
  description: string;
  commits: PropertyId[];     // M:N
  rationale?: string;
};

// witness: how we recognize satisfaction
type AcceptanceCriterion = {
  id: CriterionId;
  description: string;
  observes: PropertyId[];    // M:N — possibly across many requirements
  observationMode: ObservationMode;
};

type ObservationMode =
  | { kind: 'unit-test'; locator: string }
  | { kind: 'integration-test'; locator: string }
  | { kind: 'property-test'; generator: string }
  | { kind: 'manual-walkthrough'; scenarioId: string }
  | { kind: 'runtime-assertion' };
```

The M:N falls out cleanly:

- **AC1↔R1 case:** AC1 `observes` the same Property set R1 `commits` to → direct witness, 1:1.
- **AC11 aggregate case:** AC11 `observes` the union of properties committed across R17, R18, R25 → coarser observable, M:1.
- **Multi-witness case:** A Property R7 commits to is observed by both AC4 (unit test) and AC18 (manual walkthrough) → 1:M.

Invariants don't need their own type anymore — they're Properties with `shape.kind === 'state-invariant'` or `'transition-invariant'`, referenced by whatever criteria exercise them. That collapses one whole row of the existing format into the same primitive.

## What this enables structurally

Once Properties are the load-bearing item, the spec becomes a graph you can ask questions of:

```typescript
function validateSpec(spec: Spec): ValidationResult {
  // 1. every committed property is observed by some criterion
  const observedProps = new Set(spec.criteria.flatMap(c => c.observes));
  for (const r of spec.requirements) {
    const unobserved = r.commits.filter(p => !observedProps.has(p));
    if (unobserved.length) report(`${r.id} commits to unobserved properties: ${unobserved}`);
  }

  // 2. every observed property is committed to by some requirement
  // (catches drift where a criterion observes a no-longer-relevant property)
  const committedProps = new Set(spec.requirements.flatMap(r => r.commits));
  for (const c of spec.criteria) {
    const orphans = c.observes.filter(p => !committedProps.has(p));
    if (orphans.length) report(`${c.id} observes orphan properties: ${orphans}`);
  }

  // 3. every property with a predicate has at least one criterion that exercises it
  for (const p of spec.properties.filter(p => p.predicate)) {
    if (!spec.criteria.some(c => c.observes.includes(p.id))) {
      report(`${p.id} has a predicate but no exercising criterion`);
    }
  }

  // 4. observable-only properties have at least one walkthrough criterion
  for (const p of spec.properties.filter(p => p.shape.kind === 'observable-only')) {
    const observers = spec.criteria.filter(c =>
      c.observes.includes(p.id) && c.observationMode.kind === 'manual-walkthrough'
    );
    if (!observers.length) report(`${p.id} is observable-only but has no walkthrough scenario`);
  }
}
```

Check 2 is the one I think is highest-value for your LLM-collaboration concern, because it catches the failure mode where an agent edits an Acceptance Criterion to observe something no Requirement commits to anymore. Right now this is invisible drift; with the factoring, the next CI run flags it.

## Mapping back to your existing items

Concretely, against the SPEC.md you shared:

- **R1** ("npx brunch in a project directory with `ANTHROPIC_API_KEY`...") factors into roughly three Properties: `P_starts_in_cwd`, `P_requires_anthropic_key`, `P_browser_app_opens_with_persistence_in_brunch_dir`. R1 commits to all three.
- **AC1** ("npx brunch can start from a workspace directory with local-first persistence") observes the first and third, plus `P_brunch_dir_is_authoritative`. AC1 deliberately drops `P_requires_anthropic_key` — probably because at AC granularity that's an unstated prerequisite. **The factoring makes that omission visible**: AC1 is recorded as a partial witness, not an alternate framing of R1, and you can decide whether the omission is intentional.
- **R17/R18/R25** all commit to Properties about the workspace-stream affordance discipline. **AC11** observes the union. The aggregate relationship goes from editorial to structural.
- **I48** becomes a Property with `shape.kind === 'state-invariant'` and a real predicate. The criteria that "protect" it (`db.test.ts`, etc.) become Criteria with `observationMode.kind === 'unit-test'` and a `locator` pointing at the file. The "Protected by" / "Proves" cross-references in your current invariants table are reconstructible from the graph rather than maintained by hand.

A useful diagnostic during the migration: **count the Properties relative to R + AC.** If the count is *much smaller*, your prose items had heavy overlap (the same claim restated under different names) and the factoring just exposed it. If *much larger*, your items were compound (each prose item carried multiple distinct claims), and the factoring is letting you observe and witness them independently. Either signal is informative; both are diagnostic of structure that was previously invisible.

## Honest limits

A few things this still doesn't get you, worth keeping visible:

1. **Predicate-vs-prose alignment doesn't go away.** A Property's `predicate` body still has to mean what its `description` says, and no type system catches the mismatch. But the model concentrates that risk in one place (the Property) instead of distributing it across Invariant, Requirement, and Criterion rows that paraphrase each other.

2. **`observable-only` properties are honest fudges, and that's fine.** Some claims (story quality, transcript legibility, "doesn't feel bureaucratic") genuinely don't reduce to predicates. Marking them `observable-only` records "this is in the spec but not on the checkable axis" *in the type*, instead of pretending. Structurally this is what your Acknowledged Blind Spots table already does; this folds the pattern into the data model where the rest of the validators can see it.

3. **Property granularity is editorial.** Cut too fine and you have a thousand `P_n` items; too coarse and the M:N richness collapses. The principle I'd use: *cut at the granularity where you'd want to write a separate predicate.* If two prose claims share one predicate, they're the same property; if one prose claim needs two predicates to fully express, it's two properties.

4. **The mapping isn't free.** Migrating SPEC.md to this model is mechanical-ish but real work — you have to read each existing item and decide what claims it actually carries. The upside is that you only do this once; thereafter every new item is just `(commits | observes) → PropertyId[]`.

The thing I'd flag as the deepest payoff: this model makes "Requirement" and "Criterion" stop being parallel containers of prose and start being structured *uses* of a single underlying claim. That alignment is exactly what makes the spec legible to an agent collaborator. Right now an LLM editing your file has to infer the relationship between R1 and AC1 from paraphrase similarity. With the factoring, the relationship is referential — `r.commits ⊇ ac.observes` is something an agent can compute, not guess.

If you're tempted to start migrating, I'd start with one phase's worth of items (grounding, say) rather than the whole file at once. The first 3–5 properties you extract will tell you whether your existing prose was hiding more compound claims or more redundant ones, which changes the migration's character.

</turn>

<turn index="008" role="assistant" url="https://claude.ai/chat/cbb2233f-aa49-4068-a9ac-3c6f63a22fa4">

Yes, this is exactly the right tension to name, and it's actually the *generative* tension — once you take it seriously, it forces design choices that improve the methodology in ways that aren't obvious if you treat structure as a free good.

## Naming the tension precisely

Three forces are pulling against each other:

1. **Richer structure** (Property graph, M:N commits/observes, predicate alignment, validation passes) gives you better correctness signal and better LLM collaboration *once it's there*.
2. **Markdown-as-source** is great for human reading and bad for everything else: the LLM has to re-parse the whole document on every interaction, structural edits are textual surgery, and consistency is enforced by re-reading rather than by querying.
3. **Routine housekeeping** (staleness, supersession, cross-reference reconciliation, retirement) scales with structure — and as the document grows, the cost of "scan whole SPEC.md → reason about implications → emit careful patch" grows roughly quadratically.

The trap is treating this as a tradeoff to balance — accept some structural debt to keep cognitive load manageable. The better move is to recognize that **markdown-as-source is the actual bottleneck**, and the structural complexity becomes manageable once you separate the source-of-truth representation from the human-readable projection.

## The shift: SPEC as a queryable artifact, prose as a view

The reframe is one your product is *already implicitly using* — Brunch's typed knowledge layer is exactly this idea applied to user specs. The asymmetry is that you're eliciting structured artifacts for users while developing Brunch from a flat document. Closing that asymmetry is the move.

Concretely: store the spec as structured data (JSON, SQLite, TOML — whatever's lowest-friction for your stack), and render `SPEC.md` as a generated view. The LLM contributes by editing structured records via tools, not by patching prose. The generated markdown is a read-only artifact for humans, regenerated from the structured source.

```
spec/
  properties.json       # all Property records
  requirements.json
  criteria.json
  decisions.json
  assumptions.json
  predicates/           # one predicate file per Property that has one
    p_ontology_integrity.ts
    p_frontier_unlock.ts
  validators/           # the spec-graph checks
    orphan-properties.ts
    unobserved-commits.ts
  generate-spec-md.ts   # source → SPEC.md projection
SPEC.md                 # generated, committed, read-only
```

The shifts this enables, in order of payoff:

**The LLM stops parsing 500 lines to add one item.** Instead of "read SPEC.md, find the Requirements section, infer the next number, write a paragraph that matches the existing prose style, update the cross-reference tables in three other places, hope nothing else breaks," the operation becomes `add_property({ description, shape, predicate? })` followed by `link_requirement_to_property(r_id, p_id)`. The token cost of every contribution drops by an order of magnitude. So does the error rate.

**Validation runs as a side-effect of edits, not as a periodic audit.** Every structured edit triggers the validator suite. Orphan properties, unobserved commits, broken supersession chains, missing predicates — all surface synchronously during the edit, not at some later "I should reconcile the spec" moment. The "routine housekeeping" cost largely disappears because there's no batch to do later.

**Retirement and supersession become first-class operations** with mechanical effect, not editorial discipline. `retire_property(p_id, reason, supersededBy?)` sets a status flag, propagates to anything that referenced it, and the validators flag the consequences. You stop having to remember to prune, because pruning is a verb the LLM can use.

**Diffs become structural.** When an LLM proposes a change, you don't review prose edits — you review a structured diff: "added Property P34, linked R17 to commit it, retired P21 with rationale X." This is dramatically easier to review correctly than prose patches, both for you and for any reviewer agent.

## What the LLM actually sees on each contribution

This is the part that materially reduces strain. Right now your skills load all of SPEC.md into context to do anything. With structured backing, the skills can load **scoped projections**:

```typescript
// instead of: read entire SPEC.md
// load only what's relevant to the current edit

const slice = await spec.contextFor({
  task: 'add-grounding-requirement',
  scope: {
    phases: ['grounding'],
    relatedRequirements: 'all-grounding-r',
    relatedProperties: 'all-properties-committed-by-grounding-r',
    pendingValidationIssues: 'all',
    activeDecisions: 'depending-on-grounding',
  }
});
```

The LLM gets a focused, structured view of just the parts of the spec relevant to its task, plus any validation issues currently outstanding. This is the same architectural pattern as a good IDE's symbol-aware editing vs. textual find-and-replace — and it has the same magnitude of effect on quality.

A second move with similar payoff: **expose the spec as a tool surface, not a document.** The skills don't paste SPEC content; they call `query_spec`, `propose_property`, `link_property_to_requirement`, `retire_property`, `run_validators`. The LLM is a tool user against a structured backend, not a prose editor. This also gives you a complete audit log for free (every tool call is provenance), which closes the spec-drift gap from the Midspiral piece.

## Skill design implications

Your existing skills are document-shaped. The new ones should be operation-shaped, and they probably want to factor along three axes:

**Read skills** — `survey-spec`, `find-orphan-properties`, `audit-stale-assumptions`, `trace-property-witnesses`. These query the structured store and return focused projections. They don't load the whole spec.

**Write skills** — `propose-property`, `link-r-to-p`, `attach-predicate`, `retire-with-rationale`, `record-decision`. These are scoped, validated edits. Each runs the relevant validators and refuses to commit if it would introduce a structural inconsistency the LLM hasn't acknowledged.

**Reconciliation skills** — `propose-supersession`, `merge-duplicate-properties`, `prune-stale`. These are higher-stakes operations that require explicit human confirmation, but they're still structured — they propose a diff, you confirm, the system applies. No more "find and update three tables."

The skills become smaller and more numerous, but each is independently simpler. This is the same shape as good tool design generally — many small composable verbs beats a few heavyweight ones. It also makes the skills *individually testable*: each verb has a clear pre/postcondition you can fixture-test, instead of relying on prose convention.

## The deeper observation

Once the spec is queryable structured data with validators and tools, you've actually built a small instance of what Brunch is meant to be. Your dev methodology and your product converge — and the place they converge tells you something useful about what Brunch should ultimately be doing.

The interesting move is to lean into this. **What if Brunch's own development used Brunch?** Not literally today — Brunch isn't ready to elicit specs about itself yet. But as a north star, the test of whether the product is good enough is whether you'd trust it with its own spec. Right now you're building the methodology you wish Brunch produced. Once that methodology is good enough to be machine-mediated, Brunch becomes the natural tool for using it. The dogfooding is the maturity test.

A slightly more provocative version: the prose-shaped SPEC.md you have now is the artifact a *first-generation* Brunch would produce. The Property-graph-with-validators model is what a mature Brunch should produce. Your dev methodology is currently ahead of your product in some places (the invariant/requirement cross-referencing) and behind it in others (no structured store, no live validators). Knowing exactly where you are on each gap is itself useful spec-debt visibility.

## Concrete starting move

If I were starting this, I'd not migrate the whole file at once. I'd:

1. **Define the structured schema** (Property, Requirement, Criterion, Decision, Assumption, with their relationships) in a single types file, plus a small SQLite or JSON store.
2. **Build the SPEC.md generator** first, before any migration. Confirm a stub structured spec renders into something close to your current format. This proves the projection direction works.
3. **Migrate one phase's items only** — grounding, probably, since it's the most foundational. This forces you to confront the granularity decisions in a contained scope.
4. **Write 3–5 read skills and 3–5 write skills** for the migrated portion. Use them on real grounding-spec edits for a week.
5. **Decide whether to continue migrating or to refine the model** based on what hurt.

The thing you'll discover doing this is whether your Property granularity instincts are right. Almost certainly the first migration pass will produce too-fine or too-coarse properties, and you'll re-cut. Doing this on one phase is a survivable mistake; doing it on the whole file is not.

The strain-on-LLM concern resolves in the right direction here: structured + scoped + tool-mediated is *less* cognitive load per contribution than prose + global + textual, even though the model itself is more complex. The complexity is in the type system and validators, where it belongs; the LLM's job becomes simpler, not harder.

</turn>
