# Issue tracker: Linear

Issues for this repo live in **Linear**, worked through the `linear` CLI (see the
`tool-linear-cli` skill). Long-form artifacts — specs, research write-ups, notes — stay in this
repo under `docs/planning/<effort>/` (see `documentation.md`); Linear issues link to them by repo path (and to Notion/Google
docs by URL). The issue is the tracker record; the repo file is the document.

How issue titles and bodies are written — the contract/execution-record split, outcome-shaped
titles, plain-prose context — is covered in `issue-writing.md`; it applies to every issue
created for this repo.

## Conventions

- **Default team**: `FE`. **Project**: `brunch`. Create issues with
  `linear issue create --team FE --project brunch`.
- Related work also lives on teams `PRO` (product) and `H` (HASH) — read/reference those freely;
  create there only when asked.
- Use `--description-file` / `--body-file` for any multi-line markdown (shell-escaping otherwise
  mangles it).
- Triage state is expressed through Linear workflow states and labels (see `triage-labels.md`).
- Comments and conversation history go on the issue as Linear comments.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `FE`, project `brunch`. If the content is long-form, commit it
under `docs/planning/<effort>/` and link the repo path from the issue description.

## When a skill says "fetch the relevant ticket"

`linear issue view <ID>` (e.g. `FE-1333`). The user will normally pass the identifier directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a Linear issue with one **child** sub-issue per ticket.

- **Map**: an FE issue in project `brunch`, labeled `wayfinder → map` (label group `wayfinder`,
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
`docs/planning/CONVERGENCE.md`'s seam/sequencing sections name it. The `lite` label and the
`brunch` project are filters, not ownership — an issue carrying both but reachable from no
root is captured-then-orphaned, the failure mode this rule exists to stop. Set the parent at
creation (`--parent FE-XXXX`), not in a later sweep.

Audit (run at arc close, alongside the legibility protocol's consolidation step):

```
linear issue mine --team FE --project brunch --label lite \
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
