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
