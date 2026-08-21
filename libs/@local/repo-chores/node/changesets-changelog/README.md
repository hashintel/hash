# Changesets changelog formatter

Formats the entries Changesets writes into each package's `CHANGELOG.md`:

```text
- add arrow-right-arrow-left icon ([@CiaranMn](https://github.com/CiaranMn), [#8750](https://github.com/hashintel/hash/pull/8750))
```

Entries are attributed to the first assignee of the pull request the changeset
arrived in, falling back to its author, then to the commit author.

`.changeset/config.json` names this directory through the
`@local/repo-chores/changesets-changelog` export, and
`@changesets/apply-release-plan` `require`s it during `changeset version`. That
happens with no build step in front of it, so the sources here must stay plain
CommonJS even though the rest of the package is ESM TypeScript run through
`tsx`.

Attribution needs `GITHUB_TOKEN` in the environment; without one
`changeset version` fails rather than dropping the attribution.
