import { Stack, Typography } from "@mui/material";

import { LoadingSpinner } from "@hashintel/design-system";

import { GraphOverlayPanel } from "./graph-overlay-panel";

interface GraphStatusOverlayProps {
  readonly title: string;
  readonly description?: string;
  readonly variant?: "loading" | "empty" | "error";
}

export const GraphStatusOverlay = ({
  title,
  description,
  variant = "loading",
}: GraphStatusOverlayProps) => (
  <GraphOverlayPanel placement="top-left" interactive={false}>
    <Stack direction="row" gap={1.25} alignItems="flex-start">
      {variant === "loading" ? <LoadingSpinner size={18} /> : null}
      <Stack gap={0.25}>
        <Typography
          variant="smallTextLabels"
          sx={{
            fontWeight: 600,
            color: ({ palette }) =>
              variant === "error" ? palette.red[80] : palette.gray[90],
          }}
        >
          {title}
        </Typography>
        {description ? (
          <Typography variant="microText" sx={{ color: "gray.70" }}>
            {description}
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  </GraphOverlayPanel>
);
