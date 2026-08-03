---
name: managing-git-workflow
description: Git workflow for HASH including branch naming, PR creation, and PR reviews. Use when creating branches, making commits, opening pull requests, or reviewing PRs.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - git
      - branch
      - pull request
      - PR
      - commit
      - merge
      - review
    intent-patterns:
      - "\\b(create|open|submit|review)\\b.*?\\b(PR|pull request|branch)\\b"
      - "\\b(name|naming)\\b.*?\\bbranch\\b"
      - "\\bH-\\d+\\b"
---

# Managing Git Workflow

Standardize git workflow for HASH development, ensuring traceability between code changes and Linear issues.

## Branch Naming

**Format:** `<shortname>/h-XXXX-description`

- `shortname`: Developer identifier (first initial, nickname, etc.)
- `h-XXXX`: Linear ticket number (lowercase 'h')
- `description`: Brief kebab-case description

**Examples:**

- `t/h-4892-support-baseurl-and-version-filter`
- `alice/h-1234-add-user-authentication`
- `bob/h-5678-fix-database-connection`

**Why this matters:**

- Links code changes to Linear issues
- Enables progress tracking on tickets
- Maintains clear development history

## Pull Request Creation

### PR Title Format

**Format:** `H-XXXX: Description`

- Use uppercase 'H' in PR titles (unlike branch names)
- Keep description clear and concise

**Examples:**

- `H-4922: Add branch naming instructions`
- `H-1234: Implement user authentication system`
- `H-5678: Fix database connection timeout`

### PR Template

Use the template at `.github/pull_request_template.md`. Key sections:

1. **Purpose** - High-level explanation of what and why
2. **Related links** - Linear issues, discussions, context
3. **What does this change?** - Specific implementation details
4. **Pre-merge checklist:**
   - Publishable library changes (npm/Cargo)
   - Documentation requirements
   - Turbo Graph impact
5. **Known issues** - Intentional omissions or limitations
6. **Next steps** - Planned follow-ups
7. **Tests** - Automated test coverage
8. **How to test** - Manual testing instructions
9. **Demo** - Screenshots or videos

## Merge Queue

`hashintel/hash` merges through a GitHub **merge queue**. This changes both how a PR is enqueued and how that can be verified.

### `auto_merge` is not evidence

Enqueuing a PR ("Merge when ready") does **not** populate the PR's `auto_merge` field — it stays `null` even on a completely successful enqueue. Never verify an enqueue by reading `auto_merge`: it reads `null` in the success case and the failure case alike, so it carries no information.

Verified 2026-07-31 on PR #9127: a human's successful enqueue at `14:07:40Z` produced no `auto_merge_enabled` event and no `auto_merge` value — indistinguishable from a "failed" one.

### Verifying an enqueue

Use either:

- a recent `added_to_merge_queue` event in `GET /repos/hashintel/hash/issues/<NUMBER>/timeline`
- fresh `merge_group` workflow runs on a `gh-readonly-queue/<base>/pr-<NUMBER>-<sha>` ref

### Re-queuing after an ejection

Re-queuing works from agent sessions via the GitHub MCP `enable_pr_auto_merge` tool. Its response is success-shaped with an empty `method` and `enabled at` — that empty shape is the expected signature of the repo routing to the queue instead of creating an `autoMergeRequest`, not a failure. (Verified on #9127: `added_to_merge_queue` by `claude[bot]` at `14:29:23Z`, `merge_group` CI restarted 23s later, merged unattended at `14:48:59Z` with `merged_by: claude[bot]`, no human action.)

What does not work:

- GraphQL `enablePullRequestAutoMerge` via `curl` — proxy-blocked in agent sessions ("only the pinned set of PR-review operations is served")
- REST `PUT /repos/hashintel/hash/pulls/<NUMBER>/merge` — rejected for queue-protected branches, and it would bypass the queue rather than enter it

### Diagnosing an ejection

An ejection can be another PR's fault, or nobody's:

- The `gh-readonly-queue/...` ref names every PR in the batch. If only yours is named, it was not batched with another.
- Before treating an ejection as a defect in your diff, compare the failing step against the same step on the identical head in the PR-level run. A step that took 17 seconds there and timed out in the queue is infrastructure, not code. Do not push a "fix" for a flake.

### The queue lints differently from the PR

The PR runs `cargo clippy --all-features`; the merge queue runs `cargo hack --optional-deps --feature-powerset clippy`, dispatched on `GITHUB_EVENT_NAME` in the `.justfile`. `turbo.json` also puts `GITHUB_EVENT_NAME` in the `lint:clippy` task's `env`, so the queue cannot replay the PR's cache. The queue can therefore legitimately surface feature-conditional problems the PR lint never ran — including the package-level `warning: unused dependency` gate that `lint.yml` greps for and fails on.

### Before reporting a failure

Do not tell a human you were unable to do something without verifying that claim first, and re-check current state before asking them to do something you already attempted.

## PR Review Process

### Step 1: Gather Information

Run these commands to get full context:

```bash
# View PR metadata, description, and comments
gh pr view <PR_NUMBER> --comments

# View ALL changes (do not truncate)
gh pr diff <PR_NUMBER>

# View inline diff comments
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/hashintel/hash/pulls/<PR_NUMBER>/comments
```

**Important:** Always view the FULL diff. Do not pipe into `head` or use `--name-only`.

### Step 2: Check Linear Issues

Look for `H-XXXX` references in the PR title/description, then fetch the issue:

```bash
# If Linear MCP is configured:
mcp__linear__get_issue --issueId "H-XXXX"

# Or use Linear web UI
```

Use the Linear issue requirements as baseline for the review.

### Step 3: Provide Feedback

- Be precise about issue locations (file:line)
- Include suggestions for improvement
- Reference relevant code standards
- Distinguish blocking issues from suggestions

## Quick Reference

| Action        | Format                                                 |
| ------------- | ------------------------------------------------------ |
| Branch name   | `<shortname>/h-XXXX-description`                       |
| PR title      | `H-XXXX: Description`                                  |
| View PR       | `gh pr view <NUMBER> --comments`                       |
| View diff     | `gh pr diff <NUMBER>`                                  |
| View comments | `gh api /repos/hashintel/hash/pulls/<NUMBER>/comments` |
