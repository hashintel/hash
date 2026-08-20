# Writing issues

How to write Linear issues for this repo. Adapted from the dogsled `ds-writing-issues` skill
(the "issue contract"); motivated by team feedback that agent-authored tickets read as jargon —
not readable by non-engineers. Apply whenever creating an issue or editing an issue's title or
body.

Every issue serves two audiences: the team, who scan for direction and progress, and the agent,
which needs precise state to continue the work. Don't make one body serve both equally. Give
the issue a **contract** — the human-readable surface — above, and an **execution record** —
the working state — below a `---` divider. One source of truth, two projections. The rhetorical
mode changes by layer: **outcome language for scanning, explanatory language for understanding,
specification language for execution.**

## Who carries the contract

The test is structural. An issue **with no parent** ("root") carries the contract. A
**sub-issue** is exempt — it inherits legibility from its parent and keeps whatever shape its
driving workflow needs (a wayfinder ticket's `## Question`, a build ticket's own template).
Linear views filter sub-issues natively, so no marker label is needed. PM-authored issues are
theirs — comment, relate, and record verdicts; never rewrite their bodies.

## Title — the scan layer

Name the outcome: the behavior that becomes possible, the incorrect behavior that stops, the
property that becomes reliable, the question the work will answer. Verb + user/system outcome,
mechanism only as a trailing qualifier. Two tests, not a vibe:

- **Plan-change test** — the title stays substantially true if the implementation approach
  changes.
- **Concept vs. mechanism** — domain terms the wider team already uses ("elicitation",
  "Petrinaut", "net") belong in a title; internal class, package, framework, and algorithm
  names don't.

Title a bug by its observable symptom, not the hypothesized root cause. Title research by the
question or decision — never disguise a favored implementation as the purpose of an
investigation. Internal work names its real engineering outcome ("safer to test and release"),
not an invented end-user story.

## Context — the prose layer

One or two short paragraphs of plain prose at the top of the body, mandatory on every root
issue; two to four sentences suffice for a small task. The reader should be able to recover:
**current state → consequence → intended change → material status or uncertainty.**

The central rule: **use a list when the list itself is the information; use prose when the
relationship between the facts is the information.** Cause, impact, direction, status, and
uncertainty are relationships — prose. The failure mode is the property-bag (`Problem: … /
Impact: … / Solution: …`); write the explanation instead. Update the context only on a
*material* change — outcome, scope, status, risk, timing — never on routine progress.

## Wayfinder maps

A map is an aggregating root issue, so it carries both layers: a **plain-prose preamble**
(the context layer, written so a non-engineer understands what the effort is, why, and where it
stands) above a `---` divider, then the wayfinder working sections (Destination / Notes /
Decisions so far / Not yet specified / Out of scope) as the execution record. The map's
list-shaped sections are earned — enumerating many children's state genuinely is the
information; `Not yet specified` is the map's one home for known-unknowns. When resolving a
ticket updates the map, refresh the preamble's status sentence in the same edit.

## The execution record

Everything below the `---` divider is the working layer — optional and schema-free: hold
whatever the workflow needs (constraints, assumption tables, acceptance criteria, asset links).
Present when there's something to hold; never mandatory boilerplate. Technical detail is
additive — never deleted merely to simplify the issue.

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
shape, a PM's checklist, another team's surface — get **recommendation voice**: "I strongly
recommend against X, because…", "the practical considerations don't point this way for the
demo, IMO; I'd rather we…" — never "we've decided X" about a thing that is theirs to decide.
Analytic verdict vocabulary ("contradicted", "redefined", "superseded") belongs in internal
planning records (maps, decision docs, resolution comments on our own tickets); at the
boundary — comments on others' issues, messages to colleagues — it becomes a recommendation
with its reasons.

## Before publishing

- **Scan test** — can a teammate understand the direction from the title alone?
- **Plan-change test** — would the title survive a different implementation?
- **Prose test** — does the context explain causality, or list fragments?
- **Containment test** — are code-level details below the divider?
- **List test** — does every list hold genuinely parallel or ordered items?
- **Uncertainty test** — are open questions presented as uncertainty, not fact?
