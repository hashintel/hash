[careers site]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[community guidelines]: https://hash.ai/legal/trust-safety/community?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
[discussion]: https://github.com/hashintel/hash/discussions
[hash.design]: https://hash.design/?utm_medium=organic&utm_source=github_readme_hash-repo_community-file
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

_In the future, we also intend to launch a design website at [hash.design], containing our Storybook, brand and style guildelines. This remains incomplete and currently provides only limited value._

## About this repo

This repository is HASH's public monorepo. It contains [many different](README.md) projects, the vast majority of which are open-source, in line with [our commitment as a company]. While each project has its own [license](LICENSE.md), our contribution policies are consistent across this whole repository.

To ascertain the license and contributing policy for any given project, check out the `LICENSE.md` and `CONTRIBUTING.md` files in its root.

## Common contribution processes

These apply across all projects:

- Before undertaking any significant work, please share your proposal with us: we don't want you to invest your time on changes we are already working on ourselves, or have different plans for. You can suggest changes as a [discussion] if it's a feature proposal, or an [issue] if it's a bug you intend to fix. If you're only fixing a typo or making a minor change to documentation, don't worry about this step (just go ahead and open a Pull Request on this repository).
- When submitting a pull request, please fill out any sections of the provided template you feel able to. If you are unsure or don't feel a section is relevant, please say so.
  - Always include a link to the issue or discussion proposing the change.
  - Write tests to accompany your PR, or ask for help/guidance if this is a blocker.
  - Make sure that your PR doesn’t break existing tests.
  - The repository follows a set of linting rules. Many of them can be applied automatically by running `yarn install` and `yarn fix`.
  - Sign our _Contributor License Agreement_ at the CLA Assistant's prompting. (To learn more, read [why we have a CLA])
- Once you have receive a pull request review, please bear the following in mind:
  - reviewers may make suggestions for _optional_ changes which are not required to get your code merged. It should be obvious which suggestions are optional, and which are required changes. If it is not obvious, ask for clarification.
  - please do not resolve comment threads unless you opened them - leave it to the person who raised a comment to decide if any further discussion is required (GitHub will also automatically resolve any code suggestions you click 'commit' on). Comment threads may also be left open so that they can be linked to later.

## How can I find interesting PRs to work on?

Existing issues can provide a good source of inspiration for potential contributions. The issue tags `E-help-wanted` and `E-good-first-issue` flag some of the lower-hanging fruit that are available for people (including first-time contributors) to work on, without necessarily requiring prior discussion. If you're willing to contribute, we'd love to have you!

## Why might contributions be rejected?

There are a number of reasons why otherwise sound contributions might not find their way into the `main` branch of our repo. Ultimately, we reserve the right to reject PRs for any reason. In a bid to minimize wasted time and effort, here are some possible reasons for rejection:

- **PRs that introduce new functionality without proper tests will not be accepted.** You should write meaningful tests for your code.
- **PRs that fail to pass tests will not be merged.** If your PR doesn’t pass our Continuous Integration tests, it won’t be merged.
- **PRs that duplicate functionality which already exist in HASH, but outside of the project you're introducing them in.** For example, recreating functionality provided in one package directly within another.
- **PRs that duplicate workstreams already under development at HASH** may be rejected, or alternatively integrated into working branches other than those intended by the contributor. For more on these, see our [public roadmap].
- **PRs that add functionality that is only useful to a subset of users**, which may increase maintenance overheads on the product. We know it can be frustrating when these sorts of PRs are rejected, and it can sometimes seem arbitrary. We’ll do our best to communicate our rationale clearly in such instances and are happy to talk it out. It's impossible to forecast all of the possible use-cases of a product or feature, and we try to keep an open posture towards such contributions.
- **PRs that introduce architectural changes to the project** (without prior discussion and agreement) will be rejected.
- **PRs that don’t match the syntax, style and formatting of the project will be rejected.** See: _maintainability_.

## Can I work for HASH full-time?

We're continuously headhunting for full-time roles. However, as outlined on our [careers site], **you can't apply to work at HASH.**. Instead, we use the technology we've developed at HASH to scour the web for people we think would be a good fit to join us, and we reach out _to them_, rather than accept inbound applications. Nevertheless, a great (and guaranteed) way to get on our radar is to contribute to any of our open-source repositories, in particular [this one](https://github.com/hashintel/hash). If and when a good fit opens up, we may invite you to interview. If your contact email address or other information aren't accessible via your profile, we invite you to [tell us about yourself] nevertheless.
