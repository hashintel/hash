---
name: petrinaut-shipping
description: "End-to-end procedure for shipping a change to the Petrinaut packages (libs/@hashintel/petrinaut, petrinaut-core, petrinaut-cli, apps/petrinaut-opt, apps/petrinaut-website): the verification gates per package, the changeset step, docs sync, pre-PR hygiene checks, and CI expectations from draft to ready. Use when implementing any change in these packages, when creating a PR for Petrinaut work, when running tests or lints for them, or when checking CI on a Petrinaut PR."
license: Apache-2.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - petrinaut
    intent-patterns:
      - "\\b(implement|create|fix|add|ship|change)\\b.*?\\bpetrinaut\\b"
      - "\\bpetrinaut\\b.*?\\b(PR|tests?|lint|CI|checks?)\\b"
---

# Shipping a Petrinaut change

Standing conventions (changeset policy, docs and diagram placement, CI quirks, the petrinaut-opt boundary) live in `libs/@hashintel/petrinaut/AGENTS.md` and `apps/petrinaut-opt/AGENTS.md`. This skill is the procedure that applies them.

## Gates

Run for every touched package, after every increment:

```sh
yarn fix:format >/dev/null 2>&1
npx turbo run test:unit lint:tsc lint:eslint --filter @hashintel/petrinaut --filter @hashintel/petrinaut-core --filter @hashintel/petrinaut-cli --force --output-logs errors-only
yarn lint:format
```

- Trim the `--filter`s to the touched packages; add `--filter @apps/petrinaut-website` when it consumes the change.
- Structure changed (new folder, moved module): also `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`, and add the layer declaration the AGENTS.md architecture section calls for.
- Arch-docs authored content or `content/diagrams/*.d2` changed: `lint:arch-docs` does not compile MDX or render D2. Run the site build once before pushing: `mise x -- yarn exec turbo run build --filter @apps/petrinaut-docs`. D2 labels containing `:` or `[` must be quoted.
- Python (`apps/petrinaut-opt`, `libs/@local/petrinaut-python`): `uv run pytest` in the package.
- Formatting is oxfmt via the yarn scripts; never run prettier directly. `yarn lint:format` prints its verdict before its final line, so check the exit code rather than the last line of output.

## Changesets

One `patch` changeset per PR covering the published packages the PR touches (`@hashintel/petrinaut`, `@hashintel/petrinaut-core`); none for pure refactors. Keep the text to one or two plain sentences. See the AGENTS.md conventions for the full policy.

## Docs sync

User-visible behaviour changes update the user guide in the same PR; new pages need registration and a raw import, both test-enforced. The steps are in the "User-facing docs" section of `libs/@hashintel/petrinaut/AGENTS.md`. Doc screenshots cannot be uploaded by an agent: produce candidate captures, list the exact pages and sections to re-capture, and flag "screenshots pending" in the PR body and the summary.

## Pre-PR hygiene

- Read `git diff --stat` against the base: no accidental directories, no unstaged leftovers, no generated output, no `mise.lock` churn.
- A `Bin` line in the stat for a text file means escape sequences became literal control bytes; fix it before pushing or the diff is unreviewable.
- A diff too large for one review gets split into stacked PRs, one concern per layer.

## Draft, CI, ready

- Open the PR as a draft, body per the repo PR template.
- Watch checks until none are pending: `until [ "$(gh pr checks NNNN 2>/dev/null | grep -c pending)" = "0" ]; do sleep 60; done; gh pr checks NNNN`.
- Judge failures against the CI bullet in the AGENTS.md conventions (Bench-CI non-blocking, the known flaky check, Vercel-side docs failures) before treating them as caused by the diff.
- Flip to ready only when checks are green. AI reviewers run at that point; triage their threads rather than leaving them unresolved.
- End any turn that changed the branch by stating what was committed and pushed, or that nothing was.
