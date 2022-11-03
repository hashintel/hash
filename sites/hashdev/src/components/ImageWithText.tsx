import { Box } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";
import { mdxImageClasses } from "./MdxImage";

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
