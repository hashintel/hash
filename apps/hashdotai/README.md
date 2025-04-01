[`docs`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/docs
[`glossary`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/glossary
[`integrations`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/integrations
[`internal` monorepo]: https://github.com/hashintel/internal
[hash.ai]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/docs]: https://hash.ai/docs?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/glossary]: https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/integrations]: https://hash.ai/integrations?utm_medium=organic&utm_source=github_readme_hashdotai
[license determination instructions]: https://github.com/hashintel/hash/blob/main/LICENSE.md#1-license-determination
[mdx]: https://mdxjs.com/?utm_source=hash&utm_medium=github&utm_id=hashdotai&utm_content=readme-file

# `hashdotai`

## Overview

The [hash.ai] website code currently resides in our private [`internal` monorepo]. However, certain site content is made publicly editable, and/or is distributed under Creative Commons/open-source licenses. Please check the individual `LICENSE` information within each file or sub-directory as appropriate, per the [license determination instructions].

- **User Guide** ([hash.ai/docs]): in the [`docs`] sub-directory
- **Glossary Definitions** ([hash.ai/glossary]): in the [`glossary`] sub-directory
- **Integrations** ([hash.ai/integrations]): in the [`integrations`] sub-directory

## MDX file format

Our resources are written in [MDX], a format which allows for using JSX tags in Markdown documents.

This has the same syntax as Markdown documents, except for special tags we use to highlight certain elements, which you can see examples of in existing documents.

There is currently an issue with code blocks _inside of_ Custom MDX components, eg, `Tabs` or `Hint`. There needs to be a new line before any code block (ie, text preceded by backticks ```) so that the code inside isn't interpreted as JSX by the MDX parser. This issue should be fixed by improvements to the parser documented in the `mdx-js` repo (https://github.com/mdx-js/mdx/issues/1041) which were introduced in MDX v2.

## Future plans

This `hashdotai` directory will be moved to a new dedicated `content` directory in the root of this repository to facilitate easier discovery and user-suggested edits.
