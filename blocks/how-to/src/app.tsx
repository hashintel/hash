import {
  useEntitySubgraph,
  useGraphBlockService,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";
import Box from "@mui/material/Box";
import { useRef } from "react";

export const App: BlockComponent<true, RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);
  const { rootEntity: blockEntity, linkedEntities } =
    useEntitySubgraph(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties,
  } = blockEntity;

  return (
    <ThemeProvider theme={theme}>
      <Box
        ref={blockRootRef}
        sx={{ display: "inline-block", width: { xs: "100%", md: "auto" } }}
      >
        How-to block
      </Box>
    </ThemeProvider>
  );
};
