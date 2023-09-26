[`docs`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/docs
[`glossary`]: https://github.com/hashintel/hash/tree/main/apps/hashdotai/glossary
[`internal` monorepo]: https://github.com/hashintel/internal
[hash.ai]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/docs]: https://hash.ai/docs?utm_medium=organic&utm_source=github_readme_hashdotai
[hash.ai/glossary]: https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_hashdotai
[mdx]: https://mdxjs.com/?utm_source=hash&utm_medium=github&utm_id=hashdotai&utm_content=readme-file

# `hashdotai`

## Overview

The [hash.ai] website code currently resides in our private [`internal` monorepo]. However, certain site content is made publicly editable and available under Creative Commons/open-source licenses.

- **User Guide** ([hash.ai/docs]): found in this repository under the [`docs`] directory
- **Glossary Definitions** ([hash.ai/glossary]): found in this repository under the [`glossary`] directory
- Other hash.ai website content will be migrated here in due course.

## MDX file format

Our resources are written in [MDX], a format which allows for using JSX tags in Markdown documents.

This has the same syntax as Markdown documents, except for special tags we use to highlight certain elements, which you can see examples of in existing documents.

There is currently an issue with code blocks inside of Custom MDX components, eg, `Tabs` or `Hint`. There needs to be a new line before any code block (ie, text preceded by backticks ```) so that the code inside isn't interpreted as JSX by the MDX parser. This issue should be fixed by improvements to the parser documented in the `mdx-js` repo (https://github.com/mdx-js/mdx/issues/1041) which were introduced in MDX v2. However, there are issues between MDX v2 and Prettier (https://github.com/prettier/prettier/issues/12209) preventing our adoption.

## Future plans

The written contents of this directory will be moved out to a dedicated `content` or `docs` folder, while all new public website code will be added to the [`hashdotai-new` directory](https://github.com/hashintel/hash/tree/main/apps/hashdotai-new). Eventually this directory will be removed, with all of its contents having been migrated elsewhere or otherwise replaced.
