[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash.ai]: https://hash.ai?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash.dev]: https://hash.dev?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash]: https://hash.ai/platform/hash?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash engine]: https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash roadmap]: https://hash.ai/roadmap?utm_medium=organic&utm_source=github_readme_hash-repo_root
[block protocol]: https://github.com/blockprotocol/blockprotocol
[block protocol types]: https://blockprotocol.org/docs/types?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hiring]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_root
[awesome hash]: https://github.com/hashintel/awesome-hash

<!-- markdownlint-disable link-fragments -->

[github_banner]: #hash
[github_star]: https://github.com/hashintel/hash#
[gh-what-is-hash]: #--what-is-hash
[gh-getting-started]: #--getting-started
[gh-examples]: #--examples
[gh-roadmap]: #--roadmap
[gh-repo-structure]: #--about-this-repository
[gh-contributing]: #--contributing
[gh-license]: #--license
[gh-security]: #--security
[gh-contact]: #--contact

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/ec83e48d-5a46-4c3f-a603-5d9fc43ff400/github)][github_banner]

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# HASH

This is HASH's _public monorepo_ which contains our public code, docs, and other key resources.

## [![a](/.github/assets/gh_icon_what-is-hash_20px-base.svg)][gh-what-is-hash] &nbsp; What is HASH?

**HASH is a platform for decision-making, which helps you integrate, understand and use data in a variety of different ways.**

HASH does this by combining various different powerful tools together into one simple interface. These range from data pipelines and a graph database, through to an all-in-one workspace, no-code tool builder, and agent-based simulation engine. These exist at varying stages of maturity, and while some are polished, not all are ready for real-world production use. You can read more about out big-picture vision at [hash.dev]

## [![a](/.github/assets/gh_icon_getting-started_20px-base.svg)][gh-getting-started] &nbsp; Getting started

- 🚀 &nbsp; **Quick-start (<5 mins):** try the full hosted platform at [hash.ai], ready to go in seconds
- 🤖 &nbsp; **Self-hosting:** check out our developer site at [hash.dev] for a guide to running your own instance of HASH

## [![a](/.github/assets/gh_icon_examples_20px-base.svg)][gh-examples] &nbsp; Examples

**Coming soon:** we'll be collecting examples in the _[Awesome HASH]_ repository.

## [![a](/.github/assets/gh_icon_roadmap_20px-base.svg)][gh-roadmap] &nbsp; Roadmap

Browse the [HASH roadmap] for more information about upcoming features and releases.

## [![a](/.github/assets/gh_icon_repo-structure_20px-base.svg)][gh-repo-structure] &nbsp; About this repository

### Top-level layout

This repository's contents is divided across four primary sections:

- [**`/apps`**](/apps) contains the primary code powering our runnable [applications](#applications)
- [**`/blocks`**](/blocks) contains our public _Block Protocol_ [blocks](#blocks)
- [**`/infra`**](/infra) houses deployment scripts, utilities and other [infrastructure](#infrastructure) useful in running our apps
- [**`/libs`**](/libs) contains [libraries](#libraries) including npm packages and Rust crates

Key projects within are summarized below.

### Applications

- [`hash`](apps/hash): entry-point for **[HASH]**, a data-driven, entity-centric, all-in-one workspace based on the [Block Protocol]
- [`engine`](apps/engine): experimental version of **[HASH Engine]**, a versatile agent-based simulation engine written in Rust

### Blocks

- Various directories containing the source code for all of HASH's open-source [Block Protocol] (**Þ**) blocks, summarized in a [handy table](https://github.com/hashintel/hash/tree/main/blocks#blocks). Please note: this table/directory contains HASH-published blocks only, and does not contain the full extent of available Þ blocks.

### Infrastructure

- [`terraform`](infra/terraform): Terraform modules for deploying HASH on AWS

### Libraries

#### Rust crates

- [`antsi`](libs/antsi): Rust crate supporting Select Graphic Rendition (as defined in ISO 6429) without external dependencies
- [`deer`](libs/deer): fail-slow deserialization framework for Rust, featuring meaningful error messages and context
- [`error-stack`](libs/error-stack): context-aware error-handling library for Rust which supports attaching arbitrary user data
- [`sarif`](libs/sarif): representation of the SARIF specification in Rust

#### npm packages

- [`@hashintel/design-system`](libs/@hashintel/design-system): design system for [HASH] and new [hash.ai] website
- [`@hashintel/type-editor`](libs/@hashintel/type-editor): editing interface for [Block Protocol types]

## [![a](/.github/assets/gh_icon_contributing_20px-base.svg)][gh-contributing] &nbsp; Contributing

Please see [CONTRIBUTING](.github/CONTRIBUTING.md) if you're interested in getting involved in the design or development of HASH.

We're also [hiring] for a number of key roles. If you contribute to HASH's public monorepo be sure to mention this in your application.

## [![a](/.github/assets/gh_icon_license_20px-base.svg)][gh-license] &nbsp; License

The vast majority of this repository is published as free, open-source software. Please see [LICENSE](LICENSE.md) for more information about the specific licenses under which the different parts are available.

## [![a](/.github/assets/gh_icon_security_20px-base.svg)][gh-security] &nbsp; Security

Please see [SECURITY](.github/SECURITY.md) for instructions around reporting issues, and details of which package versions we actively support.

## [![a](/.github/assets/gh_icon_contact_20px-base.svg)][gh-contact] &nbsp; Contact

Find us on Twitter at [@hashintel](https://twitter.com/hashintel), or email [support@hash.ai](mailto:support@hash.ai)

You can also join our [Discord] community for quick help and support.

Project permalink: `https://github.com/hashintel/hash`
