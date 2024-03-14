import { Box } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { mdxImageClasses } from "./mdx-image";

export const ImageWithText: FunctionComponent<{ children?: ReactNode }> = ({
  children,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      [`.${mdxImageClasses.root}`]: { flexShrink: 0 },
    }}
  >
    {children}
  </Box>
);
