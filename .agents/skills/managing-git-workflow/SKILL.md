---
name: managing-git-workflow
description: Git and Graphite workflow for HASH including branch naming, PR creation, and PR reviews. Use when creating branches, making commits, opening pull requests, or reviewing PRs.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - git
      - graphite
      - branch
      - pull request
      - PR
      - commit
      - merge
      - review
    intent-patterns:
      - "\\b(create|open|submit|review)\\b.*?\\b(PR|pull request|branch)\\b"
      - "\\b(name|naming)\\b.*?\\bbranch\\b"
      - "\\b(FE|SRE|BE|H)-\\d+\\b"
---

# Managing Git Workflow

Standardize git workflow for HASH development, ensuring traceability between code changes and Linear issues. Use Graphite (`gt`) for stack operations; do not use `gh stack`.

## Branch Naming

**Format:** `<shortname>/<team-key>-xxxx-description`

- `shortname`: Developer identifier (first initial, nickname, etc.)
- `<team-key>-xxxx`: Linear issue identifier in lowercase (`fe-1437`, `sre-960`, `be-12`, `h-6786`)
- `description`: Brief kebab-case description

Live ticket prefixes are mostly `FE-`, `SRE-`, and `BE-`, with some `H-`.

**Examples:**

- `ln/fe-1437-hash-monorepo-import`
- `ln/h-6786-agent-guidance-layout`
- `t/sre-960-copy-git-workflow`

## Pull Request Creation

### PR Title Format

**Format:** `{ISSUE-ID}: Description`

- Use the Linear identifier as it appears on the issue (`FE-1437`, `H-6786`)
- Keep the description clear and concise

**Examples:**

- `H-6786: Stop copying HASH agent guidance into unused tool folders`
- `FE-1437: Move brunch-agent into hashintel/hash with its history`

### PR Template

Use the template at `.github/pull_request_template.md`.

## Merge Queue

`hashintel/hash` merges through a GitHub **merge queue**. This changes both how a PR is enqueued and how that can be verified.

### `auto_merge` is not evidence

Enqueuing a PR ("Merge when ready") does **not** populate the PR's `auto_merge` field — it stays `null` even on a completely successful enqueue. Never verify an enqueue by reading `auto_merge`: it reads `null` in the success case and the failure case alike, so it carries no information.

### Verifying an enqueue

Use either:

- a recent `added_to_merge_queue` event in `GET /repos/hashintel/hash/issues/<NUMBER>/timeline`
- fresh `merge_group` workflow runs on a `gh-readonly-queue/<base>/pr-<NUMBER>-<sha>` ref

### Re-queuing after an ejection

Re-queuing works from agent sessions via the GitHub MCP `enable_pr_auto_merge` tool. Its response is success-shaped with an empty `method` and `enabled at` — that empty shape is the expected signature of the repo routing to the queue instead of creating an `autoMergeRequest`, not a failure.

What does not work:

- GraphQL `enablePullRequestAutoMerge` via `curl` — proxy-blocked in agent sessions
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

```bash
gh pr view <PR_NUMBER> --comments
gh pr diff <PR_NUMBER>
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/hashintel/hash/pulls/<PR_NUMBER>/comments
```

Always view the FULL diff. Do not pipe into `head` or use `--name-only`.

### Step 2: Check Linear Issues

Look for `FE-`, `SRE-`, `BE-`, or `H-` identifiers in the PR title/description, then fetch the issue.

Use the Linear issue requirements as baseline for the review.

### Step 3: Provide Feedback

- Be precise about issue locations (file:line)
- Include suggestions for improvement
- Reference relevant code standards
- Distinguish blocking issues from suggestions

## Quick Reference

| Action        | Format                                                 |
| ------------- | ------------------------------------------------------ |
| Branch name   | `<shortname>/<team-key>-xxxx-description`              |
| PR title      | `{ISSUE-ID}: Description`                              |
| View PR       | `gh pr view <NUMBER> --comments`                       |
| View diff     | `gh pr diff <NUMBER>`                                  |
| View comments | `gh api /repos/hashintel/hash/pulls/<NUMBER>/comments` |
