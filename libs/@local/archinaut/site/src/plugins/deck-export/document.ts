/**
 * The exported file: the built stylesheet and script inlined into one HTML
 * document, which then goes through html-minifier-terser. The script is a
 * module, so it runs after the document is parsed and needs no load event.
 */

import { minify } from "html-minifier-terser";

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"]/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ??
      character,
  );

/** A script that names `</script` inside a string or a regex would end its element early. */
const scriptSafe = (code: string): string =>
  code.replace(/<\/(script)/giu, "<\\/$1");

export const exportedDocument = ({
  title,
  css,
  js,
}: {
  title: string;
  css: string;
  js: string;
}): Promise<string> =>
  minify(
    `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content="archinaut" />
    <title>${escapeHtml(title)}</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="deck"></div>
    <script type="module">${scriptSafe(js)}</script>
  </body>
</html>
`,
    {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
    },
  );
