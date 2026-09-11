/**
 * Add support for another language:
 *
 * - import the grammar package from "prismjs/components/prism-[language]"
 * - you may have to re-build and download the prism.css
 *   to support the new language at https://prismjs.com/download.html
 *   that file resides at src/theme/prism.css and has to be imported by
 *   nextjs' _app.tsx as per nextjs convention.
 *
 * @see https://prismjs.com
 */
import { Box } from "@mui/material";
import DOMPurify from "dompurify";

import { Prism } from "../../../../shared/prism";

import type { BoxProps } from "@mui/material";
import type { FunctionComponent } from "react";

/**
 * Only allow the markup that Prism.js produces: `<span>` tags with `class`
 * attributes. Everything else is stripped as a defense-in-depth measure.
 */
const sanitizePrismOutput = (html: string): string =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["span"],
    ALLOWED_ATTR: ["class"],
  });

type SnippetProps = {
  source: string;
  language: string;
} & BoxProps;

export const Snippet: FunctionComponent<SnippetProps> = ({
  source,
  language,
  ...boxProps
}) => {
  const grammar = Prism.languages[language];
  if (!grammar) {
    return (
      <Box component="code" {...boxProps}>
        {source}
      </Box>
    );
  }

  return (
    <Box
      component="code"
      {...boxProps}
      dangerouslySetInnerHTML={{
        __html: sanitizePrismOutput(Prism.highlight(source, grammar, language)),
      }}
    />
  );
};
