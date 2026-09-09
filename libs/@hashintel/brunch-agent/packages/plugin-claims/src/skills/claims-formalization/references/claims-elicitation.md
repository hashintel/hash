# Claim and Dependency Elicitation

This reference adds claim-formalization guidance to the universal guidance in the `elicitation` skill. Apply both under the same registers. The universal skill now scopes its practice-based defaults (remembered cases, observability, the last occurrence) to practice-based sources; this pairing's sources are usually a document or an assertion, so the entries below supply the counterparts for that source mode and say where they narrow or replace a universal entry. Aligned to core as of `223d7218b0`.

The registers are not a questionnaire or phase sequence. **Recognition** suggests distinctions that may be present in a claim or its source. **Operations** select ways to investigate an active gap. **Coverage** says what an audit-ready claims account may need. **Verification** checks the current interview and workpiece. Card fields, immutability, dependency standing, and evidence levels live in `cards-and-standing.md`.

## Directives

### Transcribe before you paraphrase

Counterpart to the universal preference for concrete remembered cases, which applies to practice-based sources. When a source exists, the authoritative wording is the case: locate it, transcribe it exactly, and interrogate it. Ask the person to recall or restate only where the source is silent or where they intend to depart from it. A paraphrase in your words is a transformation and keeps your authorship until the person adopts it.

### Treat assertion as the product

Narrows the universal handling of normative language. The universal entry asks whether an account describes what happens now, what should happen, or a discrepancy; for a claim the answer is fixed: the person is asserting what holds, not reporting what happens. Establish what is asserted, of what, under which hypotheses, and what would refute it. Do not look for a practice it diverges from.

### Make every implicit choice the person's

A source statement leaves things unsaid that a formal statement cannot: the domain a variable ranges over, whether a set may be empty, whether a bound is strict, which of several standard definitions is meant, what an edge case yields. Surface each such choice, propose the reading you would take, and record the person's decision. A choice you made and the person did not confirm is agent inference, however standard.

### Keep the claim distinct from its justification

What a claim says is settled before how it is established. Record dependencies as the person's or the source's account of what the justification rests on. Do not let a convenient decomposition reshape the claim, and do not let a claim's difficulty change what it asserts.

### Confirmation is not a second witness

Sharpens the universal rule that assent to your wording is not independent evidence. The person confirming a formal statement you wrote, or agreeing with a read-back you wrote of it, accepts your wording. It does not establish faithfulness independently of you. Present formal text with its read-back, make every binder, hypothesis, and unfolded definition explicit, and ask the person to compare against the source rather than to approve.

### Source excerpts and ledger entries are consulted material

The universal skill owns the consulted-material authorship class and its standing (accepted, disputed, not yet shown, shown but unsettled). Apply it to source excerpts you transcribe and to existing ledger entries you look up. An excerpt the person adopts becomes the authoritative wording of a claim, and its origin and standing stay recorded beside it; adoption does not make the excerpt the person's own evidence.

## Recognition

Recognition entries identify possibilities to test, not facts to record automatically or reasons to abandon the active conversational thread.

### Silent quantification

“For all,” “there exists,” “every,” “some,” “any,” and bare plurals may leave scope, order of quantifiers, and the domain of each variable implicit. Two readings that differ only in quantifier order are different claims.

### Hidden hypothesis

A claim stated without conditions may rest on conditions its source takes for granted: non-emptiness, finiteness, positivity, well-formedness, a standing convention stated pages earlier. A formal statement without the hypothesis may be false or vacuous while its informal source is fine.

### Convention-dependent term

“Degree,” “graph,” “bounded,” “almost surely,” “safe,” and similar terms may have several standard definitions or a source-local one. The person's or source's meaning selects the definition the card must rest on.

### Load-bearing versus assisting claim

Some supporting claims structure the argument and would be recognized by any reader of the source; others are technical conveniences a formalizer introduces. The first kind belongs in the audited structure; the second may be introduced freely. Which is which is the person's judgment, not the formalizer's convenience.

### Reuse-shaped reference

“The standard result,” “by the usual argument,” “this is well known,” and a named theorem may refer to something already available in the ledger or a foundational library. Consulting it narrows the next question; introducing a restatement duplicates it.

### Statement that survives its proof failing

A claim the person believes may nonetheless be false, ill-posed, or missing a boundary condition. A failed attempt to establish it is evidence about the attempt; a refutation is evidence about the claim. Keep the two apart and treat a refutation as a reason to revisit the statement, not merely the justification.

### Vacuity

A statement can be well-formed and trivially established because its hypotheses are unsatisfiable, its conclusion is always true, or a definition unfolds to something empty. Vacuity is invisible in the formal text and visible only against what the person meant.

## Operations

Use the universal Operations as the primary interviewing repertoire. These additions bind them to claim formalization.

### Locate and transcribe the authoritative statement

Ask where the claim is stated, transcribe the exact wording, and record its location. Where the source states it in several places or forms, ask which is authoritative and record the others as variants.

### Unfold one term to its definition

Take one term the claim depends on and ask what definition it rests on, whether that definition is supplied, standard, or source-local, and what it would need to rest on in turn. Stop when the person or a named library supplies the definition.

### Clarify until every binder is explicit

Applies the universal “clarify until applicable” to a formal target. A claim is applicable when every variable has a domain, every hypothesis is stated, every quantifier has a scope, and every term rests on a located definition. Stop there; do not clarify toward proof strategy.

### Present a reading for comparison

Replaces the universal “restate for correction” for formal text. Offer the formal statement together with your plain-language read-back of what it literally asserts, binders and hypotheses explicit and non-standard definitions unfolded. Ask the person to compare the read-back with the source statement and name any difference. Do not ask them to approve the formal text.

### Ask what would refute it

Counterpart to “ask for the last occurrence,” which has no object for a claim. Ask for a case the claim excludes, a boundary where it stops holding, or what a counterexample would look like. Use the answer to expose hypotheses, scope, and the claim's intended strength.

### Follow the argument to its dependencies

Walk the justification from the target claim toward what it rests on, one step at a time. At each step ask what is being used and whether it is asserted here, assumed from elsewhere, or already established. Record the dependency and its origin; do not invent intermediate claims to make the walk smooth.

### Separate the audit surface from the free surface

Ask which claims the person must read and confirm individually and which may be introduced and revised without their review. Record the boundary and why it sits there. The person's tolerance for unreviewed structure is a posture fact, not a formalization default.

### Check for an existing statement

Applies the universal “consult and present for confirmation” to ledger material. When a reference is reuse-shaped and ledger material is available, consult it and present what was found as a candidate in the person's frame: does the existing statement say what they mean, differ in a way that matters, or not apply. Record the position; do not introduce a restatement while a match is unsettled.

### Sweep one obligation

After a concrete claim exposes the structure, sweep one concern across the account: hypotheses without a confirmed choice, terms without a located definition, dependencies without an origin, claims without a refutation condition, or reuse candidates not yet checked. Do not traverse card fields merely because they exist.

## Coverage

Coverage identifies what the claims workpiece may need for its purpose and downstream card preparation. It is neither question order nor a demand to populate irrelevant categories.

### Target, purpose, and audit posture

Preserve what the person wants established or refuted, why, for whom, which ledger and verification environment the result is for, and which part of the structure they will personally confirm.

### Authoritative wording and origin

Preserve each claim's exact wording, where it comes from—source location, person's assertion, or agent-proposed decomposition—and any variants and which is authoritative.

### Hypotheses, scope, and explicit choices

Preserve every condition the claim rests on and every choice the source left implicit, with who decided it and how: confirmed by the person, proposed by you, or open.

### Definitions

Preserve each term the claims rest on with its definition and the definition's origin: supplied by the person or source, taken from a named library or existing card, or introduced by you and awaiting confirmation.

### Dependencies and their standing

Preserve what each claim's justification rests on, whether each dependency is asserted here, reused from an existing card, or open, and the order in which the person understands them to depend on one another.

### Refutation conditions

Preserve what would show each load-bearing claim false, where the person can say, and any reported refutation with its scope.

### Reuse candidates and consulted material

Preserve existing statements that may already say what a claim means, the person's position on each, and any consulted text with its standing, kept distinct from the person's evidence and your inference.

### Verification environment and conventions

When supplied, preserve the environment the cards must compile in, naming and tagging conventions, and the foundational libraries definitions may be drawn from. These carry no claim content and should not consume interview time without a preparation need.

## Verification

Apply these checks while eliciting and maintaining the workpiece. Card well-formedness, dependency standing, and evidence levels live in `cards-and-standing.md`.

### Statement and choices

- Each load-bearing claim has exact authoritative wording and a recorded origin.
- Every implicit choice a formal statement would force has been surfaced and either confirmed by the person or visibly marked as your proposal.
- Each term the claim rests on has a located definition or a visible gap.
- A claim's wording has not shifted to fit a decomposition or to become easier to establish.

### Dependencies and authorship

- Each dependency has a recorded origin and standing; none was introduced to smooth the argument.
- The person has said which claims they will confirm individually; unreviewed structure is marked as such.
- Consulted material carries its standing and has not become the person's evidence.
- A confirmation of your formal text or read-back is recorded as acceptance of wording, not as independent evidence of faithfulness.

### Failure signals and repairs

- **Field-led interview:** questions traverse card fields or the verification language. Return to one claim in the person's or source's words.
- **Paraphrase as source:** the workpiece carries your restatement where the source's wording was available. Transcribe the source and demote the paraphrase to a transformation.
- **Standard choice unconfirmed:** a domain, strictness, emptiness, or definition was chosen because it is usual. Present the choice and record the person's decision.
- **Convenient decomposition:** a supporting claim exists because it made the argument easier for you, not because the source or person recognizes it. Mark it free-surface or remove it from the audited structure.
- **Approval instead of comparison:** the person was asked whether the formal text “looks right.” Present the read-back against the source and ask for differences.
- **Restatement of the available:** a new claim restates something the ledger or a library already carries. Record the reuse and the dependency.
- **Refutation read as failure:** a reported refutation was treated as a failed attempt. Revisit the statement and its hypotheses.
