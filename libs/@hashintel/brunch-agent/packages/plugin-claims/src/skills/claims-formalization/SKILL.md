---
name: claims-formalization
description: Elicit or transcribe a target claim and the definitions and supporting claims its justification rests on, maintain a recoverable claims workpiece, prepare statement cards for an external claims ledger, and explain what the ledger's standing does and does not establish. Use for a claim-formalization interview, a mission or milestone proposal, a card faithfulness review, or a question about what is established.
---

# Capability-aware formalization lifecycle

Use one conceptual lifecycle: orient, elicit or transcribe claims, maintain the workpiece, prepare cards when useful, check, deliver, and explain standing when asked. Card preparation is a projection and correction surface, not a second modelling world. The current conversation may expose only part of the lifecycle; do not claim an unavailable check occurred. Aligned to core as of `223d721`.

## Select the runtime branch

### Interactive elicitation or revision

Activate the `elicitation` skill and read `references/claims-elicitation.md` before substantive questions or revision. Interview in the person's and the source's vocabulary. Read `templates/workpiece.md` when creating or materially revising the claims account. Read `references/cards-and-standing.md` before drafting, reviewing, or delivering card text.

An early formal draft of one claim may be offered as soon as its authoritative wording and hypotheses are settled, when seeing the formal text and its read-back will help the person catch an implicit choice. Mark the draft and the read-back as your transformation; the person's confirmation is acceptance of wording, not independent evidence of faithfulness.

### Prepare only

Use the supplied claims workpiece as the complete input. Do not interview. Read `references/cards-and-standing.md`, preserve unaffected material, and prepare only the cards the workpiece supports. If a consequential gap prevents a faithful card—an implicit choice the person has not made, an unresolved dependency, an unlocated definition—report it and the smallest question a later interactive conversation must answer rather than deciding it.

### Explain standing

Use the supplied cards and any ledger-reported status as the complete input. Do not interview and do not re-derive status. Read `references/cards-and-standing.md` and state, in the person's vocabulary, what is established, conditional on what, refuted by what, and still open, with the evidence level actually reached for each claim.

## Procedure

### Orient

Establish enough purpose and context to select one useful claim thread: what the person wants established or refuted and why, whether the account is transcribed from a source, asserted by the person, or decomposed from a larger claim, which ledger and verification environment the cards are for, how much of the structure the person must personally confirm, and whether a source document or existing ledger material is available. Do not administer these concerns as an opening form.

### Elicit or transcribe claims

For a source-transcribed account, locate the authoritative statement, transcribe it exactly, and interrogate what it leaves implicit. For a person-asserted account, establish what is claimed, of what, under which hypotheses, and what would refute it. For a decomposition, follow the argument that justifies the target claim and let it expose the supporting claims and the order they depend on. Use the `elicitation` skill's universal guidance and `references/claims-elicitation.md` without turning their registers or the workpiece headings into question order.

### Maintain the workpiece

Keep a claims account in the person's and the source's vocabulary. Record each claim's authoritative wording, its origin, its hypotheses and the choices made explicit, its dependencies, its intended card status, and its consequential open matters. Follow core's `elicitation` guidance for settlement cadence, evidence relations, and locator lookup; `templates/workpiece.md` supplies the claims-specific recording shape.

Settle the current account with `update_workpiece` before preparing cards for submission and before workpiece-only delivery. A card drafted in prose is not a settled workpiece, and a settled workpiece is not a submitted card.

### Prepare cards

Read `references/cards-and-standing.md`. Translate only settled workpiece meaning into card fields. Preserve source wording, the person's confirmed choices, and any supplied verification environment or naming convention. Search available ledger material for an existing statement before introducing a new one, and record a reuse as a dependency on the existing card rather than a restatement. Do not invent hypotheses, definitions, or dependencies to make a card well-formed.

For revision, remember that an accepted card is immutable: a correction becomes a superseding card and a re-pointing of dependents, with the superseded card retained and its standing stated.

### Check and deliver

Apply the checks in `references/cards-and-standing.md` that the current capabilities support. Deliver the current claims workpiece whenever open matters, unconfirmed choices, or authorship distinctions remain material. Deliver card text with a plain account of whether each card was only drafted, accepted by the ledger as well-formed, read back and compared by the person against its source, or established by a verification the ledger reports. Name unconfirmed implicit choices, unlocated definitions, unresolved dependencies, and reuse candidates not yet checked.

An explicit stop opens no new topic. Return the best useful workpiece and card drafts with consequential gaps visible.

## Resource discipline

Read resources directly from this skill's advertised resource list, using the exact `/.flue/packaged-skills/...` path shown in the activation briefing; the relative name is a label only. Do not treat Markdown links as includes, follow references recursively, or use card fields or the verification language as the sequence or vocabulary of ordinary interview questions.
