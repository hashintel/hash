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

The "Publishing" section of [`libs/README.md`](../../../libs/README.md#publishing) is the source of truth for releasing packages from this repository, including when a PR needs a changeset and how to write the changelog text. Read it before adding or editing a changeset.

`yarn changeset` prompts interactively. Instead of running it, create the changeset file under `.changeset/` directly: a kebab-case file name, the semver increment for each package in the frontmatter, and the changelog text as the body.

```md
---
"@hashintel/petrinaut": patch
---

One paragraph describing the change as the package's consumers experience it.
```
