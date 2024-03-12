[`blog`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/blog
[`glossary`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/glossary
[`guide`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/guide
[`integrations`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/integrations
[`internal` monorepo]: https://github.com/hashintel/internal
[hash.ai]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/blog]: https://hash.ai/blog?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/guide]: https://hash.ai/guide?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/glossary]: https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/integrations]: https://hash.ai/integrations?utm_medium=organic&utm_source=github_readme_hashdotai
[mdx]: https://mdxjs.com/?utm_source=hash&utm_medium=github&utm_id=hashdotai&utm_content=readme-file

# `hashdotai`

## Overview

The [hash.ai] website code currently resides in our private [`internal` monorepo]. However, certain site content is made publicly editable and available under Creative Commons/open-source licenses.

- **Blog Posts** ([hash.ai/blog]): found in this repository under the [`blog`] directory
- **User Guide** ([hash.ai/guide]): found in this repository under the [`guide`] directory
- **Glossary Definitions** ([hash.ai/glossary]): found in this repository under the [`glossary`] directory
- **Integrations Directory** ([hash.ai/integrations]): individual listings found in this repository under the [`integrations`] directory
- Other hash.ai website content will be migrated here in due course. 

## MDX file format

Our resources are written in [MDX], a format which allows for using JSX tags in Markdown documents.

This has the same syntax as Markdown documents, except for special tags we use to highlight certain elements, which you can see examples of in existing documents.

There is currently an issue with code blocks inside of Custom MDX components, eg, `Tabs` or `Hint`. There needs to be a new line before any code block — i.e., text preceded by backticks ``` — so that the code inside isn't interpreted as JSX by the MDX parser. This issue should be fixed by improvements to the parser documented in the `mdx-js` repo (https://github.com/mdx-js/mdx/issues/1041) which were introduced in MDX v2. However, there are issues between MDX v2 and Prettier (https://github.com/prettier/prettier/issues/12209) preventing our adoption.