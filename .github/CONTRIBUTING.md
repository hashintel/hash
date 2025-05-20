[careers site]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[community guidelines]: https://hash.ai/legal/trust-safety/community?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[discussion]: https://github.com/hashintel/hash/discussions
[hash.dev]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[issue]: https://github.com/hashintel/hash/issues
[our commitment as a company]: https://hash.dev/blog/open-source?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[public roadmap]: https://hash.dev/roadmap?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[tell us about yourself]: https://hash.ai/contact?topic=careers&category=applying&utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[why we have a cla]: https://hash.ai/legal/developers/contributing?utm_medium=organic&utm_source=github_readme_hash-repo_community-file

# Contributing

Thanks for taking the time to contribute! 🎉 We've established a set of [community guidelines] to enable as many people as possible to contribute to and benefit from HASH. Please follow these when interacting with this repo.

If you'd like to make a significant change or re-architecture to this repository or any project within, please first open a [discussion] or create an [issue] to get feedback before spending too much time.

We also have a developer website at [hash.dev], containing developer tutorials, guides and other resources.

## About this repository

### Overview

This repository is HASH's public monorepo. It contains [many different](README.md) projects, the vast majority of which are open-source, in line with [our commitment as a company]. While each project has its own [license](LICENSE.md), our contribution policies are consistent across this whole repository.

### Licenses

To ascertain the license and contributing policy for any given project, check out the `LICENSE.md` and `CONTRIBUTING.md` files in its root (or the license information in the file itself, which takes precedence where present).

### Tests

All externally-contributed pull requests which modify code should, at minimum, be covered by one or more unit tests (colocated alongside the code). Other kinds of tests, including integration tests (found in the [`/tests` directory](/tests)) may also be required.

Please see the [`/tests` README](/tests/README.md) for more information about testing in HASH.

### Monorepo structure

We use [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces) to work with multiple packages in a single repository. [Turborepo](https://turborepo.com) is used to cache script results and thus speed up their execution.

<details>
  <summary> &nbsp; Authoring new packages</summary>

#### Creating a new package

New local packages should follow these rules:

1. Anything which is imported or consumed by something else belongs in `libs/` and have a `package.json` `"name"`:
   - beginning with `@local/` for non-published JavaScript dependencies
   - identical to their `npm` name for published JavaScript dependencies
   - begin with `@rust/` for Rust dependencies
2. Things which are executed belong in `apps/`, and are named `@apps/app-name
3. Packages which aren't published to `npm` should have `"private": true` in their `package.json`
4. All TypeScript packages should be `"type": "module"`
5. ESLint and TypeScript configuration should all extend the base configs (see existing examples in other packages). Don't modify or override anything unless necessary.

Read the next section to understand how to configure compilation for packages.

#### TypeScript package resolution / compilation

The package resolution setup is designed to meet two goals:

1. Enable the local dependency graph for any application to be executed directly as TypeScript code during development, whilst
2. Enabling it to be run as transpiled JavaScript in production.

This is achieved by maintaining two parallel exports definitions for each package:

1. The `exports` field in `package.json` should point to the transpiled JavaScript (and `typesVersions` to the type definition files)
2. The `paths` map in the base TSConfig should map the same import paths to their TypeScript source

During development (e.g. running `yarn dev` for an application), the `paths` override will be in effect, meaning that the source TypeScript
is being run directly, and modifying any dependent file in the repo will trigger a reload of the application (assuming `tsx watch` or equivalent is used).

For production builds, where they are created, a `tsconfig.build.json` in the package is used which overwrites the `paths` field in the root config,
meaning that the imports will resolve to the transpiled JavaScript (usually in a git-ignored `dist/` folder).

Creating a production build should be done by running `turbo run build`, so that `turbo` takes care of building its dependencies first.
Running `yarn build` may not work as expected, as the built JavaScript for its dependencies may be (a) missing or (b) out of date.

If a bundler is used rather than `tsc`, the `paths` override needs to be translated into the appropriate configuration for the bundler.
For `webpack`, this is automated by adding the `TsconfigPathsPlugin` to the configuration's `resolve` field (search existing examples in repo).

New packages which are to be built as JavaScript, whether as an app or dependency, must follow these rules:

1. They must have a `tsconfig.json` which extends the base config and sets `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`
2. Imports within a package must use relative imports and not the package's name (they will not be resolved when built otherwise)
3. Relative imports within a package must have a `.js` file extension (`tsc` will enforce this)
4. They must have a `tsconfig.build.json` which overrides the `paths` field (`"paths": {}`)
5. They must have a `build` command which uses this file (typically `rimraf ./dist/ && tsc -p tsconfig.build.json`)
6. They must specify the paths exposed to consumers in `exports` and `typesVersions` in `package.json`, and `paths` in the base TSConfig
7. They must have a `turbo.json` which extends the root and specifies the `outputs` for caching (see existing examples)

</details>

<details>
  <summary> &nbsp; Authoring patches</summary>

#### Authoring Patches

Patches to JavaScript packages are managed by Yarn, using the [`yarn patch`](https://yarnpkg.com/cli/patch) command.

##### Creating a new patch

```sh
yarn patch <package>
# ➤ YN0000: Package <package>@npm:<version> got extracted with success!
# ➤ YN0000: You can now edit the following folder: /private/var/folders/lk/j93xz9pd7nqgd5_2wlyxmbh00000gp/T/xfs-df787c87/user
# ➤ YN0000: Once you are done run yarn patch-commit -s /private/var/folders/lk/j93xz9pd7nqgd5_2wlyxmbh00000gp/T/xfs-df787c87/user and Yarn will store a patchfile based on your changes.
# ➤ YN0000: Done in 0s 702ms
```

Once you have completed your changes, run the command that was output to commit the patch:

```sh
yarn patch-commit -s /private/var/folders/lk/j93xz9pd7nqgd5_2wlyxmbh00000gp/T/xfs-df787c87/user
```

This will automatically create a patch file and put it into the `.yarn/patches` directory. If you're modifying a direct dependency in any workspace it will replace the `package.json` entry with a `patch:` reference to the patch file. In case you're patching an indirect dependency a new resolutions entry will be added to the root workspace `package.json`.

You will need to run `yarn install` for the patch to be installed and applied to the lockfile.

##### Modifying an existing patch

The procedure to modify an existing patch is very similar, but instead of running `yarn patch <package>` you will need to run `yarn patch -u <package>`. This will apply existing patches and then extract the package for you to modify.

```sh
yarn patch -u <package>
# ➤ YN0000: Package <package>@npm:<version> got extracted with success along with its current modifications!
# ➤ YN0000: You can now edit the following folder: /private/var/folders/lk/j93xz9pd7nqgd5_2wlyxmbh00000gp/T/xfs-d772c076/user
# ➤ YN0000: Once you are done run yarn patch-commit -s /private/var/folders/lk/j93xz9pd7nqgd5_2wlyxmbh00000gp/T/xfs-d772c076/user and Yarn will store a patchfile based on your changes.
# ➤ YN0000: Done in 1s 455ms
```

Once you have completed your changes, run the command that was output to commit the patch:

```sh
yarn patch-commit -s /private/var/folders/lk/j93xz9pd7nqgd5_2wlyxmbh00000gp/T/xfs-d772c076/user
```

This will automatically update the patch file with your changes. Do not forget to run `yarn install` for the patch to be installed and applied to the lockfile.

##### Removing a patch

Locate any `patch:` protocol entries in any workspace `package.json` and remove them. The entry will look somewhat similar to: `patch:@changesets/assemble-release-plan@npm%3A5.2.4#~/.yarn/patches/@changesets-assemble-release-plan-npm-5.2.4-2920e4dc4c.patch`, to remove the patch simply extract out the package (everything after the `patch:` and before `#`) and url-decode it and extract the version from it, so for the example it would be `5.2.4`. You should **not** completely remove the line from the `package.json`.

In case the patch has been applied in the resolutions field you should also check if the resolution is made redundant. This is the case if the left side is the same as the right, e.g. `"react@npm:18.2.0": "18.2.0"` is redundant, same as `"react@npm:18.2.0": "npm:18.2.0"`, or `"react@npm:18.2.0": "npm:react@18.2.0"`, but `"react": "npm:react@18.2.0"` is **not** redundant.

> A resolution specifier like `"react": "npm:react@18.2.0",` is also correct. Simply meaning that the react package should be resolved to the npm package `react@18.2.0`, in fact `"react": "18.2.0"` is simply a shorthand for `"react": "npm:react@18.2.0"`.
>
> If the left hand of a resolution has no version specifier it is assumed to be `npm:*`, e.g. `"react": "18.2.0"` is equivalent to `"react@npm:*": "18.2.0"` (replace react with version `18.2.0` regardless of the dependency requirement).
>
> For more examples see the [yarn documentation](https://yarnpkg.com/configuration/manifest#resolutions)

Then run `yarn install` to remove the patch.

You can then safely remove the patch file from `.yarn/patches`.

> Yarn currently does not provide a command to remove a patch, so you will need to do this manually.

</details>

### Common issues

<details>
  <summary> &nbsp; eslint `parserOptions.project`</summary>

### eslint `parserOptions.project`

There is a mismatch between VSCode's eslint plugin and the eslint cli tool. Specifically the option
`parserOptions.project` is not interpreted the same way as reported
[in this issue](https://github.com/typescript-eslint/typescript-eslint/issues/251). If VSCode complains about
a file not being "on the project" underlining an import statement, try to add the following to the
plugin's settings:

```json
"eslint.workingDirectories": [
  { "directory": "apps/hash-api", "!cwd": true }
]
```

</details>

<details>
  <summary> &nbsp; Services not launched because ports busy</summary>

### Services are not launched because ports are reported as busy

Make sure that ports 3000, 3333, 3838, 5001, 5432, 6379 and 9200 are not used by any other processes.
You can test this by running:

```sh
lsof -n -i:PORT_NUMBER
```

> **TODO:** replace `lsof` with `npx ??? A,B,...N` for a better DX.
> Suggestions welcome!

</details>

<details>
  <summary> &nbsp; User registration fails (WSL users)</summary>

### User Registration failing (WSL users)

If you're running the application on Windows through Windows Subsystem for Linux (WSL) you might need to
change the registration url in `apps/hash-external-services/docker-compose.yml` from
`http://host.docker.internal:5001/kratos-after-registration` to `http://{WSL_IP}:5001/kratos-after-registration`,
where `WSL_IP` is the IP address you get by running:

```sh
wsl hostname -I
```

The `kratos` and `kratos-migrate` services will need to be restarted/rebuilt for the change to take effect.

</details>

## Information for external contributors

### Common contribution processes

These apply across all projects:

- **Before undertaking any significant work, please share your proposal with us:** we don't want you to invest your time on changes we are already working on ourselves, or have different plans for. You can suggest changes as a [discussion] if it's a feature proposal, or an [issue] if it's a bug you intend to fix. If you're only fixing a typo or making a minor change to documentation, don't worry about this step (just go ahead and open a Pull Request on this repository).
- **When submitting a pull request, please fill out any sections of the provided template you feel able to.** If you are unsure or don't feel a section is relevant, please say so.
  - Always include a link to the issue or discussion proposing the change.
  - Write tests to accompany your PR, or ask for help/guidance if this is a blocker.
  - Make sure that your PR doesn’t break existing tests.
  - The repository follows a set of linting rules. Many of them can be applied automatically by running `yarn install` and `yarn fix`.
  - Sign our _Contributor License Agreement_ at the CLA Assistant's prompting. (To learn more, read [why we have a CLA])
- **Once you have receive a pull request review, please bear the following in mind:**
  - reviewers may make suggestions for _optional_ changes which are not required to get your code merged. It should be obvious which suggestions are optional, and which are required changes. If it is not obvious, ask for clarification.
  - please do not resolve comment threads unless you opened them - leave it to the person who raised a comment to decide if any further discussion is required (GitHub will also automatically resolve any code suggestions you click 'commit' on). Comment threads may also be left open so that they can be linked to later.
- **We perform automated linting and formatting checks on pull requests using GitHub Actions.** As part of our Continuous Integration (CI) setup, when a pull request is created or updated, GitHub Actions will run a series of checks. This includes running `ESLint`, `TSC`, `Biome`, `Markdownlint`, `rustfmt`, and a few other tools. Some checks may be skipped depending on the files that have been changed in the pull request. First-time contributors need to wait for a HASH maintainer to manually launch CI checks.

### How can I find interesting PRs to work on?

Existing issues can provide a good source of inspiration for potential contributions. The issue tags `E-help-wanted` and `E-good-first-issue` flag some of the lower-hanging fruit that are available for people (including first-time contributors) to work on, without necessarily requiring prior discussion. If you're willing to contribute, we'd love to have you!

### Why might contributions be rejected?

There are a number of reasons why otherwise sound contributions might not find their way into the `main` branch of our repo. Ultimately, we reserve the right to reject PRs for any reason. In a bid to minimize wasted time and effort, here are some possible reasons for rejection:

- **PRs that introduce new functionality without proper tests will not be accepted.** You should write meaningful tests for your code.
- **PRs that fail to pass tests will not be merged.** If your PR doesn’t pass our Continuous Integration tests, it won’t be merged.
- **PRs that duplicate functionality which already exist in HASH, but outside of the project you're introducing them in.** For example, recreating functionality provided in one package directly within another.
- **PRs that duplicate workstreams already under development at HASH** may be rejected, or alternatively integrated into working branches other than those intended by the contributor. For more on these, see our [public roadmap].
- **PRs that add functionality that is only useful to a subset of users**, which may increase maintenance overheads on the product. We know it can be frustrating when these sorts of PRs are rejected, and it can sometimes seem arbitrary. We’ll do our best to communicate our rationale clearly in such instances and are happy to talk it out. It's impossible to forecast all of the possible use-cases of a product or feature, and we try to keep an open posture towards such contributions.
- **PRs that introduce architectural changes to the project** (without prior discussion and agreement) will be rejected.
- **PRs that don’t match the syntax, style and formatting of the project will be rejected.** See: _maintainability_.

### Can I work for HASH full-time?

We're continuously headhunting for full-time roles. However, as outlined on our [careers site], **you can't apply to work at HASH.**. Instead, we use the technology we've developed at HASH to scour the web for people we think would be a good fit to join us, and we reach out _to them_, rather than accept inbound applications. Nevertheless, a great (and guaranteed) way to get on our radar is to contribute to any of our open-source repositories, in particular [this one](https://github.com/hashintel/hash). If and when a good fit opens up, we may invite you to interview. If your contact email address or other information aren't accessible via your profile, we invite you to [tell us about yourself] nevertheless.
