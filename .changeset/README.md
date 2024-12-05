# Changesets

This folder is used by `@changesets/cli`, a build tool that helps us version and publish code.
You can find the full documentation for it [in the @changesets/changesets repo](https://github.com/changesets/changesets?tab=readme-ov-file#documentation)

## What are changesets?

Changesets contain information about changes in a branch or commit. They contain:

- details about what needs to be released;
- information about what version they are to be released at (according to [semver](https://semver.org/));
- a changelog entry for the released packages.

This information is used to improve the documentation provided to package-consumers at the point of release, as well as ensure packages are versioned correctly.

Read a more complete [detailed explanation of changesets](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md) in the `changesets` docs.

## How do I add a changeset?

See the "Adding a changeset" [multi-package repository instructions](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md#i-am-in-a-multi-package-repository-a-mono-repo) in the `changesets` docs.

## What is the `config.json` file in this directory?

Read about [config file options](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md) in the `changesets` docs.
