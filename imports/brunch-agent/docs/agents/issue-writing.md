# Writing issues and pull requests

How to write Linear issues and GitHub pull requests for this repo. Adapted from the dogsled
`ds-writing-issues` skill (the "issue contract"); motivated by team feedback that agent-authored
records read as jargon and are not readable by non-engineers. Apply whenever creating or editing
an issue title or body or a pull-request title or description.

This file governs **structure and house style**. Write the visible layer as **plain technical
prose** for an informed colleague who does not know the implementation. The style is Google
Developer Documentation plus GOV.UK plain English, with INCOSE precision but not INCOSE
formality: complete sentences, short paragraphs, active voice, concrete nouns and direct verbs.
State causal, temporal, and conditional relationships explicitly. Keep sentence structure
simple without simplifying the idea; prefer two clear sentences over one compressed sentence.

Use shared product and system vocabulary, but avoid implementation-specific names unless they
are necessary to explain the behavior. Do not write in telegraphic, checklist, ticket,
changelog, or runbook style. Avoid fragments and labeled fields. Use a list only when readers
need to compare or enumerate parallel items; use prose when the relationship between facts is
the information.

The org technical-writing skill drafted in
[internal-agents#20](https://github.com/hashintel/internal-agents/pull/20) (GEN-449) supplies the
plain-word and banned-words checks. Search all prose against that list before publishing,
regardless of the PR's merge state; exact machine text is exempt. The list transcribes what
colleagues asked for.

Every issue serves two audiences: the team, who scan for direction and progress, and the agent,
which needs precise state to continue the work. Don't make one body serve both equally. Give
the issue a **contract** — the human-readable summary — above, and an **execution record** —
the working state — inside a collapsed `🏗️ Agent notes` section below. The human driving the
work owns the summary; agents may draft or update it on that person's behalf. The rhetorical
mode changes by layer: **task language for scanning, explanatory language for understanding,
specification language for execution.**

## Who carries the contract

The test is authorship, not parentage. Every issue an agent authors from this repo on behalf of
the human driving the work carries the contract, including every sub-issue. A teammate-authored
issue outside this workflow keeps its author's structure; comment, relate, and record verdicts
without rewriting its title or body unless that author delegates the change.

Before changing an issue that carries the contract, fetch its current raw body and read the
human-owned summary.
Preserve edits made since the agent last saw it. Change that summary only when acting on behalf
of its owner and only for a material change. Never regenerate it from a stale local draft.

## Title — the scan layer

Start with an active verb and name the concrete task, problem, or decision in the fewest words
that remain clear. Examples include "Keep issues easy to scan," "Stop duplicate
notifications," "Decide how agents retrieve planning decisions," and "Map the September demo."
Research, planning, documents, and maps are tasks too; use verbs such as "decide," "test,"
"write," "map," or "plan."

Match the title to the issue's current commitment. If the approach is undecided, name the
problem or decision rather than a favored implementation. Once an approach is agreed and
implementing it is the task, name it directly. Domain terms the wider team already uses
("elicitation," "Petrinaut," "net") belong in a title; internal class, package, framework, and
algorithm names belong only when changing that named mechanism is itself the task.

Title a bug by its observable symptom, not the hypothesized root cause. Internal work names its
real engineering task rather than inventing an end-user story.

## Context — the prose layer

One or two short paragraphs of plain prose at the top of the body, mandatory on every issue that
carries the contract; two to four sentences suffice for a small task. The reader should be able
to recover:
**current state → consequence → intended change → material status or uncertainty.**

The central rule: **use a list when the list itself is the information; use prose when the
relationship between the facts is the information.** Cause, impact, direction, status, and
uncertainty are relationships — prose. The failure mode is the property-bag (`Problem: … /
Impact: … / Solution: …`); write the explanation instead. Update the context only on a
*material* change — outcome, scope, status, risk, timing — never on routine progress.

When an issue comes from user, stakeholder, or teammate feedback, quote their words directly
and link the original conversation when its audience is allowed to read it. A summary can lose
the pain or qualification that made the feedback useful; prefer the source when it is
available.

## Wayfinder maps

A map is an aggregating issue, so it carries both layers: a **plain-prose preamble**
(the context layer, written so a non-engineer understands what the effort is, why, and where it
stands), then, inside `🏗️ Agent notes`, the wayfinder working sections (Destination / Notes /
Decisions so far / Not yet specified / Out of scope) as the execution record. The map's
list-shaped sections are earned — enumerating many children's state is the
information; `Not yet specified` is the map's one home for known-unknowns. When resolving a
ticket updates the map, refresh the preamble's status sentence in the same edit.

## The execution record

The working layer lives inside a `🏗️ Agent notes` section that Linear and GitHub render closed
by default:

```
+++ 🏗️ Agent notes

…working detail…

+++
```

on Linear; `<details><summary>🏗️ Agent notes</summary>…</details>` on GitHub PR descriptions
and long comments. Linear requires the space after `+++` and a blank line on both sides of the
working detail; its API inserts that whitespace when it is absent. The label is one canonical
string: **copy the complete wrapper from here, never retype it**. The emoji carries a variation
selector, so visually identical labels can have different bytes. Write bare domains as explicit
Markdown links when raw-body fidelity matters; Linear otherwise expands them into link syntax.
The section is **agent-maintained**: agents update it by fetching the raw body, editing, and
pushing back (see `issue-tracker.md` for the safe process), so a human edit inside it can be
overwritten. The human-owned summary outside this section must be preserved unless its owner
has delegated the change.

The content is optional and schema-free: hold whatever the workflow needs (constraints,
assumption tables, acceptance criteria, asset links). Present when there's something to hold;
never mandatory boilerplate. Technical detail is additive — never deleted merely to simplify
the issue, only moved into `🏗️ Agent notes`.

## Pull requests

A pull request uses the same two layers. Its title is `{ISSUE-ID}: {current Linear issue title}`
as required by `git-workflow.md`. The visible body is one short account in plain technical prose
of what the branch establishes and any material limit on that claim. Do not turn it into `What`,
`Why`, `Testing`, or other labeled sections. Put rationale, implementation detail,
verification, and stack context inside the GitHub `🏗️ Agent notes` wrapper shown above.

When reshaping an existing pull request, preserve its detailed record byte-for-byte inside the
wrapper. A title or outer summary may change only to improve the scan layer without changing the
recorded claim or status.

## Comments

A comment lands in inboxes and feeds. Write it as a notification you chose to send the team.
Its visible content says what was decided or what changed in confidence, risk, or scope, in one
or two short sentences. Implementation detail about that change goes into a collapsed
`🏗️ Agent notes` section in the comment or the issue body. Two boundaries:

- **Progress narration is never a comment.** "Tried X, now attempting Y" is working state — it
  belongs in the issue body's `🏗️ Agent notes`, edited in place. If nothing was decided and no
  belief changed, there is no comment to write.
- **State goes in the body; events go in comments.** Current truth (status, plan,
  findings-so-far) is edited into the body, where the next reader looks. Comments are the
  chronological record of what happened.

The resolution comment keeps its length exemption: verdict paragraph first, detail in
`🏗️ Agent notes`. Linear **project updates** reach a wider audience than comments — see
`issue-tracker.md`.

## One kind of entity

Investigative work — research, a prototype, a spike — becomes a **sub-issue** holding both the
query and the result. Never a comment thread used as a workspace; never a body checklist as
decomposition. The single exception is the immutable **resolution comment** posted when an
issue closes — a closing act, not a workspace.

## Ownership direction

State a fact once; everywhere else links. Within an issue, a plan links to a decision, never
restates it. Across issues, a sub-issue never re-explains a fact its parent's context already
states. Long-form artifacts live in the repo (`docs/planning/<effort>/`) and are linked by
path, per `issue-tracker.md`.

## Voice and authority

Match the writing's authority to the author's actual remit. Decisions inside the dev remit —
how something will be built, in what order, on what architecture — are stated plainly in first
person ("I'm rebuilding the core greenfield because…"). Claims owned by someone else — product
shape, a PM's checklist, another team's area — get **recommendation voice**: "I strongly
recommend against X, because…", "the practical considerations don't point this way for the
demo, IMO; I'd rather we…" — never "we've decided X" about a thing that is theirs to decide.
Analytic verdict vocabulary ("contradicted", "redefined", "superseded") belongs in internal
planning records (maps, decision docs, resolution comments on our own tickets); at the
boundary — comments on others' issues, messages to colleagues — it becomes a recommendation
with its reasons.

## Vocabulary — three tiers

Apply the technical-writing rules first. Then use these three tiers, judged by whether the
reader resolves the word without a lookup:

1. **Industry-standard terms** (thread, pipeline, module, interface): free everywhere.
2. **Terms from technical literature**: use in `🏗️ Agent notes` only when no plainer exact phrase
   fits. A visible summary may use one only after glossing it at first mention and adding it to
   `CONTEXT.md`.
3. **Locally coined terms**: do not coin one for an issue. When an issue inherits one from a
   linked source, use it only in `🏗️ Agent notes`.

Check banned constructions and filler with a string search. Judge other nouns by whether the
reader can resolve them without a lookup.

## Before publishing

- **Scan test** — does the title start with an active verb and name the task compactly?
- **Commitment test** — does the title avoid committing to an approach that is still undecided?
- **Prose test** — does the context explain causality, or list fragments?
- **Containment test** — are code-level details inside `🏗️ Agent notes`?
- **Word test** — has all prose been searched against the technical-writing banned list, and
  does every term of art in the visible summary pass the glossary test?
- **List test** — does every list hold parallel or ordered items?
- **Uncertainty test** — are open questions presented as uncertainty, not fact?
