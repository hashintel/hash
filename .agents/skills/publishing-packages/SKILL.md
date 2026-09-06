---
name: publishing-packages
description: Conventions for publishing npm packages from this repository, including when a PR needs a changeset and how to write one. Use when adding or editing a changeset, versioning or releasing a package, or deciding whether a change to a publishable library needs a changelog entry.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - changeset
      - changelog
      - npm publish
      - release
      - version bump
    intent-patterns:
      - "\\b(add|write|create|edit|split)\\b.*?\\bchangesets?\\b"
      - "\\b(publish|release|version)\\b.*?\\bpackages?\\b"
---

# Publishing Packages

npm-publishable packages in this repository are versioned and released with [changesets](https://github.com/changesets/changesets). The changeset configuration, including which packages are ignored, lives in [`.changeset/config.json`](../../../.changeset/config.json).

## Changesets

A PR that changes an npm-publishable package adds a changeset file under `.changeset/`. The changeset text becomes the package's published changelog entry, so write it for the package's consumers:

- Describe the change as a consumer of the package experiences it: behaviour changes, bug fixes, and interface changes. Leave out implementation details that do not affect consumers, and do not mention this repository or its internal systems.
- Every sentence must apply to each package the changeset lists. When a PR changes several packages in different ways, write a separate changeset for each package.
- Use at most one paragraph per changeset.

A package's own `AGENTS.md` can carry further conventions, such as the bump level it accepts; check it before writing the changeset.
