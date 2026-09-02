# Software-Behavior and Gherkin Elicitation

This reference adds software-behavior and Gherkin-specific guidance to `universal-elicitation.md`. Apply both under the same registers. The additions below do not restate or replace universal elicitation guidance.

The registers are not a questionnaire or phase sequence. **Recognition** suggests behavior distinctions that may be present. **Operations** select ways to investigate an active gap. **Coverage** says what a signable behavior account may need. **Verification** checks the current interview and workpiece. Gherkin grammar and document checks live in `gherkin-authoring-and-checks.md`.

## Directives

### Specify behavior in the person's language

Ask about situations, actors or external systems, events, actions, rules, and observable outcomes in the vocabulary used by the people who need the behavior. Keep `Given`/`When`/`Then`, file structure, automation code, fixtures, and selectors backstage until target authoring.

### Keep intended and current behavior distinct

Normative language may be the desired product, not a defective report of practice. Establish whether the person is describing what happens now, what should happen, or a discrepancy that matters. Do not force a proposed rule through a last-occurrence test as though only observed behavior were legitimate.

### Let examples illustrate rules

Use concrete examples to discriminate and correct a general rule. Do not promote one memorable case into a universal rule without checking its boundary, and do not leave a load-bearing rule with no example showing how a reader would decide whether it held.

### Keep observable behavior separate from implementation

Describe outcomes visible to a person or external system. Interface gestures, database records, function calls, selectors, and test fixtures are not the behavior unless the stated purpose specifically makes that interface or integration contract observable.

### Do not invent suite integration

Step definitions, tags, locale, aliases, and naming conventions may be supplied by a team or available project. Without that source, preserve the intended phrase and mark its binding or convention as new, unavailable, or unchecked.

## Recognition

Recognition entries identify possibilities to test, not facts to record automatically or reasons to abandon the active conversational thread.

### Rule-shaped language

“Always,” “never,” “only,” “unless,” “whenever,” “must,” “may,” and “cannot” may state a business rule, permission, invariant, or exception. Determine its scope and find a concrete example that would distinguish it from a slogan.

### Example-shaped stories

“Last time,” “for example,” “one user,” and narratives with specific values may already contain a context, event, and outcome. Preserve the details before generalizing.

### Same action, different outcome

Two accounts with the same apparent context and action but different outcomes may expose a missing state, actor distinction, business rule, or genuine conflict.

### Expected but unobservable result

“It works,” “it is handled,” “it succeeds,” and “the record is updated” may name an intention or hidden implementation state rather than an outcome a user or external system can observe.

### Gesture-shaped description

Clicks, screens, buttons, fields, API methods, and internal components may be the person's natural route into the example while obscuring the capability or externally meaningful event. Preserve them when they are contractually observable; otherwise ask what the actor is trying to accomplish or what another system sends or receives.

### Boundary and partition language

Thresholds, ranges, roles, lifecycle states, permissions, dates, limits, and categories may divide behavior into equivalence classes. Boundaries just below, at, and above a threshold may deserve separate examples when the rule changes there.

### Repeated context or data shape

Context repeated across several examples may become a `Background`; examples differing only by named values may become a `Scenario Outline`. These are target-authoring possibilities, not behavior facts and not reasons to manufacture repetition.

## Operations

Use the universal Operations as the primary interviewing repertoire. These additions bind them to software-behavior specification.

### Follow one behavior end to end

Choose one concrete case and establish the relevant starting context, one focal event or action, and what a person or external system can observe afterward. Keep incidental setup and multiple downstream behaviors out of the example unless they are necessary to understand the rule.

### State the candidate rule for correction

After one or more examples expose a stable relationship, offer the general rule in domain language and ask for correction. Mark it as your proposed normalization until the person settles it.

### Contrast satisfaction and violation

For a consequential rule, ask for a nearby example where it does not apply, is refused, or yields another outcome. Vary one relevant condition so the contrast reveals the rule rather than creating an unrelated story.

### Probe a boundary

When behavior changes at a threshold, ask which cases just below, at, and just above matter. Record only supported values and outcomes; the familiar boundary triad is a prompt for attention, not an automatic requirement.

### Separate current from proposed with the same example

When the person is changing behavior, ask what the selected example does now and what it should do. Preserve both statuses without presenting the desired result as observed or the current result as accepted.

### Ground reusable step language

When an actual step lexicon or repository is available, compare the intended phrase with known team language. Ask whether a near match expresses the same behavior or a distinct one. Without a lexicon, retain the domain phrase and defer binding; do not ask the person to remember hidden implementation names as a substitute for inspection.

### Sweep rules and examples

After a concrete slice exposes the feature's structure, sweep one concern: rules without illustrating examples, examples without observable outcomes, edge classes without coverage, current/proposed ambiguity, or phrases whose binding remains unchecked. Do not traverse target keywords merely because they exist.

## Coverage

Coverage identifies what the behavior workpiece may need for its purpose and downstream Gherkin authoring. It is neither question order nor a demand to populate irrelevant categories.

### Capability, value, boundary, and status

Preserve who or what benefits, what the capability enables, why it matters, what software or interaction boundary is in scope, and whether each account describes current or proposed behavior.

### Business rules and rationale

Preserve each rule generally enough to apply beyond one story, its scope and exceptions, why the distinction matters when useful, and at least one example that illustrates it or a visible gap where none is yet supported.

### Concrete behavior examples

Preserve the starting context that selects the behavior, the focal event or action, and the externally observable outcome. Retain specific values, actors, states, channels, and timing only where they discriminate the rule.

### Contrasts, failures, and boundaries

Preserve supported unhappy paths, refusals, absent permissions, invalid inputs, failures, state-dependent results, and threshold cases that materially define the rule. Do not demand one example from every familiar test-design category.

### Actors, external systems, and domain language

Preserve roles and systems whose differences change behavior, consequential terms in the team's language, and any supplied step vocabulary or naming convention. Do not turn every noun into an independently elicited target element.

### Shared context and tabular variation

Preserve repeated preconditions and repeated value dimensions so authoring can decide whether `Background`, `Scenario Outline`, or separate examples communicate them best. The target structure is a later choice; the workpiece keeps the behavior readable before factoring.

### Target-document conventions and integration inputs

When supplied, preserve spoken-language locale, preferred keyword aliases, tags, file naming, step lexicon, and the source against which binding or execution could be checked. Suite organization carries no behavior by itself and should not consume interview time without a delivery need.

## Verification

Apply these checks while eliciting and maintaining the workpiece. Grammar, authoring, parse, and binding checks live in `gherkin-authoring-and-checks.md`.

### Purpose, rules, and examples

- The feature purpose states who or what benefits, what capability is enabled, and why it matters at the depth the intended readers need.
- Each load-bearing rule is stated generally and has a supported concrete example or a visible gap.
- Each example has enough starting context to select the behavior, one focal event or action, and an observable outcome.
- Contrasting examples differ on a named consequential condition rather than accidentally contradicting each other.

### Behavior and authorship

- Current and proposed behavior remain distinguishable.
- An outcome names something visible to a person or external system rather than an intention or hidden implementation state.
- Agent-supplied rules, phrasings, values, examples, and partitions retain agent authorship until settled.
- A single story has not silently become a universal rule, and a familiar test pattern has not generated unsupported cases.
- Unknown behavior, open conflicts, unillustrated rules, and unchecked step bindings remain visible rather than disappearing into polished target text.

### Failure signals and repairs

- **Syntax-led interview:** questions traverse `Feature`, `Rule`, `Scenario`, or step keywords. Return to one concrete behavior in the person's language.
- **Story without rule:** examples accumulate but no one can say what behavior each discriminates. Propose the smallest candidate rule for correction.
- **Rule without witness:** a general rule has no concrete example. Ask for a supported case or mark the gap.
- **Outcome restates action:** “when it saves, then it is saved” supplies no observable result. Ask what a person or external system notices.
- **Implementation capture:** steps become clicks, selectors, function calls, or database assertions without a purpose that makes them observable. Translate back to behavior or name the interface contract explicitly.
- **Missing selector:** apparently identical context and action yield different outcomes. Preserve both and investigate the state, rule, or conflict that distinguishes them.
- **Desired-as-observed:** proposed behavior is presented as current evidence. Restore status and authorship.
- **Invented binding:** a phrase is described as an existing executable step without a lexicon or code check. Mark it new or unchecked.
