# Gherkin Authoring and Checks

Read this when drafting, revising, reviewing, or delivering Gherkin. Consume the current behavior workpiece or supplied feature document; do not reread the transcript as the primary behavior model.

Authoring translates recorded software behavior into Gherkin structure. It may normalize wording, factor repeated setup, or choose an equivalent keyword alias. It may not invent behavior, step bindings, tags, examples, or suite conventions to make the document look complete.

The [Cucumber Gherkin reference](https://cucumber.io/docs/gherkin/reference) is the public semantic authority for this draft. An installed parser and its version are the authority for a concrete project's syntax acceptance; this resource routes and interprets checks rather than replacing either source.

## Authoring boundary

Before authoring, confirm that the feature purpose is intelligible and each target example has a usable starting context, focal event or action, and observable outcome. If materially different behaviors remain possible because one distinction is missing, formulate the smallest resolving question. Ask it only when interactive elicitation is available; in render-only execution, report it and stop the unsupported rendering path.

Honor the person's spoken language and supplied team conventions. If the document uses a non-English Gherkin locale, put the appropriate `# language: <code>` header on the first line. Otherwise English is the default. Do not translate the domain language merely to fit an assumed suite convention.

## Document structure

- Emit one `Feature:` per `.feature` document. Give it a short name and a description that preserves the capability's purpose and value when useful.
- Use `Rule:` only when it expresses a genuine business rule and groups examples that illustrate that rule. Gherkin permits examples directly under a feature; do not manufacture a rule solely to fill structure.
- Use `Scenario:` or its `Example:` synonym consistently with supplied team convention. Each example should tell one concise behavior story; Cucumber recommends three to five steps, but semantic clarity—not a step-count gate—decides when to split.
- Map supported starting context to `Given`, the focal event or action to `When`, and externally observable results to `Then`. Use `And` and `But` to continue the preceding semantic role. Do not use the keyword to disguise a second unrelated action or outcome.
- Keep implementation detail out of steps unless the interface or protocol is itself the behavior contract. Prefer the actor's goal and externally visible messages, reports, state, or responses over clicks, selectors, functions, and database inspection.
- A step's keyword is not part of Cucumber's definition match. Do not author identical step text under different semantic keywords as though they were distinct definitions.

## Factoring and data

### Background

Use `Background:` only for context shared by every following example at the same `Feature` or `Rule` level. It runs before each example, after before hooks. Keep it short and vivid; the Cucumber reference recommends no more than four lines before considering higher-level phrasing or another grouping. Do not move behavior essential to understanding an example out of sight merely to remove repetition.

Only one `Background` is allowed per `Feature` or `Rule`. Different setup families usually indicate separate rules, features, or explicit context in each example.

### Scenario Outline and Examples

Use `Scenario Outline:` when the same behavior structure is supported for several explicit value combinations. Every `<placeholder>` must name an `Examples:` table header, and the outline must have at least one data row. Do not turn materially different rules into one table merely because their sentences are similar.

Parameters may appear in step text, descriptions, Doc Strings, and Data Tables. Preserve cell values exactly enough to discriminate the supported examples.

### Step arguments

Use a Data Table when one supported step consumes a list or record-shaped value, not as a substitute for several behavioral examples. Escape newline as `\n`, a literal pipe as `\|`, and a backslash as `\\` inside table cells.

Use a Doc String for supported multiline text. Prefer `"""` delimiters for broad editor support; a content type may follow the opening delimiter when supplied or useful. Preserve indentation relative to the opening delimiter.

## Descriptions, tags, and comments

Free-form descriptions may follow `Feature`, `Rule`, `Background`, `Scenario` or `Example`, and `Scenario Outline`; Markdown is permitted and ignored during execution. Use descriptions for purpose or rationale that helps readers, not for unresolved claims presented as settled behavior.

Tags are metadata rather than evidence of behavior; a test suite may use them for selection or conditional hooks. Preserve supplied tags or report the need for suite policy; do not invent organizational metadata during elicitation.

Comments begin with `#` at the start of a new line after optional indentation. Gherkin has no block comments. Do not hide a second epistemic workpiece in comments; keep unsupported behavior and open matters in the companion workpiece.

## Checks

### Behavior fidelity

- Each feature description, rule, example, and step traces to the current workpiece or supplied document; authoring choices remain distinguishable from person-supplied wording where consequential.
- Every `Rule` has at least one example that illustrates it, or the missing example is reported outside the target as a delivery gap.
- A reader can identify the starting state, focal event or action, and observable outcome of each example without guessing hidden implementation.
- Examples with apparently identical context and action do not assert different outcomes unless a named condition, rule, or unresolved conflict distinguishes them.
- Current behavior has not silently replaced proposed behavior or vice versa.

### Gherkin structure

- The first primary keyword is `Feature:` and the file contains exactly one feature.
- Keywords that require a colon have one; step keywords do not gain one. The parser, when available, is the authority for exact grammar.
- A `Background` appears before the first example at its level and no level has more than one.
- Every Scenario Outline placeholder is supplied by each applicable `Examples` table, and every table has a header and at least one row.
- Doc String delimiters close, Data Table rows are well formed, comments begin on their own lines, and localization is declared consistently.

### Step language and execution claims

- Step phrases use the team's domain language and do not differ accidentally in tense, synonyms, or incidental wording.
- When a step lexicon or codebase index is available, each phrase is classified as an exact known binding, an intentional new phrase, or an unresolved near match. Without such a source, binding remains unchecked.
- Parse validity proves only that a Gherkin parser accepts the document. Binding validity additionally requires matching step definitions. Executability additionally requires the relevant test runtime, hooks, fixtures, and system path. Never substitute one claim for another.

### Revision

- The changed behavior and target delta are named before editing.
- Unaffected descriptions, rules, examples, tags, comments, and team phrasing remain unchanged unless a supported factoring or check requires movement.
- Factoring repeated context into a Background or examples into an Outline preserves behavior and does not hide a meaningful distinction.
- New or changed phrases have an explicit binding status rather than silently inheriting an old step's implementation.

## Delivery

Deliver each target document as a complete `.feature` text, labeled with its intended filename when known. Also deliver the current behavior workpiece when unresolved authorship, assumptions, conflicts, unillustrated rules, unchecked bindings, or other consequential gaps remain.

State plainly:

- what behavior was elicited, revised, authored, or merely reformatted;
- which examples illustrate which rules and what remains unsupported;
- whether each document was authored only, parser-checked, binding-checked against a named source, or executed elsewhere;
- which assumptions, authoring normalizations, new step phrases, omissions, and open matters remain; and
- the smallest consequential question, reference source, or capability needed next.

Do not replace that account with a closed outcome label or call a parser-valid document an executable specification without the corresponding evidence.
