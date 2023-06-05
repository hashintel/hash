[blockprotocol/blockprotocol repo]: https://github.com/blockprotocol/blockprotocol
[contributing guidelines]: https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md
[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[github_star]: https://github.com/hashintel/hash/tree/main/apps#
[hash]: https://hash.ai/platform/hash?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash engine]: https://hash.ai/platform/engine?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash.ai]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash.design]: https://hash.design/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash.dev]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_apps

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/01e2b813-d046-4b70-cc4e-eb2f1ead6900/github)][github_banner]

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Applications

## About this directory

This `apps` directory contains the source-code and/or content for a number of HASH's projects and websites.

## HASH

[HASH], is a block-based, data-centric, all-in-one workspace. 

See the [`README`](hash/README.md) in the [`hash`](hash) folder for a holistic description of the workspace, and instructions for running it or testing it.

The workspace depends on a suite of constituent services, which are briefly described below, keep in mind that they are not guaranteed to be useful when ran independently.

| Subdirectory             | Description                                                                                                                                                                  |
|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `hash-frontend`          | The main entrypoint for the Next.js frontend (graphical user interface) of the HASH workspace application.                                                                   |
| `hash-api`               | The main entrypoint for the Node.js server that serves the core of the backend API of HASH.                                                                                  |
| `hash-graph`             | The query layer over the main datastore of HASH, its strongly-typed graph.                                                                                                   |
| `hash-external-services` | Defines the running configurations of external (not internally-developed) services that HASH depends on, such as Postgres, Ory Kratos, and Temporal. _(pending refactoring)_ |
| `hash-realtime`          | Implements a different view over the graph datastore that allows services to subscribe to realtime updates on entities.                                                      |
| `hash-search-loader`     | Loads the change-stream published by the realtime service into a search index.                                                                                               |
| `hash-task-executor`     | An experimental service that allows for the execution of pre-defined tasks. (Pending removal in favor of Temporal)                                                           |

## Websites

| Subdirectory                   | Description                                                                                                                             |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| [hashdotai](hashdotai)         | Content related to our main [hash.ai] website                                                                                           |
| [hashdotdesign](hashdotdesign) | Source code and content related to our [hash.design] designer-focused website                                                           |
| [hashdotdev](hashdotdev)       | Source code and content related to our [hash.dev] developer-focused website                                                             |

## Other projects

The following applications are available but currently unsupported. However, as with our main projects, we remain open to accepting contributions to these in accordance with our [contributing guidelines].

| Subdirectory                             | Description                                                                                                |
|------------------------------------------|------------------------------------------------------------------------------------------------------------|
| [`engine`](engine)                       | Codebase for the alpha version of [HASH Engine], a versatile agent-based simulation engine written in Rust |
| [`intellij-plugin`](intellij-plugin)     | Plugin for JetBrains IntelliJ-based IDEs to assist development in common HASH workflows                    |
| [`hash-agents`](hash-agents)             | An experimental setup for writing Python-based 'agents' that interface with LLMs.                          |
| [`hash-ai-worker-py`](hash-ai-worker-py) | A Python-based [Temporal](temporal.io) worker, tasked with executing AI-powered workflows.                 |
| [`hash-ai-worker-ts`](hash-ai-worker-ts) | A TypeScript-based [Temporal](temporal.io) worker, tasked with executing AI-powered workflows.             |

Source code for the _Block Protocol_ can be found separately in the [blockprotocol/blockprotocol repo] on GitHub.
