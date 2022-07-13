import { Box } from "@mui/material";
import { FC, ReactNode } from "react";
import { mdxImageClasses } from "./MdxImage";

export const ImageWithText: FC<{ children?: ReactNode }> = ({ children }) => (
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
