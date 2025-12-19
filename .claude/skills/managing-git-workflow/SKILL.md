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
