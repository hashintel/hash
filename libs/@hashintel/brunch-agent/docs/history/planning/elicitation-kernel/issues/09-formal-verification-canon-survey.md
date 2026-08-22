# Formal-verification canon survey

Type: research
Status: resolved
Resolved: 2026-08-06

## Question

> **Rename decided 2026-08-10** (HITL, during spec-assembly prep): the second target is the **assurance argument** — GSN's own noun, per this ticket's verdict that "proof obligations" reads as a category error. Package: `plugin-assurance` (was `plugin-proof-obligations` in the Shipping-shape topology). References to `elicit-proof-obligations` below are the historical name.

What existing canon should the `elicit-proof-obligations` output contract hew to, and — written didactically, for a reader new to formal verification — what does a verification workflow _actually do_: what are its artifacts, what is one trying to produce, where does the human effort go?

Specifically:

- **Dafny's contract vocabulary** (`requires` / `ensures` / `invariant` / `decreases`, pre/postconditions, loop invariants): how practitioners actually express obligations, and how much of that vocabulary transfers to a language-agnostic claim DAG
- **Proof-obligation workflow 101**: in Dafny/Lean/TLA+-style work, what is the day-to-day loop (state → obligation → discharge/failure → refine)? What does "an obligation" look like as an artifact? What roles do assumptions/axioms play?
- **Geolog / ARIA relevance**: what is Geolog (ARIA program context — axiom sets ostensibly addressed via Datalog-like queries), and does its shape align with our acyclicity + Datalog-closure validator design?
- **Recommendation**: what our claim-DAG format should align to — which canon's vocabulary, which parts to adopt vs. leave, and what the smallest canonical-feeling output contract for milestone one looks like

Context: the portfolio decision (issue 07) adopted zil-lean's _ideas_ (assurance lattice, PROVED/CONDITIONAL/WEAK/BROKEN ladder, Datalog-closure validation) but rejected its format as unproven; the output contract should feel native to people who do this work.

## Answer

> Resolved by `/research` subagent, 2026-08-06.

# Formal-Verification Canon Survey — for the `elicit-proof-obligations` target

## 1. Proof-obligation workflow 101

**The daily loop (Dafny-style, most concrete of the three).** You write code _and_ annotations in the same file. You hit save. The verifier translates your program into a pile of logical formulas called **verification conditions (VCs)** and asks an automated prover whether each is valid. Dafny specifically "verif[ies] that the program meets its specifications, by translating the program to verification conditions and checking those with Boogie and an SMT solver, typically Z3" ([Dafny Reference Manual §13.1](https://dafny.org/latest/DafnyRef/DafnyRef)). Green = discharged. Red = an assertion the solver could not prove. You then edit _the annotations, not usually the code_, and re-run. Loop time is seconds-to-minutes; Midspiral reports "proofs often take more than 10 minutes to run" on real domains ([midspiral.com](https://midspiral.com/blog/from-intent-to-proof-dafny-verification-for-web-apps/)).

**What a proof obligation _is_.** It is machine-generated, not human-authored. The human writes _contracts_; the tool derives obligations from them. Worked micro-example:

```dafny
method Decrement(n: int) returns (m: int)
  requires n > 0        // precondition — caller must establish
  ensures m == n - 1    // postcondition — callee must establish
  ensures m >= 0
{ m := n - 1; }
```

From those three lines the verifier generates roughly: (a) _assuming_ `n > 0` and the body's effect, prove `m == n-1`; (b) same, prove `m >= 0`; (c) at every call site of `Decrement`, prove `n > 0` holds there. Add a loop and you get more: the invariant holds on entry, is preserved by one iteration, and (with the negated guard) implies what follows — "The `invariant` clause is effectively a precondition and it along with the negation of the loop test condition provides the postcondition. The `decreases` clause is used to prove termination" (Dafny RM §7.6). Termination needs the `decreases` expression to both _decrease_ and be _bounded below_ ([Dafny tutorial, Termination](https://dafny.org/dafny/OnlineTutorial/guide)).

**"Discharging"** = the prover established that VC. Nobody hand-writes it. **On failure there are exactly two diagnoses** and telling them apart is the actual skill: "there are two main causes for Dafny verification errors: specifications that are inconsistent with the code, and situations where it is not 'clever' enough to prove the required properties" (Dafny tutorial). Failure gives you an error at a source location, optionally a counterexample — which Dafny explicitly downgrades to a hint: "Dafny cannot guarantee that the counterexample it reports provably violates the assertion... should be inspected manually and treated as a hint" (RM §13.7.1).

**Where human effort goes.** Not into proofs — into _specs, invariants, and hints_. Concretely: strengthening a loop invariant; adding a `lemma` ("a lemma states a logical fact, summarizing an inference that the verifier cannot do on its own," RM §6.3.3); hiding irrelevant facts so the solver focuses ("sometimes less information is better for the solver," RM §8.20.2). Midspiral's numbers make the shape vivid: same kernel, "counter domain (~50 lines of proofs) and the Kanban domain (~1,400 lines of proofs)."

**Durable vs. ephemeral artifacts.** Durable: the specification (contracts, invariants), the lemma corpus, and — critically — **the ledger of things assumed rather than proved**. Ephemeral: SMT queries, counterexamples, timings, proof-search traces. And the canon is explicit that the durable spec is the weak point: "Proofs guarantee that the implementation satisfies the specification. They don't guarantee that the specification is what you actually wanted... The human still owns the spec" (Midspiral, _Methodology Limitations_). That sentence is the entire justification for your product.

## 2. Dafny's contract vocabulary — what transfers

| Keyword              | Meaning                                   | Transfers to a claim DAG about an arbitrary system?                                                                      |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `requires`           | precondition, obligation on the _caller_  | **Yes** — the canonical name for "this claim's premise / what must hold for my guarantee to mean anything"               |
| `ensures`            | postcondition, obligation on the _callee_ | **Yes** — canonical for "guarantee"                                                                                      |
| `invariant`          | property preserved across steps           | **Yes** — reads naturally as a system-level always-true claim                                                            |
| `decreases`          | termination measure                       | **Partial** — as a _well-foundedness witness_ it's the honest canonical way to license a cycle; otherwise program-bound  |
| `modifies` / `reads` | frame conditions                          | **No** — "framing only applies to the heap, or memory accessed through references" (RM §7.1.4). Inherently program text. |
| `assert`             | prove this here                           | **Yes** — an obligation you accept                                                                                       |
| `assume`             | take this on faith                        | **Yes** — this _is_ your "assumption with review status"                                                                 |
| ghost state          | spec-only variables, erased at compile    | **No** — an artifact of having a compiler                                                                                |
| `lemma`              | named reusable inference step             | **Yes** — maps directly to your lemma record                                                                             |

The single most transferable thing in the Dafny ecosystem is not a keyword: it is **`dafny audit`**, which "reports issues in the Dafny code that might limit the soundness claims of verification" and flags declarations marked `{:axiom}`, `{:verify false}`, `{:extern}` with contracts, any `assume` in a body, and `decreases *` — because "the key purpose of the `audit` command is to ensure that all assumptions are intentional and acknowledged" (RM §13.6.1.8). It emits a **Markdown table**. That is, near-verbatim, the output artifact you are building. Adopt its framing.

## 3. Adjacent canons

**TLA+.** Obligation-like artifact: an _invariant_ or _temporal property_ checked against a state machine. Two tools, two epistemics. TLC does bounded exhaustive search: it "builds a finite state model... performs a breadth-first search... If TLC discovers a state which violates a system invariant, it halts and provides a state trace path" ([Wikipedia](https://en.wikipedia.org/wiki/TLA%2B)). TLAPS does real proof: proofs are "transformed into individual obligations which are sent to back-end provers" (Isabelle, Zenon, Z3), and are "hierarchically structured, easing refactoring and enabling non-linear development: work can begin on later steps before all prior steps are verified." **Fit: strong on structure** — hierarchical, obligation-per-step, partial completion is normal — but the vocabulary (`Init`, `Next`, `[]`, fairness) presumes a state machine you don't have.

**Lean / Isabelle.** Artifacts: `definition` / `lemma` / `theorem`, organized in namespaces, with `axiom` a first-class declaration kind ([Lean Language Reference §8](https://lean-lang.org/doc/reference/latest/)). The culture-critical mechanism is **`sorry`-tracking**: a proof left incomplete still typechecks but taints the result, and `#print axioms` reveals the taint. **Fit: excellent for your lemma/theorem/assumption trichotomy and for the CONDITIONAL rung** — "proved, but modulo these named holes" is native theorem-prover thinking.

**Alloy.** Vocabulary: `sig` (signatures define vocabulary), `fact` (always-true constraints), `pred`, `fun`, `assert` — checked by a SAT-based model finder within a bounded scope ([Wikipedia](<https://en.wikipedia.org/wiki/Alloy_(specification_language)>)). "Lightweight formal methods": finds counterexamples, never proves. **Fit: weaker on vocabulary, but philosophically closest to milestone one** — you too are doing a cheap, bounded, always-terminating check that surfaces defects rather than certifying correctness. Borrow the _stance_, not the nouns.

**GSN (assurance cases).** Six core element types: **Goal** (a claim), **Strategy** (the nature of the inference from a goal to its sub-goals), **Solution** (a reference to evidence), **Context**, **Assumption**, **Justification** (rationale). Two link types: **SupportedBy** (inferential or evidential) and **InContextOf** (relating Context/Assumption/Justification to Goals and Strategies). Goals and Strategies may be marked **Undeveloped** — "a line of argument has not been developed yet." Large arguments modularize via **away goals** ([GSN Community Standard v1, FAA-hosted PDF](https://www.faa.gov/about/office_org/headquarters_offices/ang/redac/redac-sas-201503-gsn-community-standard-v1.pdf); [SCSC GSN](https://scsc.uk/gsn); GSN liaises with OMG's [SACM](https://www.omg.org/spec/SACM/)). **Fit: best of the four for interviewed claims about an arbitrary system.** It was designed for exactly your situation — a human argues that a system is adequate, with heterogeneous evidence, in a graph, where "not yet argued" is a legitimate node state.

## 4. Geolog / ARIA — negative result, stated plainly

**No ARIA / Safeguarded AI / davidad artifact named "Geolog" could be found.** Searches across `geolog + davidad`, `geolog + Safeguarded AI`, `geolog + Datalog + verification kernel`, and GitHub returned nothing. The ARIA [Programme Thesis v2](https://aria.org.uk/media/ikrkutfk/safeguarded-ai-programme-thesis-v2.pdf) is an image-heavy PDF whose text could not be extracted; the [funded projects page](https://aria.org.uk/opportunity-spaces/mathematics-for-safe-ai/safeguarded-ai/funded-projects) and the [TA1.1 Theory call](https://aria.org.uk/media/tfkjkjxy/aria-safeguarded-ai-ta11-theory-call-for-proposals.pdf) describe "computationally practicable mathematical representations and formal semantics" without naming a logic. **Do not build on a claim that ARIA ships something called Geolog.**

**What "Geolog" actually names in the literature** (documented): a logic-programming language for **coherent logic**, the language whose queries Skolem machines compute (Fisher & Bezem, _Skolem Machines_; Bezem & Coquand, _Automating Coherent Logic_). Coherent logic is "a restriction of first-order logic due to Skolem that is proof-theoretically tractable"; geometric logic is its infinitary generalisation, with axioms written as sequents built from `⊤, ∧, ⊥, ⋁, ∃, =`, and models "preserved and reflected by geometric morphisms" ([Wikipedia: Geometric logic](https://en.wikipedia.org/wiki/Geometric_logic); [nLab: geometric theory](https://ncatlab.org/nlab/show/geometric+logic)). There is a separate, unrelated _Geolog_ for GIS/spatial Prolog ([arXiv:2109.08295](https://arxiv.org/abs/2109.08295)).

**Does the shape align with acyclicity + Datalog closure?** Yes, and non-trivially. Coherent-logic provers are **forward-chaining fixpoint engines** — "the first automated theorem prover based on coherent logic, Euclid, was developed in Prolog and its inference system relied on a forward-chaining mechanism," computing "the fixpoint for a geometric configuration" ([Automating Coherent Logic, Springer](https://link.springer.com/chapter/10.1007/11591191_18); [A Deductive Database Approach to Automated Geometry Theorem Proving](https://link.springer.com/article/10.1023/A:1006171315513)). Datalog is precisely the ∃-free, ⋁-free fragment of that. **(Inference):** the validator is a Datalog restriction of a coherent-logic saturation engine, which is a genuinely canonical lineage you can cite — Geolog is the _right ancestor_ to name, just not an ARIA one. Honest caveat: coherent logic in general is undecidable; Datalog is not. The restriction is what buys determinism.

_(Adjacent, real, and possibly what was half-remembered: ARIA-adjacent work on **Kolm**, "an early-stage decentralized proof database designed to interoperate with Lean" — mentioned in [a davidad interview](https://www.cognitiverevolution.ai/alignment-with-awakening-davidad-on-moral-realism-ai-wisdom-why-his-p-doom-is-down-to-5/), with usable tools projected end of 2027. Single-source; treat as unconfirmed.)_

## 5. RECOMMENDATION

**Align to a GSN skeleton with Dafny nouns on the claim fields and Lean/Dafny-audit semantics on the status ladder.** GSN because it is the only canon designed for _argued_ claims about a system by humans with mixed evidence; Dafny because `requires`/`ensures`/`invariant`/`lemma` are the words verification people reach for first and cost nothing to adopt; `dafny audit` because it is literally the deliverable.

**Adopt:** GSN's Goal / Strategy / Solution / Assumption / Justification vocabulary and its two link types; Dafny's `requires`/`ensures`/`invariant`/`lemma`/`assumption`; Lean's `sorry`-taint semantics; `dafny audit`'s "list of intentional, acknowledged assumptions" as the primary output.
**Leave:** `modifies`/`reads` (heap-bound), ghost state, TLA+'s temporal operators, Alloy's `sig`/scope machinery.

### Smallest canonical-feeling milestone-one contract

**One record type, `Statement`, with a `kind` discriminant** (avoids five near-identical schemas):

- `id`, `kind` ∈ {`goal`, `strategy`, `assumption`, `lemma`, `theorem`, `guarantee`, `constraint`, `evidence`, `justification`, `context`}
- `statement` — one natural-language sentence, indicative mood
- `owner`, `review_status` ∈ {`unreviewed`, `accepted`, `disputed`, `retired`} _(assumptions only; from `dafny audit`)_
- `criticality` ∈ {`catastrophic`, `major`, `minor`} — **note: this comes from safety engineering (DAL/SIL/ASIL), not from Dafny/Lean, which have no notion of it.** Source it there and say so.
- `evidence_refs[]`, `provenance` (transcript span), `developed: bool` (GSN Undeveloped)

**Four edge kinds:**

1. `supports` (GSN SupportedBy — inferential; child → parent)
2. `evidenced_by` (GSN SupportedBy — evidential; claim → evidence)
3. `requires` (Dafny precondition; claim → premise it needs)
4. `in_context_of` (GSN InContextOf; claim → assumption/context/justification)

Only `supports`, `evidenced_by`, `requires` are load-bearing for status. `in_context_of` is scoping.

**Derived status, stratified:**

- **S0** `refuted(X)` if evidence marked contradicting; `open(X)` if `kind=assumption ∧ review_status ∈ {unreviewed, disputed}`
- **S1** `BROKEN(X)` if `refuted(X)` ∨ ∃ load-bearing child `BROKEN` _(pure positive recursion — closes first)_
- **S2** `WEAK(X)` if ¬BROKEN ∧ (`¬developed` ∨ (no `evidenced_by` ∧ no `supports`))
- **S3** `CONDITIONAL(X)` if ¬BROKEN ∧ ¬WEAK ∧ ∃ transitively-reachable `open` assumption
- **S4** `PROVED(X)` if ¬BROKEN ∧ ¬WEAK ∧ ¬CONDITIONAL

Negation only ever looks at a lower stratum — that is the stratification the validator must enforce, alongside acyclicity of the three load-bearing edge kinds.

### Where canon conflicts with already-made decisions

1. **The four-rung ladder is not canon; the audit list is.** Dafny and Lean are binary (verified / not) _plus an enumerated list of soundness caveats_. **Canon should win on emphasis:** make the per-claim status a derived UI label, and make the **assumption ledger** — every `open` assumption with its owner, review status, and which guarantees it taints — the headline artifact. Ship it as a Markdown table, like `dafny audit`.
2. **Acyclicity is stricter than canon.** Lean and Dafny permit mutual recursion licensed by a `decreases` measure. **The acyclicity decision should win for milestone one** — it makes validation trivially decidable and the failure message legible — but record it as a deliberate restriction and name `decreases` as the future escape hatch. That framing reads as informed rather than naive to a verification reader.
3. **GSN is deliberately _not_ computed.** A GSN goal structure is a human argument; nobody derives a verdict from it mechanically. The Datalog closure must therefore be sold as a **well-formedness and taint-propagation check, not an assurance verdict.** Never let the UI say a claim is "proved" unqualified. Borrow Alloy's honest stance: this finds defects; it does not certify.
4. **"Proof obligation" is a term of art for a machine-generated VC.** We are eliciting _contracts and claims_, from which obligations would later be generated. Calling the output "proof obligations" will read as a category error to a Dafny user. **Prefer "obligation ledger," "claim structure," or "assurance argument."**

## 6. Unreached sources

- ARIA **Safeguarded AI Programme Thesis v1.2 / v2** — PDFs are image-based; no text extraction. Likely the single highest-value unread source for Q4.
- **GSN Community Standard v3 (SCSC-141C)** — download endpoint returns a redirect stub, not the PDF. GSN element definitions come from the FAA-hosted v1 plus secondary literature; v3 may have refined them.
- **Bezem & Coquand, _Automating Coherent Logic_** (ResearchGate HTTP 403) and **Fisher & Bezem, _Skolem Machines_** (Semantic Scholar, empty body) — the primary Geolog sources. Read via institutional access before citing Geolog's concrete syntax.
- **LessWrong: _Davidad's Provably Safe AI Architecture_** — HTTP 429 rate-limited. Worth a retry for Q4.
- **Alloy online tutorial** (HTML parser crash) and **alloytools day-course slides** (PDF) — Alloy detail rests on Wikipedia plus its citation of Jackson's _Software Abstractions_.
- **TLAPS project site** (`lamport.azurewebsites.net/tla/tlaps.html`, 404); TLAPS facts are from Wikipedia and the INRIA mirror.
- **Isabelle documentation** (fetch error) — Isabelle is covered only by analogy to Lean here.
