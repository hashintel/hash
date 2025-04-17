[`blockprotocol/blockprotocol`]: https://github.com/blockprotocol/blockprotocol
[mdx]: https://mdxjs.com/?utm_source=hash&utm_medium=github&utm_id=hashdotai&utm_content=readme-file

<!-- markdownlint-disable link-fragments -->

[github_star]: https://github.com/hashintel/hash#

[![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Content

This directory contains content from various of our websites (e.g. `hash.ai`, `hash.dev`, etc.) which is intended to be be publicly-editable. If you have a change suggestion, typo fix, or improvement, please feel free to open a PR. All submissions are reviewed by a human and only those deemed to be helpful will be accepted.

Content pertaining to the Block Protocol can be found separately in the [`blockprotocol/blockprotocol`] repository.

## MDX file format

Our resources are written in [MDX], a format which allows for using JSX tags in Markdown documents.

This has the same syntax as Markdown documents, except for special tags we use to highlight certain elements, which you can see examples of in existing documents.

There is currently an issue with code blocks _inside of_ Custom MDX components, eg, `Tabs` or `Hint`. There needs to be a new line before any code block (i.e. text preceded by backticks ```) so that the code inside isn't interpreted as JSX by the MDX parser. This issue should be fixed by improvements to the parser documented in the `mdx-js` repo (https://github.com/mdx-js/mdx/issues/1041) which were introduced in MDX v2.
