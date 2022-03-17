import { Box } from "@mui/material";
import { FC } from "react";
import { Navbar } from "./Navbar";

export const PageLayout: FC = ({ children }) => (
  <Box display="flex" flexDirection="column" sx={{ minHeight: "100vh" }}>
    <Navbar />
    <Box flexGrow={1} display="flex" flexDirection="column">
      {children}
    </Box>
  </Box>
);
