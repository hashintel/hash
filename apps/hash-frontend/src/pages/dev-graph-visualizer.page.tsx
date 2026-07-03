import { Box } from "@mui/material";

import { DevHarness } from "./shared/graph-visualizer/dev-harness/harness";

import type { NextPageWithLayout } from "../shared/layout";

/**
 * Dev-only route hosting the graph-visualizer dev harness full-viewport, with no app chrome
 * (`getLayout` returns the page unchanged). Lets a developer iterate on
 * {@link EntityGraphVisualizerV2} against synthetic data.
 */
const DevGraphVisualizerPage: NextPageWithLayout = () => {
  return (
    <Box sx={{ height: "100vh", width: "100%" }}>
      <DevHarness />
    </Box>
  );
};

DevGraphVisualizerPage.getLayout = (page) => page;

export default DevGraphVisualizerPage;
