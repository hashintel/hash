# ADR-0003: The IR is the elicited model, derived — three registers, not one

Date: 2026-08-18
Status: accepted
Amends: [ir-design.md](../specs/intermediate-representation.md) Layer A (the
"Definition" paragraph), ratified FE-1364/FE-1397
Decided on: FE-1405 (payload-interiors session); ratified by Lu, 2026-08-18

## Context

Layer A defined the intermediate representation as "the set of active captures, read through
the plugin's declared payload type system," with every consolidated view a read-time
projection. Working FE-1405's payload interiors against the baseline transcripts exposed the
problem with that sentence: a bag of typed assertions is not a model of the plant. Mapping
captures to a catalog of semantic types is a first small step that quietly delegates the
actual assembly of a domain model to something several degrees removed — and unowned. The
questions the system exists to answer ("is this model complete enough to answer the expert's
objective?") are questions about a _model_, not about captures.

The obvious fix — assemble the model at read time — founders on a real chasm: bridging "half
a shift" or "every week or two" to model slots takes semantic interpretation, i.e. LLM
inference, and interpretation hidden inside a read path is unauditable and unreproducible.

## Decision

Three registers, each with a designed schema:

1. **Assertions** (captures) — answer-shaped typed semantic proposals, envelope-wrapped:
   verbatim forms, hedges, absences, provenance. Every write-time semantic act — unit
   parses, identity links, compositions, formalizations — is deposited here as a capture
   (`inferred`, supersedable, contestable).
2. **The elicited model** — the IR proper: domain-shaped, expert vocabulary, node kinds with
   slots. **Derived, never stored**: assembly is a pure fold over active captures, forbidden
   to interpret. Gaps surface as typed issues, never as silent inference. Every model part
   answers "which captures made you."
3. **Projections** — the net, the loss report, the completion table — derived from
   register 2.

Binding rules that make the split honest:

- **Write-time-only semantics.** No semantic act at read time; every bridge is a capture.
  The model is a pure function of the store, and the store contains every semantic judgment
  the assembly needs, because the assembly is forbidden to make any.
- **The acceptance oracle.** A second projection must be able to consume the conceptual
  model without rereading the transcript or semantically interpreting generic capture
  fields. If it can't, we have a capture ledger, not an IR.
- **Promotion, never refusal.** Low-grade statements ("about 3 hours") are captured
  honestly; the forcing function is that they never promote to a demanded grade without a
  higher-grade capture superseding them.

"No second store" survives intact — register 2 is a derivation, not a persistence surface.
Layer A's five MUST properties and its recommended patterns are unamended; what changes is
the definition sentence: the IR is register 2, and "active captures read through the payload
type system" describes register 1.

## Condition

FE-1397's ratification bar applies to this amendment as it did to the original: worked
designs across at least three plugin targets. Discharged so far by thumbnails only (Gherkin
thin, formal-verification mid, CPS in full — recorded in the FE-1405 shapes work); a full
FE-1397-style property-by-property pass is a stated condition on this record. Until the
September build exercises a real fold, everything here is desk-validated, like the canon it
amends.

## Consequences

- The FE-1405 output is a plugin _contract_, not just payload shapes: a model schema and a
  proposal catalog (the two registers' declarations) joined by a fold table and a demand
  table. Spec forthcoming from the session's working material.
- Completion (FE-1402) computes over register-2 slot states, not over capture counts.
- The sweep (FE-1392) becomes the single point of semantic failure by design — mitigations
  travel with the FE-1405 handoff notes.
- The capture envelope is untouched. The one pressure this work confirmed (absence captures
  carry no locator, so a field-specific absence cannot name its slot) stays recorded at the
  seam, pending adjudication — not forked around.
