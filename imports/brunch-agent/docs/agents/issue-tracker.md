# Issue tracker: Linear

Issues for this repo live in **Linear**, worked through the `linear` CLI (see the
`tool-linear-cli` skill). Long-form artifacts — specs, research write-ups, notes — stay in this
repo under `docs/planning/<effort>/` (see `documentation.md`); Linear issues link to them by repo path (and to Notion/Google
docs by URL). The issue is the tracker record; the repo file is the document.

How issue titles and bodies are written — the contract/execution-record split, outcome-shaped
titles, plain-prose context — is covered in `issue-writing.md`; it applies to every issue an
agent authors from this repo.

## Conventions

- **Default team**: `FE`. **Project**: `brunch-agent`. Create issues with
  `linear issue create --team FE --project brunch-agent`.
- Related work also lives on teams `PRO` (product) and `H` (HASH) — read/reference those freely;
  create there only when asked.
- Use `--description-file` / `--body-file` for any multi-line markdown (shell-escaping otherwise
  mangles it).
- Triage state is expressed through Linear workflow states and labels (see `triage-labels.md`).
- Comments and conversation history go on the issue as Linear comments, shaped per
  `issue-writing.md`'s comment rules: the decision or change in one or two sentences, with
  detail in `🏗️ Agent notes`.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `FE`, project `brunch-agent`. If the content is long-form, commit
it under `docs/planning/<effort>/` and link the repo path from the issue description.

## When a skill says "fetch the relevant ticket"

`linear issue view <ID>` (e.g. `FE-1333`). The user will normally pass the identifier directly.

## Editing issue bodies from the CLI

Bodies carry collapsed `🏗️ Agent notes` sections (`issue-writing.md`), and agents maintain
them by fetching, editing, and pushing the raw description. Fetch immediately before every
write, preserve the human-owned summary, and apply the smallest material change; never push a
stale local copy. Three more facts keep that process safe:

- **Read the raw description via GraphQL**, never via `issue view` — view prepends a
  title/state header that would be pushed back into the body:

  ```bash
  linear api --variable id=FE-XXXX <<'GRAPHQL' | jq -r '.data.issue.description'
  query($id: String!) { issue(id: $id) { description } }
  GRAPHQL
  ```

- **Linear normalizes markdown on save** (collapsed-section spacing, `-` → `*` bullets). A diff
  against your draft is not drift; don't "fix" it.
- **Issue references in Linear bodies and comments are full URLs**
  (`https://linear.app/hash/issue/FE-XXXX`), which Linear renders as issue chips — a bare ID
  stays dead text. In repo documents the opposite holds: bare IDs with a gloss, per
  `documentation.md`.

## Project updates

Linear project updates (`linear project-update`) reach a wider audience than issue comments.
They give a plain-prose summary of decisions, confidence changes, risks, and opportunities
since the last update, using the native health field. They contain no working detail, and empty
sections are omitted. Draft one from the changes recorded in issue comments since the last
update. Publish it to the `brunch-agent` project.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a Linear issue with one **child** sub-issue per ticket.

- **Map**: an FE issue in project `brunch-agent`, labeled `wayfinder → map` (label group `wayfinder`,
  children `map` / `research` / `prototype` / `grilling` / `manual-task` — created 2026-08-11;
  `manual-task` stands in for the skills' `task` type because the workspace already has an
  unrelated "Task" label). The issue description holds the map body: Destination / Notes /
  Decisions so far / Not yet specified / Out of scope.
- **Child ticket**: a sub-issue of the map (native parent relation), same team and project,
  carrying its `wayfinder → <type>` label. The description holds the question.
- **Blocking**: Linear's native **blocks / blocked-by** relations. A ticket is unblocked when
  every issue blocking it is closed (Done or Canceled).
- **Frontier**: open, unblocked, **unassigned** sub-issues of the map — lowest issue number
  first.
- **Claim**: assign the issue to yourself (the dev driving the map) before any work.
- **Resolve**: post the answer as a comment on the issue, set state **Done**, then append a
  one-line gist + link to the map issue's *Decisions so far* section (edit the map description).
- **Out of scope**: set state **Canceled** and record the gist + reason in the map's
  *Out of scope* section.
- Pre-existing product issues (the PM's stubs) are **referenced** from map tickets via *related*
  relations — never duplicated as wayfinder tickets and never closed by the map. A wayfinder
  ticket that validates a product issue links to it and records its verdict in the resolution
  comment.

## The registry rule

Every issue this project creates is **reachable from a root**: either it is a sub-issue
(directly or transitively) of a root map — currently FE-1383 (build) and FE-1357 (demo +
plugin spec) — or a sub-issue of a named sweep ticket (FE-1401-style), or it *is* a root and
`docs/planning/_shared/CONVERGENCE.md`'s seam/sequencing sections name it. The `brunch-agent`
project is a filter, not ownership — an issue in the project but reachable from no root is
captured-then-orphaned, the failure mode this rule exists to stop. Set the parent at creation
(`--parent FE-XXXX`), not in a later sweep.

Audit (run at arc close, alongside the legibility protocol's consolidation step):

```
linear issue mine --team FE --project brunch-agent \
  -s triage -s backlog -s unstarted -s started --limit 0 --no-pager
```

then check each row without a parent or relation against the roots above. An orphan gets a
parent or an explicit root listing in CONVERGENCE.md — silence is not an option it has.

## Historical note

Before 2026-08-11 this repo tracked issues as local markdown under `.scratch/<feature-slug>/`
(map at `map.md`, tickets at `issues/NN-<slug>.md`; that tree now lives under `docs/planning/`). The completed `elicitation-kernel` effort
remains in that form as the canonical archive (now at `docs/planning/elicitation-kernel/`), and is **mirrored in Linear for team
visibility** as FE-1366 (map) with sub-issues FE-1367–FE-1379, all Done, blocking relations
preserved. New efforts go to Linear directly.
