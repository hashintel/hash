# Linear and GitHub writing

Apply this when creating or editing a Linear issue, a GitHub issue or pull request, or a comment on
either tracker. It governs only how the record is written. It does not invoke issue decomposition,
Wayfinding, steering, branch creation, or any other workflow protocol.

The tracker record communicates the mission; it does not become the mission's authority. Do not
turn a branch mission into a speculative issue graph.

## Two layers

Write for two readers:

1. **Visible summary** — the outcome, why it matters now, what this record establishes, material
   status, and consequential uncertainty. Use short, plain technical prose. Preserve causal and
   conditional relationships rather than replacing them with labeled fragments.
2. **`🏗️ Agent notes`** — implementation detail and mutable execution state: the full mission
   contract, constraints, exact checks, investigation notes, stack mechanics, and links to detailed
   evidence. This layer is optional when there is nothing useful to hide.

A title names the task, outcome, observable problem, or open decision. It should remain true if an
uncommitted implementation approach changes. Once changing a named mechanism is itself the agreed
task, naming that mechanism is accurate rather than overly technical.

The visible summary is human-owned. Before editing an existing record, fetch its current raw body,
preserve intervening edits, and make the smallest material change. Move detail into Agent notes
without deleting it. Do not regenerate a human summary from a local draft or from the notes below
it.

## Collapsed sections

For Linear, copy this wrapper exactly; include the spaces after `+++` and the blank lines:

```markdown
+++ 🏗️ Agent notes

Working detail.

+++
```

For GitHub, use native details:

```html
<details>
<summary>🏗️ Agent notes</summary>

Working detail.

</details>
```

The label is canonical. Copy it rather than retyping it: the emoji contains a variation selector,
so visually identical text can differ at the byte level.

## Linear

For a new agent-authored issue, put one or two short context paragraphs above Agent notes. A reader
should be able to recover the current state, its consequence, the intended outcome, and any
material uncertainty without expanding the section. A teammate-authored issue keeps its author's
shape unless that person delegates a rewrite.

Agent notes may hold execution detail, but current mission authority remains `MISSION.md` and the
branch/PR description. Link to an authoritative fact rather than copying it into several issues.
Use comments only for events worth notifying people about: a decision, changed confidence, changed
scope, a new risk, or resolution. Edit current state into the body; do not post progress narration.

The Linear approval gate, team, and project in `AGENTS.md` apply to every write. Fetch the raw body
immediately before an approved edit; rendered CLI output may contain headers or normalized Markdown
that are not part of the stored description.

## GitHub pull requests

Keep `.github/pull_request_template.md` and fill it rather than replacing it.

- **Purpose** stays visible: state the mission's imperative, the production throughline, what the
  proof establishes, and the claim it does not make.
- **What does this change?** starts with a short reviewer-facing description. Put the full mission
  contract and implementation record in the GitHub Agent notes wrapper beneath it.
- **Known issues**, **tests**, **how to test**, and **demo** stay visible because reviewers need
  them to judge the proof. Do not hide a consequential flag in Agent notes.
- Preserve and answer the template's checklists honestly; delete only the alternatives its comments
  instruct the author to delete.

At mission close, update the PR description with the observed result for every proof item, the
answer learned at each fog-line, and the flags carried forward. The PR description is the durable
record after squash; routine commit-by-commit narration is not.

## Comments

A comment appears in inboxes and feeds. Lead with the decision or material change in one or two
sentences. Add Agent notes only when supporting detail is necessary. State goes in the body; events
go in comments. A resolution comment may be longer, but its verdict remains visible before any
collapsed detail.

## Before writing

- The title states the real task or outcome, not an unearned mechanism.
- The visible prose explains enough to judge the change without expanding Agent notes.
- Technical working state is contained rather than deleted.
- Existing human-owned prose and intervening edits are preserved.
- Uncertainty is stated as uncertainty.
- The issue or PR remains a projection of the mission, not a replacement plan.
