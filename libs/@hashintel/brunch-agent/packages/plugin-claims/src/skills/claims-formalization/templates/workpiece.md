# Claims Workpiece and Recording Contract

The workpiece is the shared, recoverable claims account. Elicitation, transcription, and revision maintain it; card preparation consumes it. The transcript remains evidence, the source document remains the authority for transcribed wording, and the ledger remains the record of what has been submitted and what standing it has. The workpiece is the mutable proposal between them.

Follow the person's thread during conversation and file material into the workpiece afterward. Its headings are recording homes, not question order. The structure is near the target because a claim with hypotheses, definitions, and dependencies maps closely to a statement card, but it does not require the verification language or card field names.

## Recording distinctions

Use the authorship, consulted-material, and uncertainty distinctions from the `elicitation` skill's universal guidance; do not redeclare them as a ledger ontology. This workpiece adds only distinctions the claims/statement-card pairing requires:

- **Claim origin** — Whether a claim's authoritative wording is transcribed from a source at a stated location, asserted by the person, or proposed by the agent as a decomposition step. Adoption by the person changes standing, not origin.
- **Choice status** — For each thing a source leaves implicit and a formal statement must decide (domain, scope, strictness, emptiness, definition, edge case): confirmed by the person, proposed by the agent, or open.
- **Audit surface** — Whether a claim is one the person must read and confirm individually, or free structure the agent may introduce and revise without their review.
- **Dependency standing** — For each thing a justification rests on: asserted in this account, reused from an existing card, or open; and load-bearing or assisting.
- **Card status** — Whether a card is not drafted, drafted, accepted as well-formed, compared by the person against the source, or reported established, conditional, refuted, or open by the ledger. Faithfulness is recorded separately as the comparison result.

## Workpiece template

```markdown
# Claims Workpiece

## Purpose and audit posture

### Target claim and what the result must support

What the person wants established or refuted, why, and for whom.

### Account mode

Transcribed from a source, asserted by the person, decomposed from a larger claim, or mixed; the source document and location where applicable.

### Ledger, verification environment, and conventions

Where the cards are for, what they must compile in, and any supplied naming, tagging, or library conventions. Empty when none supplied.

### Audit surface

Which claims the person will confirm individually, which structure they will leave unreviewed, and why the boundary sits there.

### What the result must not claim

## Definitions

### <term in the person's or source's words>

Definition used, its origin (person or source, named library or existing card, or agent-introduced awaiting confirmation), and what it rests on in turn.

## Claims

### Claim: <person's or source's short name>

#### Authoritative wording and origin

Exact wording; source location, person's assertion, or agent-proposed decomposition; variants and which is authoritative.

#### Hypotheses and explicit choices

Each condition the claim rests on, and each choice the source left implicit, with its status: confirmed by the person, proposed by the agent, or open.

#### Audit surface

Person-confirmed or free structure.

#### Dependencies

What the justification rests on, each with its origin (asserted here, reused from an existing card, or open) and load-bearing or assisting mark, in the order the person understands them to depend.

#### Refutation condition

What would show the claim false, where the person can say; any reported refutation and its scope.

#### Formal draft and read-back

When offered: the formal target as the agent's transformation, its plain-language read-back, and the person's comparison result—no difference named, differences named and resolved, or not yet compared.

#### Card status

Not drafted, drafted, accepted as well-formed, compared by the person, or ledger-reported standing with its conditional chain; for a superseded card, the successor.

Repeat claims as needed. Supporting claims are claims; record them under their own heading with their dependency relationship stated, not as sub-bullets of the claim they support.

## Reuse candidates and consulted material

### Existing statements that may already say what a claim means

Each candidate with where it was found, what it appears to assert, and the person's position: adopted as a dependency, disputed as not the same claim, shown but not yet judged, or not yet shown.

### Consulted excerpts and ledger prose

Attributed material with the person's standing beside it, kept distinct from the person's evidence and the agent's inference.

## Open matters and authorship

For each consequential matter, record its universal state—agent proposal or assumption, unknown, not yet asked, declined, deferred, conflict, correction, contextual coexistence, or deliberate omission—plus what it affects and what would resolve or re-enter it.

Record formalism and ledger gaps separately from unknown claim content. A claim can be exactly stated while its verification environment, a library definition, or a ledger check remains unavailable.

## Delivery status

### What this workpiece currently supports

### Consequential gaps

Unconfirmed choices, unlocated definitions, unresolved dependencies, unjudged reuse candidates, claims not yet compared.

### Card status and check evidence

Per card: evidence level reached, comparison result, ledger standing if any, and whether a ledger or environment check actually occurred.
```

## Maintenance

- Prefer the person's and the source's terms for claims, hypotheses, and definitions. Introduce the verification language only in the formal draft and read-back.
- Keep one authoritative home for each active claim. When a claim's wording changes, record the correction and which wording was authoritative when; do not leave two current forms competing.
- Transcribe source wording exactly. A paraphrase is a transformation; record it as the agent's and demote it when the source wording becomes available.
- Do not turn an implicit choice into a confirmed one by recording the standard reading. Record the choice as proposed until the person decides.
- Keep the claim distinct from its justification. A dependency added to make an argument work is free structure until the person recognizes it as load-bearing.
- Record a person's confirmation of a formal draft as a comparison result, never as evidence the claim is faithful independently of the agent.
- Record supersession as a relationship between two cards, not as an edit to one.
- Remove irrelevant empty sections. Record an unresolved state only when it matters to later work.
- If card preparation requires transcript archaeology to recover a load-bearing hypothesis or dependency, the workpiece is incomplete at that boundary.
- Record separately whether a card was not drafted, drafted, accepted as well-formed, compared by the person, or reported on by the ledger.
