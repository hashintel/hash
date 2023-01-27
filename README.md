[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash.ai]: https://hash.ai?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash.dev]: https://hash.dev?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash]: https://hash.ai/platform/hash?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash engine]: https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash roadmap]: https://hash.ai/roadmap?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash user guide]: https://hash.ai/docs?utm_medium=organic&utm_source=github_readme_hash-repo_root
[glossary of terms]: https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_hash-repo_root
[block protocol]: https://github.com/blockprotocol/blockprotocol
[hiring]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_root

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

_Coming soon_

## [![a](/.github/assets/gh_icon_roadmap_20px-base.svg)][gh-roadmap] &nbsp; Roadmap

Browse the [HASH roadmap] for more information about upcoming features and releases.

## [![a](/.github/assets/gh_icon_repo-structure_20px-base.svg)][gh-repo-structure] &nbsp; About this repository

### Top-level layout

This repository's contents is divided across four primary sections:

- [`/apps` - applications](#applications): the primary code behind our runnable applications
- [`/blocks` - blocks](#blocks): our public [Block Protocol] blocks
- [`/infra`- infrastructure](#infrastructure): deployment scripts and other tools used to run our apps
- [`/libs` - libraries](#libraries): includes npm packages and Rust crates

### Applications

#### HASH

- [`/apps/hash`](apps/hash): entrypoint for [HASH] - a data-driven, entity-centric, all-in-one workspace based on the Block Protocol

#### HASH Simulations

- [`/apps/engine`](apps/engine): codebase for our next-gen version of [HASH Engine] - a versatile agent-based simulation engine written in Rust

#### Our websites

- [`/apps/hashdotai`](apps/hashdotai): contains the [HASH user guide] and [glossary of terms] content
- [`/apps/hashdotdev`](apps/hashdotdev): contains the [hash.dev] developer-education website content and code

### Blocks

- [`/blocks`](blocks): source code for all of HASH's open-source [Block Protocol] blocks

### Infrastructure

- [`/infra/terraform`](infra/terraform): contains Terraform modules for deploying HASH on AWS

### Libraries

- [`/packages/libs`](packages/libs): source code for our open-source developer libraries

## [![a](/.github/assets/gh_icon_contributing_20px-base.svg)][gh-contributing] &nbsp; Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) if you're interested in getting involved in the design or development of HASH.

We're also [hiring] for a number of key roles. If you contribute to HASH's public monorepo be sure to mention this in your application.

## [![a](/.github/assets/gh_icon_license_20px-base.svg)][gh-license] &nbsp; License

The vast majority of this repository is published as free, open-source software. Please see [LICENSE](LICENSE.md) for more information about the specific licenses under which the different parts are available.

## [![a](/.github/assets/gh_icon_security_20px-base.svg)][gh-security] &nbsp; Security

Please see [SECURITY](SECURITY.md) for instructions around reporting issues, and details of which package versions we actively support.

## [![a](/.github/assets/gh_icon_contact_20px-base.svg)][gh-contact] &nbsp; Contact

Find us on Twitter at [@hashintel](https://twitter.com/hashintel), or email [support@hash.ai](mailto:support@hash.ai)

You can also join our [Discord] community for quick help and support.

Project permalink: `https://github.com/hashintel/hash`
