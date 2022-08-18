# HASH Resources

This folder contains our platform [documentation](https://hash.ai/docs?utm_medium=organic&utm_source=github_readme_resources) (`docs`) and [glossary](https://hash.ai/glossary?utm_medium=organic&utm_source=github_readme_resources) (`glossary`). We welcome user submissions to these, in line with our public monorepo [contributing guidelines](../../../CONTRIBUTING.md).

## MDX file format

Our resources are written in [MDX](https://mdxjs.com/), a format which allows for using JSX tags in Markdown documents.

This has the same syntax as Markdown documents, except for special tags we use to highlight certain elements, which you can see examples of in existing documents.

There is currently an issue with code blocks inside of Custom MDX components, eg, `Tabs` or `Hint`. There needs to be a new line before any code block (ie, text preceded by backticks ```) so that the code inside isn't interpreted as JSX by the MDX parser. This issue should be fixed by improvements to the parser documented in the `mdx-js` repo here: https://github.com/mdx-js/mdx/issues/1041
