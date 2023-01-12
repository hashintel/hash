[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_root
[github_star]: https://github.com/hashintel/hash#
[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash.dev]: https://hash.dev?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash]: https://hash.ai/platform/hash?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash engine]: https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hash user guide]: https://hash.ai/docs?utm_medium=organic&utm_source=github_readme_hash-repo_root
[glossary of terms]: https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_hash-repo_root
[block protocol]: https://github.com/blockprotocol/blockprotocol
[hiring]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_root

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/ec83e48d-5a46-4c3f-a603-5d9fc43ff400/github)][github_banner]

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# HASH

## Welcome

This is HASH's _public monorepo_ which contains our open-source, fair-source and commons-licensed code, docs, and other key resources. You can learn more about our big picture vision at [hash.dev]

## Repository structure

### Top-level

This repository's contents is divided across four primary sections:

- [`/apps` - applications](#applications): the primary code behind our runnable applications
- [`/blocks` - blocks](#blocks): our public [Block Protocol] blocks
- [`/infra`- infrastructure](#infrastructure): deployment scripts and other tools used to run our apps
- [`/libs` - libraries](#libraries): includes npm packages and Rust crates

### Applications

#### Site code and content

- [`/apps/hashdotai`](apps/hashdotai): contains the [HASH user guide] and [glossary of terms] content
- [`/apps/hashdotdev`](apps/hashdotdev): contains the [hash.dev] developer-education website content and code

### Blocks

- [`/blocks`](blocks): source code for all of HASH's open-source [Block Protocol] blocks

### Infrastructure

- [`/infra/terraform`](infra/terraform): contains Terraform modules for deploying HASH on AWS

### Libraries

- [`/packages/hash`](packages/hash): codebase for [HASH] - a data-driven, entity-centric, all-in-one workspace based on the Block Protocol
- [`/apps/engine`](apps/engine): codebase for our next-gen version of [HASH Engine] - a versatile agent-based simulation engine written in Rust
- [`/packages/libs`](packages/libs): source code for our open-source developer libraries

## Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) if you're interested in getting involved in the design or development of HASH.

We're also [hiring] for a number of key roles. If you contribute to HASH's public monorepo be sure to mention this in your application.

## License

Please see [LICENSE](LICENSE.md) for more information about the terms under which the various parts of this repository are made available

## Security

Please see [SECURITY](SECURITY.md) for instructions around reporting issues, and details of which package versions we actively support

## Contact

Find us on Twitter at [@hashintel](https://twitter.com/hashintel), or join our [Discord] community for quick help and support.

Project permalink: `https://github.com/hashintel/hash`
