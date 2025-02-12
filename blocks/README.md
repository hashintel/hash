[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_blocks
[github_star]: https://github.com/hashintel/hash/tree/main/blocks#
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

[![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Blocks

HASH is built around the open [Block Protocol](https://blockprotocol.org) ([@blockprotocol/blockprotocol](https://github.com/blockprotocol/blockprotocol) on GitHub). The current version of HASH is based upon an adapted version of the [Block Protocol Graph Module](https://blockprotocol.org/spec/graph) which will be formalized at a later date.

Planned features such as [pages](https://hash.ai/guide/pages) and [apps](https://hash.ai/guide/apps) more directly utilize the [blocks](https://hash.ai/guide/pages/blocks) found in this directory, which contains the source code for all public HASH-developed [Block Protocol](https://blockprotocol.org/) blocks.

## HASH Blocks

You can preview most HASH blocks on the [`@hash`](https://blockprotocol.org/@hash/blocks) page in the [Þ Hub](https://blockprotocol.org/hub), and direct links are provided below.

| Directory        | Spec Target | Status         | Þ Hub URL                                                                        | Description |
| ---------------- | ----------- | -------------- | -------------------------------------------------------------------------------- | ----------- |
| [`address`]      | 0.3         | **Maintained** | [@hash/blocks/address](https://blockprotocol.org/@hash/blocks/address)           |             |
| [`ai-chat`]      | 0.3         | **Maintained** | [@hash/blocks/ai-chat](https://blockprotocol.org/@hash/blocks/ai-chat)           |             |
| [`ai-image`]     | 0.3         | **Maintained** | [@hash/blocks/ai-image](https://blockprotocol.org/@hash/blocks/ai-image)         |             |
| [`ai-text`]      | 0.3         | **Maintained** | [@hash/blocks/ai-text](https://blockprotocol.org/@hash/blocks/ai-text)           |             |
| [`callout`]      | 0.3         | **Maintained** | [@hash/blocks/callout](https://blockprotocol.org/@hash/blocks/callout)           |             |
| [`chart`]        | 0.1         | **Maintained** | [@hash/blocks/callout](https://blockprotocol.org/@hash/blocks/chart)             |             |
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

**Please note:** this table/directory contains HASH-developed blocks which are (or were) published to the [Þ Hub](https://blockprotocol.org/hub) under the official `@hash` namespace. This reflects neither the full extent of available Þ blocks, nor even those originally developed by HASH. A number of other publicly-accessible blocks can be found in the `@hashdeps` GitHub org, including the [Calculation Table](https://github.com/hashdeps/calculation-table-block), [Drawing](https://github.com/hashdeps/tldraw-block), and [Pull/Merge Request Overview](https://github.com/hashdeps/github-pr-overview) blocks.

## Using blocks

**In the HASH app (production):** Blocks published to the [Þ Hub](https://blockprotocol.org/hub) can be run within HASH via the 'insert block' (aka. 'slash') menu.

**In the HASH app (development):** While running the HASH app in development mode, in addition to inserting blocks published to the Þ Hub, you can also test locally-developed blocks out by going to any page, clicking on the menu next to an empty block, and pasting in the URL to your block's distribution folder (i.e. the one containing `block-metadata.json`, `block-schema.json`, and the block's code). If you need a way of serving your folder, try [`serve`](https://github.com/vercel/serve).

**From the command line:** If you want to work on, build or serve a single block, run:

```sh
yarn workspace @blocks/block-name dev
## or
yarn workspace @blocks/block-name build
## or
yarn workspace @blocks/block-name serve
```

**From other applications:** Blocks published to the [Þ Hub](https://blockprotocol.org/hub) can be used within any embedding application that integrates with the Block Protocol.

## Creating blocks

See the [Developing Blocks](https://blockprotocol.org/docs/developing-blocks) page in the [Þ Docs](https://blockprotocol.org/docs) for instructions on developing and publishing your own blocks.

Run the following command to create a new block:

```sh
yarn create-block block-name
```

## Publishing blocks

The HASH-developed blocks in this repository are currently published via manually-triggered GitHub actions:

- Publish blocks to preview (choose a branch)
- Publish blocks to production

To publish your own block, in another [Þ Hub](https://blockprotocol.org/hub) namespace (and separate from this repository), see the "[Publishing Blocks](https://blockprotocol.org/docs/blocks/develop#publish)" guide in the Þ Docs.
