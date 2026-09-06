---
name: gherkin-specification
description: Elicit or revise software behavior, maintain a recoverable behavior workpiece, and author or review honest Gherkin feature documents. Use for a behavior-specification interview, Gherkin document, executable-specification draft, or review of any of them.
---

# Capability-aware specification lifecycle

Use one conceptual lifecycle: orient, elicit or revise behavior, maintain the workpiece, author or revise Gherkin when useful, check, and deliver. Authoring is a thin projection and correction surface, not a separate modelling world. The current conversation may expose only part of the lifecycle; do not claim an unavailable check occurred.

## Select the runtime branch

### Interactive elicitation or revision

Read `universal-elicitation.md` and `gherkin-elicitation.md` before substantive questions or revision. Interview in the person's software and product vocabulary. Read `workpiece-template.md` when creating or materially revising the behavior account. Read `gherkin-authoring-and-checks.md` before drafting, reviewing, or delivering target text.

An early Gherkin draft may be offered after one coherent rule and example are understood when seeing the wording will help correction. Mark the wording as your rendering; agreement with it does not retroactively make every phrase person-originated evidence.

### Render or check only

Use the supplied behavior workpiece or Gherkin document as the complete input. Do not interview. Read `gherkin-authoring-and-checks.md`, preserve unaffected material, and perform only the checks the available capabilities support. If a consequential ambiguity prevents faithful authoring or review, report it and the smallest question a later interactive conversation must answer rather than inventing the behavior.

## Procedure

### Orient

Establish enough purpose and context to select one useful behavior thread: who needs the capability, what it enables, whether the account is current or proposed, the relevant software boundary, the intended readers, and whether an existing feature document or step vocabulary is available. Do not administer these concerns as an opening form.

### Elicit or revise behavior

For a new account, follow one concrete example through its starting context, one focal event or action, and observable outcome. Use contrasts and boundary cases to expose the rule it illustrates. For an existing account, first locate the disputed rule, example, or feature narrative and the behavior it changes. Use both elicitation references without turning their registers or the workpiece headings into question order.

### Maintain the workpiece

Keep a near-target behavior account in the person's vocabulary. Record feature purpose, rules, examples, domain terms, current-versus-proposed status, authorship, and consequential open matters. A target-shaped draft does not replace these distinctions while they remain load-bearing.

Whenever the workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit it again before render-only handoff and before workpiece-only delivery. A delta or a `.feature` document without its open matters is not the full recoverable account.

### Author or revise Gherkin

Read `gherkin-authoring-and-checks.md`. Translate only settled workpiece meaning into target structure. Preserve team language, localization, aliases, tags, and suite conventions when supplied. Do not invent step-definition bindings or implementation detail to make the document look executable.

For revision, preserve unaffected features, rules, examples, descriptions, comments, tags, and phrasing unless the changed behavior or a named check requires a delta.

### Check and deliver

Apply the checks supported by the current capabilities. Deliver the current behavior workpiece when open matters or authorship distinctions remain material. Deliver Gherkin text with a plain account of whether it was only authored, parsed, checked against a supplied step vocabulary, or actually executed elsewhere. Name unillustrated rules, ambiguous behavior, new or unchecked step phrases, assumptions, and omitted cases.

An explicit stop opens no new topic. Return the best useful workpiece and target draft with consequential gaps visible.

## Resource discipline

Read resources directly from this skill's advertised resource list. Do not treat Markdown links as includes, follow references recursively, or use target grammar as the sequence or vocabulary of ordinary interview questions.
