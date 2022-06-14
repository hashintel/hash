/* eslint-disable import/no-duplicates -- import "prismjs" has a side-effect so needs to be listed before "prismjs/components/*"  */
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
import "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-json5";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-typescript";

import { Box, BoxProps } from "@mui/material";
import Prism from "prismjs";
import React from "react";

type SnippetProps = {
  source: string;
  language: string;
} & BoxProps;

export const Snippet: React.VFC<SnippetProps> = ({
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
      // trust prism to properly escape the source
      dangerouslySetInnerHTML={{
        __html: Prism.highlight(source, grammar, language),
      }}
    />
  );
};
