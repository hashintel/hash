[blockprotocol/blockprotocol repo]: https://github.com/blockprotocol/blockprotocol
[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[github_star]: https://github.com/hashintel/hash/tree/main/apps#
[hash]: https://hash.ai/platform/hash?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash.ai]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash.design]: https://hash.design/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash.dev]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_apps

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/01e2b813-d046-4b70-cc4e-eb2f1ead6900/github)][github_banner]

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Applications

## About this directory

This `apps` directory contains the source-code and/or content for a number of HASH's projects and websites.

## HASH

[HASH] is a block-based, data-centric, AI-enabled "super app".

The [README in the `hash` directory](hash/README.md) provides a more detailed overview of the app, and instructions for running it.

The application depends on a suite of constituent services, which are briefly described below. Please note that these are not designed or guaranteed to be useful when ran independently.

| Subdirectory                                       | Description                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`hash-ai-worker-ts`](hash-ai-worker-ts)           | A TypeScript-based [Temporal](temporal.io) worker, tasked with executing AI-powered workflows                                                                                |
| [`hash-api`](hash-api)                             | The main entrypoint for the Node.js server that serves the core of the backend API of HASH.                                                                                  |
| [`hash-external-services`](hash-external-services) | Defines the running configurations of external (not internally-developed) services that HASH depends on, such as Postgres, Ory Kratos, and Temporal. _(pending refactoring)_ |
| [`hash-frontend`](hash-frontend)                   | The main entrypoint for the Next.js frontend (graphical user interface) of the HASH workspace application.                                                                   |
| [`hash-graph`](hash-graph)                         | The query layer over the main datastore of HASH, its strongly-typed graph.                                                                                                   |
| [`hash-realtime`](hash-realtime)                   | Implements a different view over the graph datastore that allows services to subscribe to realtime updates on entities.                                                      |
| [`hash-search-loader`](hash-search-loader)         | Loads the change-stream published by the realtime service into a search index.                                                                                               |

## Websites

| Subdirectory                   | Description                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| [hashdotai](hashdotai)         | Content related to our main [hash.ai] website                                 |
| [hashdotdesign](hashdotdesign) | Source code and content related to our [hash.design] designer-focused website |
| [hashdotdev](hashdotdev)       | Source code and content related to our [hash.dev] developer-focused website   |

## Block Protocol

Source code for the _Block Protocol_ can be found separately in the [blockprotocol/blockprotocol repo] on GitHub.
