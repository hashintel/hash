# Behavior-Specification Workpiece and Recording Contract

The workpiece is the shared, recoverable software-behavior account. Elicitation and revision maintain it; Gherkin authoring consumes it. The transcript remains evidence, and the `.feature` document remains a target rendering rather than the sole home of unresolved meaning.

Follow the person's thread during conversation and file material into the workpiece afterward. Its headings are recording homes, not question order. The structure is near the target because software-behavior examples map closely to Gherkin, but it does not require target keywords or step decomposition.

## Recording distinctions

Use the authorship and uncertainty distinctions from the `elicitation` skill's universal guidance; do not redeclare them as a Gherkin ontology. This workpiece adds only distinctions the software-behavior/Gherkin pairing requires:

- **Behavior status** — Whether an account describes current or proposed behavior, or a discrepancy between them.
- **Rule and example** — The general behavior and the concrete case illustrating it. A case does not become a rule merely because target text can be written for it.
- **Behavior content and authoring choice** — What the software must do versus how the agent names, groups, phrases, or factors it in Gherkin.
- **Integration status** — Whether target text is only authored, accepted by a parser, matched against a named step-definition source, or executed through a named runtime path.

## Workpiece template

```markdown
# Behavior-Specification Workpiece

## Purpose and scope

### Feature value narrative

Who or what benefits, what the capability enables, and why it matters.

### Current, proposed, or mixed account

### Intended readers and use

### Software boundary and deliberate non-goals

### What the result must not claim

## Domain language and integration context

### Actors and external systems

### Consequential terms and meanings

### Supplied locale, conventions, tags, or step lexicon

## Rules and examples

### Rule: <person's words for the rule>

#### Working statement, behavior status, and authorship

#### Why this distinction matters

#### Example: <memorable behavior name>

##### Starting context

##### Focal event or action

##### Observable outcome

##### Rule distinction, boundary, or contrast demonstrated

##### Exact person evidence and authoring choices where needed

#### Contrasting or boundary example: <name>

Add only when it exposes a consequential condition the first example does not.

Repeat rules and examples as needed. An example may remain directly under the feature when no separate business rule is useful; state what it demonstrates.

## Authoring candidates

### Context shared across examples

### Value dimensions that may form an outline

### Candidate target files and feature grouping

### New, known, and unchecked step phrases

## Open matters and authorship

For each consequential matter, record its universal state—agent proposal or assumption, unknown, not yet asked, declined, deferred, conflict, correction, contextual coexistence, or deliberate omission—plus what it affects and what would resolve or re-enter it.

Record target-formalism and integration gaps separately from unknown behavior. A supported rule can be clear while its phrase binding or runtime capability remains unavailable.

## Delivery status

### What this workpiece currently supports

### Consequential gaps

### Gherkin status and check evidence
```

## Maintenance

- Prefer the person's domain terms for rules, examples, actors, and outcomes.
- Keep one authoritative home for each active rule and example. Record corrections without leaving the obsolete and current forms as competing behavior.
- Do not force a person-supplied example into step lines while interviewing. Context, event or action, and outcome are enough for the workpiece; authoring owns target decomposition.
- Keep current and proposed versions side by side only when their contrast is the subject; otherwise state which account is active and preserve the old one as correction history.
- Remove irrelevant empty sections. Record an unresolved state only when it matters to later work.
- If authoring requires transcript archaeology to recover a load-bearing rule or outcome, the workpiece is incomplete at that boundary.
- Record separately whether target text was not authored, authored only, parser-checked, binding-checked against a named source, or executed by an external test path.
