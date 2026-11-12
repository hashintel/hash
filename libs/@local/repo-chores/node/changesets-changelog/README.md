# Changesets changelog formatter

Formats the entries Changesets writes into each package's `CHANGELOG.md`:

```text
- add arrow-right-arrow-left icon ([#8750](https://github.com/hashintel/hash/pull/8750))
```

Entries link to the pull request the changeset arrived in, without adding a
username. When no pull request is found, the entry contains just its description.
The `pr` and `commit` overrides are supported; legacy `author` and `user` overrides
are stripped from the summary and ignored.

`.changeset/config.json` names this directory through the
`@local/repo-chores/changesets-changelog` export, and
`@changesets/apply-release-plan` `require`s it during `changeset version`. That
happens with no build step in front of it, so the sources here must stay plain
CommonJS even though the rest of the package is ESM TypeScript run through
`tsx`.

Resolving a commit to its pull request needs `GITHUB_TOKEN` in the environment;
without one, `changeset version` fails rather than dropping the link. An explicit
`pr` override needs no GitHub request or token.
