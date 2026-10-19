---
name: managing-git-workflow
description: Git and pull-request workflow for HASH, including conditional Linear conventions and merge-queue diagnostics. Use when naming a branch, opening or reviewing a pull request, interpreting its checks, or diagnosing a merge-queue ejection.
license: AGPL-3.0
---

# Managing Git Workflow

Use ordinary Git and GitHub as the public baseline. No particular Git client or access to HASH's Linear workspace is required to contribute.

## Contributing

Treat [`.github/CONTRIBUTING.md`](../../../.github/CONTRIBUTING.md) as the source of truth for contribution policy and the organization-wide default template, [`docs/pull_request_template.md` in `hashintel/.github`](https://github.com/hashintel/.github/blob/main/docs/pull_request_template.md), as the source of truth for PR content. This repository has no PR template of its own, so GitHub applies that default.

### Working From a HASH Linear Issue

When the work has an associated HASH Linear issue, preserve traceability in the branch and pull request:

- Name the branch `<shortname>/<team-key>-xxxx-description`, with the Linear identifier in lowercase; for example, `ln/fe-1437-hash-monorepo-import` or `ln/h-6786-agent-guidance-layout`.
- Title the PR `{ISSUE-ID}: Description`, preserving the identifier's uppercase form; for example, `H-6786: Stop copying HASH agent guidance into unused tool folders`.
- Do not link the Linear issue again in the PR description. When the PR covers more than one issue, list every identifier in the title, comma-separated, as the PR template asks.

Current HASH Linear identifiers commonly use `FE-`, `SRE-`, `BE-`, or `H-` prefixes.

### Contributing Without a HASH Linear Issue

Contributors without access to HASH's Linear workspace do not need a Linear identifier. Use a descriptive branch name and PR title, and link the relevant public issue or discussion for significant work. Minor documentation fixes may go straight to a PR as described in the contributing guide.

In every case, keep the PR description self-contained so contributors and reviewers without access to internal systems can understand the change. Fill every applicable section of the organization-wide PR template, and delete each section that does not apply, as the template's comments ask.

## Reviewing Pull Requests

Gather the public review record and the complete diff:

```bash
gh pr view <PR_NUMBER> --comments
gh pr diff <PR_NUMBER>
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/hashintel/hash/pulls/<PR_NUMBER>/comments
```

Use the PR description and linked public issue or discussion as the public review contract. If the PR references a HASH Linear issue and the reviewer has access, fetch it and use its requirements as an additional review baseline. Treat inaccessible internal links as supplemental provenance, not as requirements the public artifact may omit.

- Review the full diff without truncating it.
- Identify blocking findings separately from optional suggestions.
- Give precise file and line locations.
- Leave resolution of a review thread to the reviewer who opened it, as specified in the contributing guide.

## Merge Queue

HASH merges through GitHub's merge queue. This section applies to maintainers and to diagnosing queue checks; contributors do not need merge-queue access.

### Verify an Enqueue

The PR's `auto_merge` field remains `null` after a successful enqueue, so it is not evidence either way. Verify with either:

- a recent `added_to_merge_queue` event in `GET /repos/hashintel/hash/issues/<NUMBER>/timeline`
- fresh `merge_group` workflow runs on a `gh-readonly-queue/<base>/pr-<NUMBER>-<sha>` ref

### Diagnose an Ejection

An ejection can be another PR's fault or an infrastructure failure:

- The `gh-readonly-queue/...` ref names every PR in the batch. If only one PR is named, it was not batched with another.
- Compare the failing step against the same step on the identical head in the PR-level run before attributing it to the diff.
- Check whether a changed file is listed in `turbo.json` under `globalDependencies`; a global invalidation can run unrelated package checks and expose unrelated failures.

The PR runs `cargo clippy --all-features`; the merge queue runs `cargo hack --optional-deps --feature-powerset clippy`, selected through `GITHUB_EVENT_NAME` in `.justfile`. Queue lint can therefore surface feature-conditional problems that PR lint did not run, including the unused-dependency gate in `.github/workflows/lint.yml`.
