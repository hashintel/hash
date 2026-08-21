# @local/changesets-changelog

Formats the entries Changesets writes into each package's `CHANGELOG.md`:

```text
- add arrow-right-arrow-left icon ([@CiaranMn](https://github.com/CiaranMn), [#8750](https://github.com/hashintel/hash/pull/8750))
```

Entries are attributed to the first assignee of the pull request the changeset
arrived in, falling back to its author, then to the commit author.

`.changeset/config.json` names this package in its `changelog` field, and
`@changesets/apply-release-plan` `require`s it during `changeset version`. That
happens with no build step in front of it, so the sources here must stay plain
CommonJS.

Attribution needs `GITHUB_TOKEN` in the environment; without one
`changeset version` fails rather than dropping the attribution.
