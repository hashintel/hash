# Side quest — Collapse brunch git guidance onto HASH globals

## Status

Active. Owner-authorized documentation remediation inside Mission 7. This file
is not a second mission and does not change Step A product work, teaching, or
oracles.

## Relationship to the live mission

Mission 7 remains the sole execution authority in [`MISSION.md`](MISSION.md).
This quest is **not** a residual product failure of construct-and-explain. The
owner asked for a written remediation after a HASH-wide skills discussion: Tim
objected that brunch restates repo-wide git/PR policy inside
`libs/@hashintel/brunch-agent`; the counter is that brunch is a context root
agents are pointed at directly.

The residual failure is scope leakage in standing agent guidance. Agents
executing this mission read [`AGENTS.md`](AGENTS.md) and
[`docs/agents/git-workflow.md`](docs/agents/git-workflow.md) as local law and
can treat HASH contributing conventions as brunch-only, or treat brunch
identity rules as if they were already global. That does not alter Mission 7's
imperative, throughline, or proof. It is a documentation-only remediation: on
close, record the audit in [`MISSION.next.md`](MISSION.next.md) and remove this
file. Do not invent a separate evidence document.

## Imperative

Make brunch's git/Linear/PR standing docs state only what would be **wrong
elsewhere**, and cite HASH globals for the rest, without lifting brunch
identity rules into the repo and without touching shipped product skills.
Standing stack guidance names `gh stack`, not Graphite. Do not prescribe
`git town` as team or agent law.

## Throughline

```text
inspect the three tiers as they exist
→ classify each git-workflow sentence: duplicate / brunch delta / dead cite
→ edit brunch docs to deltas + citations
→ leave product SKILL.md files and MISSION.md untouched
→ owner-gate any root AGENTS.md sentence
→ inspect before/after
→ record close in MISSION.next.md
→ remove SIDE_QUEST.md
```

## Locality test

A rule is local only if it would be **wrong** in another HASH package, not
merely unneeded there. Unneeded-elsewhere facts belong in
`.agents/skills/managing-git-workflow` or root `AGENTS.md`.

The three tiers, already half-named at root `AGENTS.md`:

1. **Global standing** — root `AGENTS.md` (`CLAUDE.md` → symlink).
2. **Global on-demand** — `.agents/skills/` (Claude aliases under
   `.claude/skills/`; `skill-rules.json` lists exactly those 15 skills; nothing
   auto-discovers nested trees).
3. **Project standing** — package `AGENTS.md` plus, for brunch, the
   `docs/agents/*.md` procedures it cites.

Brunch has no developer-facing `SKILL.md`. Tim quoted
`docs/agents/git-workflow.md`. The four package `SKILL.md` files (plus the
evaluation-instrument copy) are Flue product assets.

## Stack-tool posture

HASH is moving off Graphite. Tim's quotes were leftovers from that rewrite:
`docs/agents/git-workflow.md` already says plain Git plus `gh stack`. Do not
put Graphite, `gt`, or a Graphite skill back into standing agent docs.

Replacement, for standing guidance:

- **Team / agent default:** `gh stack` for stack-aware operations on a branch
  based on another unmerged branch.
- **Owner-optional local:** `git town` is allowed for Lu's own machine. It is
  not brunch law and must not appear as a required agent command.

Historical evidence that a restack was done with Graphite (`gt move`,
"Graphite ancestry", dated restack notes) stays as provenance. Do not rewrite
archives to pretend `gh stack` performed those operations.

## Recommended remediations

### R1 — Collapse `docs/agents/git-workflow.md` to deltas

**Do this on this branch.** Cite
`.agents/skills/managing-git-workflow/SKILL.md` as the source for HASH branch
naming, PR title form, Linear linking, and filling
`.github/pull_request_template.md`. Delete the restated copies and the
plain-`git` tutorial (`status`, `diff`, `log`, `add`, `commit`).

Keep only brunch deltas:

| Keep | Why local |
| --- | --- |
| One Linear issue = one Git branch = one GitHub PR | Brunch identity and visibility rule, not HASH contributing law. Tim has seen multi-PR stacks on one issue; do not lift this. |
| Mission lifecycle (state `MISSION.md`, then issue, then branch/PR) | Execution authority is the mission, not the ticket. |
| `gh stack` parent/child ordering; a stacked child does not inherit the parent's issue | Wrong as a repo-wide law. |
| Shared-worktree tenancy: never stash, reset, clean, or relocate another tenant's changes | Brunch worktree sharing; wrong as general HASH policy. |
| Open as draft (`gh pr create --draft` / `gh stack submit --auto`) | Brunch habit, not HASH law. |
| Pointer to [`issue-writing.md`](docs/agents/issue-writing.md) for the visible-summary / `🏗️ Agent notes` split | No global twin. |

PR-title extra, if kept, is one line: when a HASH Linear issue exists, use
`{ISSUE-ID}: {Linear issue title in sentence case}`. The identifier casing
already lives in the global skill.

### R2 — Fix the dangling `gh-stack` skill cite; keep Graphite gone

**Do this on this branch.** `git-workflow.md` currently tells agents to use
"the non-interactive flags from the `gh-stack` skill." That skill is not in
this repository.

Inline the `gh stack` flags brunch actually uses, or drop the skill name and
point at `gh stack --help` / observed invocations. Do not cite an out-of-repo
plugin as if it were in-tree. Do not replace the dead cite with Graphite, `gt`,
or `git town`.

The one live standing leftover in this context root is
[`evaluations/README.md`](evaluations/README.md) ("After a rebase or Graphite
restack"). Neutralize that to rebase / stack restack without naming Graphite
as a current tool. Leave `docs/evidence/` and `docs/mission-archive/` Graphite
sentences as historical fact.

### R3 — Tighten the brunch `AGENTS.md` retained-facts pointer

**Do this on this branch.** Keep the pointer at `docs/agents/git-workflow.md`
for brunch lifecycle. Add that HASH naming, PR title, template, and Linear
linking come from `managing-git-workflow`. Do not restate those rules in
`AGENTS.md`. Do not edit the three laws, mission contract, or topology gates.

### R4 — Name the three tiers in root `AGENTS.md` (owner gate)

**Do not do this unless the owner accepts a HASH-wide standing-guidance edit
on this PR.** Root `AGENTS.md` already says package standing lives in package
`AGENTS.md` and on-demand workflows live in `.agents/skills`. One additional
sentence can name global standing vs on-demand vs package standing and the
locality test above.

That sentence is the argument-stopper. It is not required to fix brunch's
copies. If it would broaden this PR past Mission 7's landing story, defer it
to a HASH guidance change with its own issue/branch/PR.

Do **not** add branch, PR, or Linear law to root `AGENTS.md`. Do **not** make
1:1:1 a HASH default in this quest. If HASH later wants "prefer one PR per
issue unless the stack is the point," that belongs in `managing-git-workflow`
as a default, not a law, under separate authority.

### R5 — Leave these files alone

- Product skills:
  `packages/core/src/skills/elicitation/SKILL.md`,
  `packages/plugin-gherkin/src/skills/gherkin-specification/SKILL.md`,
  `packages/plugin-dafny/src/skills/dafny-verification/SKILL.md`,
  `packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`,
  and
  `evaluations/protocols/gherkin-shape-c-paper-v1/instrument/gherkin-specification/SKILL.md`.
- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) and
  [`docs/agents/issue-writing.md`](docs/agents/issue-writing.md) — no global
  twin.
- [`MISSION.md`](MISSION.md).
- `.agents/skills/managing-git-workflow` in this quest (cite it; do not
  rewrite it).
- No new brunch developer skill and no `.agents/skills` tree under this
  directory.

### Out of scope (separate sweep)

TypeScript standing rules in root `AGENTS.md` vs Rust-only skills, and whether
`meaningful-identifiers` still earns a skill slot. Those are HASH guidance
hygiene, not brunch scope leakage.

## Proof

Documentation-only. Each leaf is an inspection, not a product demo.

1. [`MISSION.md`](MISSION.md) is byte-identical.
2. The five product/instrument `SKILL.md` files listed in R5 are byte-identical.
3. `docs/agents/git-workflow.md` cites `managing-git-workflow` for naming, PR
   title, template, and Linear linking, and no longer contains the plain-`git`
   tutorial or a restated branch-name example that duplicates the global
   skill's `ln/fe-…` scheme.
4. The brunch deltas in the R1 table remain, in that file or in `AGENTS.md`
   retained facts, with 1:1:1 still framed as brunch identity.
5. No in-tree brunch **standing** agent doc cites a `gh-stack` skill as if it
   lived in this repo, or names Graphite / `gt` / `git town` as required
   agent workflow. Oracle:
   `rg -n 'gh-stack skill|graphite|\\bgt |git town' libs/@hashintel/brunch-agent --glob '!docs/evidence/**' --glob '!docs/mission-archive/**'`.
   Historical evidence and archives may still mention Graphite.
6. `issue-tracker.md` and `issue-writing.md` are unchanged unless a broken
   relative link forces a one-line path fix.
7. If R4 is accepted: root `AGENTS.md` gains at most the tier/locality
   sentence and no new git/PR/Linear law. If R4 is declined: root `AGENTS.md`
   is byte-identical.
8. After acceptance, this file is removed and
   [`MISSION.next.md`](MISSION.next.md) carries a short close note (what
   changed, what stayed brunch-local, that R4 was accepted or deferred). No
   `docs/evidence/` file.

This proof establishes guidance locality. It does not prove Mission 7
construction, explanation, or readiness.

## Constraints

- Budget: **USD 0.00**. No paid model, judge, or provider call.
- Do not edit `MISSION.md` or product/instrument `SKILL.md` files.
- Do not implement Mission 7 A1–A6, change teaching, or touch Flue mounting.
- Do not lift 1:1:1, draft-PR habit, worktree tenancy, or stack child-identity
  into HASH globals.
- Do not create a brunch developer skill or a `skill-rules.json` entry.
- Do not perform the out-of-scope HASH skills sweep.
- Do not reintroduce Graphite or `gt` into standing guidance. Do not make
  `git town` an agent requirement.
- Do not rewrite historical Graphite restack evidence as if it had been
  `gh stack`.
- Linear writes still require explicit approval; this quest needs none.
- Preserve unexpected worktree changes. Stage explicit paths.

## Stop or reorient

Stop and report the smallest blocker if:

- collapsing a sentence would drop a brunch delta from the R1 table;
- fixing the `gh-stack` cite seems to require inventing flags not observed in
  brunch usage or `gh stack --help`;
- an edit to `managing-git-workflow` or root `AGENTS.md` looks necessary to
  keep brunch coherent and the owner has not accepted that HASH-wide change;
- a product `SKILL.md` appears to need a guidance edit;
- standing Graphite wording cannot be neutralized without rewriting historical
  restack evidence as current procedure;
- or the work starts to read as a second mission or a HASH contributing-policy
  rewrite.

Do not solve a blocker by copying global policy back into brunch, or by
deleting a brunch-only rule because it is unneeded elsewhere.

## Expected touched paths

```text
libs/@hashintel/brunch-agent/
├── AGENTS.md                         ~ retained-facts pointer only
├── MISSION.md                        unchanged
├── MISSION.next.md                   ~ close note only
├── SIDE_QUEST.md                     + now; - at close
├── docs/agents/git-workflow.md       ~
└── evaluations/README.md             ~ drop standing Graphite wording only

AGENTS.md (repo root)                 ? R4 only, owner-gated
```
