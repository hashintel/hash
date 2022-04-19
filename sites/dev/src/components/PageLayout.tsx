import { Box } from "@mui/material";
import { FC } from "react";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { PreFooter } from "./PreFooter";

export const PageLayout: FC<{ subscribe?: boolean }> = ({
  children,
  subscribe = true,
}) => (
  <Box display="flex" flexDirection="column" sx={{ minHeight: "100vh" }}>
    <Navbar />
    <Box flexGrow={1} display="flex" flexDirection="column">
      {children}
    </Box>
    <Box sx={{ flex: 1 }} />
    <PreFooter subscribe={subscribe} />
    <Footer />
  </Box>
);
