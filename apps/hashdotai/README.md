# `hashdotai`

## Overview

The [hash.ai](https://hash.ai) website code currently resides in our private [`internal` monorepo](https://github.com/hashintel/internal). However, certain site content is made publicly editable and available under Creative Commons/open-source licenses.

- **User Guide** ([hash.ai/docs](https://hash.ai/docs)): found in this repository under the [`resources/docs`](https://github.com/hashintel/hash/tree/main/apps/hashdotai/docs) directory
- **Glossary Definitions** ([hash.ai/glossary](https://hash.ai/glossary)): found in this repository under the [`resources/glossary`](https://github.com/hashintel/hash/tree/main/apps/hashdotai/glossary) directory

Other hash.ai website content will be migrated here in due course.

## MDX file format

Our resources are written in [MDX](https://mdxjs.com/), a format which allows for using JSX tags in Markdown documents.

This has the same syntax as Markdown documents, except for special tags we use to highlight certain elements, which you can see examples of in existing documents.

There is currently an issue with code blocks inside of Custom MDX components, eg, `Tabs` or `Hint`. There needs to be a new line before any code block (ie, text preceded by backticks ```) so that the code inside isn't interpreted as JSX by the MDX parser. This issue should be fixed by improvements to the parser documented in the `mdx-js` repo here: https://github.com/mdx-js/mdx/issues/1041
