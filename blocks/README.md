[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_blocks
[github_star]: https://github.com/hashintel/hash/tree/main/blocks#
[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_blocks
[`address`]: address
[`ai-chat`]: ai-chat
[`ai-image`]: ai-image
[`ai-text`]: ai-text
[`callout`]: callout
[`chart`]: chart
[`code`]: code
[`countdown`]: countdown
[`divider`]: divider
[`embed`]: embed
[`faq`]: faq
[`heading`]: heading
[`how-to`]: how-to
[`image`]: image
[`kanban-board`]: kanban-board
[`minesweeper`]: minesweeper
[`paragraph`]: paragraph
[`person`]: person
[`shuffle`]: shuffle
[`table`]: table
[`timer`]: timer
[`video`]: video

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/5a38c5f3-6474-4b6c-71e6-ecf01914f000/github)][github_banner]

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Blocks

This directory contains the source code for all HASH-developed public [Block Protocol](https://blockprotocol.org/) blocks.

You can live preview most of these on the [`@hash`](https://blockprotocol.org/@hash/blocks) page in the [Þ Hub](https://blockprotocol.org/hub), and direct links are provided below.

**Please note:** this table/directory contains HASH-published blocks only, and does not contain the full extent of available Þ blocks.

| Directory        | Spec Target | Status         | Þ Hub URL                                                                        | Description |
| ---------------- | ----------- | -------------- | -------------------------------------------------------------------------------- | ----------- |
| [`address`]      | 0.3         | **Maintained** | [@hash/blocks/address](https://blockprotocol.org/@hash/blocks/address)           |             |
| [`ai-chat`]      | 0.3         | **Maintained** | [@hash/blocks/ai-chat](https://blockprotocol.org/@hash/blocks/ai-chat)           |             |
| [`ai-image`]     | 0.3         | **Maintained** | [@hash/blocks/ai-image](https://blockprotocol.org/@hash/blocks/ai-image)         |             |
| [`ai-text`]      | 0.3         | **Maintained** | [@hash/blocks/ai-text](https://blockprotocol.org/@hash/blocks/ai-text)           |             |
| [`callout`]      | 0.3         | **Maintained** | [@hash/blocks/callout](https://blockprotocol.org/@hash/blocks/callout)           |             |
| [`chart`]        | 0.1         | Pending Update |                                                                                  |             |
| [`code`]         | 0.3         | **Maintained** | [@hash/blocks/code](https://blockprotocol.org/@hash/blocks/code)                 |             |
| [`countdown`]    | 0.3         | **Maintained** | [@hash/blocks/countdown](https://blockprotocol.org/@hash/blocks/countdown)       |             |
| [`divider`]      | 0.3         | **Maintained** | [@hash/blocks/divider](https://blockprotocol.org/@hash/blocks/divider)           |             |
| [`embed`]        | 0.1         | Pending Update |                                                                                  |             |
| [`faq`]          | 0.3         | **Maintained** | [@hash/blocks/faq](https://blockprotocol.org/@hash/blocks/faq)                   |             |
| [`heading`]      | 0.3         | **Maintained** | [@hash/blocks/heading](https://blockprotocol.org/@hash/blocks/heading)           |             |
| [`how-to`]       | 0.3         | **Maintained** | [@hash/blocks/how-to](https://blockprotocol.org/@hash/blocks/how-to)             |             |
| [`image`]        | 0.3         | **Maintained** | [@hash/blocks/image](https://blockprotocol.org/@hash/blocks/image)               |             |
| [`kanban-board`] | 0.3         | **Maintained** | [@hash/blocks/kanban-board](https://blockprotocol.org/@hash/blocks/kanban-board) |             |
| [`minesweeper`]  | 0.3         | **Maintained** | [@hash/blocks/minesweeper](https://blockprotocol.org/@hash/blocks/minesweeper)   |             |
| [`paragraph`]    | 0.3         | **Maintained** | [@hash/blocks/paragraph](https://blockprotocol.org/@hash/blocks/paragraph)       |             |
| [`person`]       | 0.2         | Pending Update |                                                                                  |             |
| [`shuffle`]      | 0.3         | **Maintained** | [@hash/blocks/shuffle](https://blockprotocol.org/@hash/blocks/shuffle)           |             |
| [`table`]        | 0.3         | **Maintained** | [@hash/blocks/table](https://blockprotocol.org/@hash/blocks/table)               |             |
| [`timer`]        | 0.3         | **Maintained** | [@hash/blocks/timer](https://blockprotocol.org/@hash/blocks/timer)               |             |
| [`video`]        | 0.3         | **Maintained** | [@hash/blocks/video](https://blockprotocol.org/@hash/blocks/video)               |             |

## Creating a block

Run the following command to create a new block:

```sh
yarn create-block block-name
```

## Running these blocks

If you want to work on, build or serve a single block, run:

```sh
yarn workspace @blocks/block-name dev
## or
yarn workspace @blocks/block-name build
## or
yarn workspace @blocks/block-name serve
```

## Publishing blocks

Blocks are currently published via manually-triggered GitHub actions:

- Publish blocks to preview (choose a branch)
- Publish blocks to production

## Using these blocks

As a user, you can access the published versions of these blocks via any embedding application that integrates with the Þ Hub.
