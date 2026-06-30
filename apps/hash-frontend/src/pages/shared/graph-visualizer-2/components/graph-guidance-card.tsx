import { Stack, Typography } from "@mui/material";

import { Button } from "../../../../shared/ui/button";
import { GraphOverlayPanel } from "./graph-overlay-panel";

interface GraphGuidanceCardProps {
  readonly onDismiss: () => void;
}

export const GraphGuidanceCard = ({ onDismiss }: GraphGuidanceCardProps) => (
  <GraphOverlayPanel placement="bottom-left">
    <Stack gap={1}>
      <Stack gap={0.4}>
        <Typography
          variant="smallTextLabels"
          sx={{ fontWeight: 500, color: "gray.90" }}
        >
          Explore relationships
        </Typography>
        <Typography variant="microText" sx={{ color: "gray.70" }}>
          Drag to pan, scroll to zoom, hover for details, and select a node to
          focus its neighbours.
        </Typography>
      </Stack>
      <Stack component="ul" gap={0.4} sx={{ pl: 2, m: 0 }}>
        <Typography
          component="li"
          variant="microText"
          sx={{ color: "gray.80" }}
        >
          Grey nodes are frontier entities outside the current query.
        </Typography>
        <Typography
          component="li"
          variant="microText"
          sx={{ color: "gray.80" }}
        >
          Bundled links can be opened as a table.
        </Typography>
      </Stack>
      <Button variant="tertiary" size="xs" onClick={onDismiss}>
        Got it
      </Button>
    </Stack>
  </GraphOverlayPanel>
);
