[`blockprotocol/blockprotocol` repo]: https://github.com/blockprotocol/blockprotocol
[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[github_star]: https://github.com/hashintel/hash/tree/main/apps#
[hash]: https://hash.ai/platform/hash?utm_medium=organic&utm_source=github_readme_hash-repo_apps
[hash browser plugin]: https://hash.ai/guide/plugins?utm_medium=organic&utm_source=github_readme_hash-repo_apps#browser-extension
[hash.design]: https://hash.design/?utm_medium=organic&utm_source=github_readme_hash-repo_apps

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/01e2b813-d046-4b70-cc4e-eb2f1ead6900/github)][github_banner]

[![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Applications

## About this directory

This `apps` directory contains the source-code and/or content for a number of HASH's projects and websites.

## HASH

[HASH] is a block-based, data-centric, AI-enabled "super app".

### Application

The ["Getting Started"](/README.md#--getting-started) section of the repository's root README provides instructions for running HASH.

The application depends on a suite of constituent services, which are briefly described below. Please note that these are not designed or guaranteed to be useful when run independently.

| Subdirectory                                         | Description                                                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`hash-ai-worker-ts`](hash-ai-worker-ts)             | A TypeScript-based [Temporal](temporal.io) worker, tasked with executing AI-powered workflows                                                                                |
| [`hash-api`](hash-api)                               | The main entrypoint for the Node.js server that serves the core of the backend API of HASH.                                                                                  |
| [`hash-external-services`](hash-external-services)   | Defines the running configurations of external (not internally-developed) services that HASH depends on, such as Postgres, Ory Kratos, and Temporal. _(pending refactoring)_ |
| [`hash-frontend`](hash-frontend)                     | The main entrypoint for the Next.js frontend (graphical user interface) of the HASH workspace application.                                                                   |
| [`hash-graph`](hash-graph)                           | The query layer over the main datastore of HASH, its strongly-typed graph.                                                                                                   |
| [`hash-integration-worker`](hash-integration-worker) | The integration worker manages the two-way synchronization of external data with HASH.                                                                                       |
| [`hash-realtime`](hash-realtime)                     | Implements a different view over the graph datastore that allows services to subscribe to realtime updates on entities.                                                      |
| [`hash-search-loader`](hash-search-loader)           | Loads the change-stream published by the realtime service into a search index.                                                                                               |

### Plugins

| Subdirectory                     | Description                               |
| -------------------------------- | ----------------------------------------- |
| [plugin-browser](plugin-browser) | Source code for the [HASH browser plugin] |

## Dev Tools

| Subdirectory                                     | Description                                    |
| ------------------------------------------------ | ---------------------------------------------- |
| [lm-prompt-optimization](lm-prompt-optimization) | Prompt optimizer                               |
| [mcp](mcp)                                       | Self-maintained Model Context Protocol servers |

## Websites

| Subdirectory                   | Description                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| [hashdotdesign](hashdotdesign) | Source code and content related to our [hash.design] designer-focused website |

Source code for our other websites (e.g. `hash.ai`, `hash.dev`, etc.) can be found in HASH's `internal` company monorepo, with the exception of that relating to the _Block Protocol_, which has been separately published in the [`blockprotocol/blockprotocol` repo] on GitHub.
