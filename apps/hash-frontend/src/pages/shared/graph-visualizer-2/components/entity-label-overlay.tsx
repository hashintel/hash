import { alpha, Box } from "@mui/material";
import { memo } from "react";

import type { EntityLabel } from "../render/scene";

interface EntityLabelOverlayProps {
  readonly labels: readonly EntityLabel[];
}

/**
 * One hub label's pill, memoized on its text so a per-frame position change (the wrapper's
 * transform) never re-lays out the text. Positioned absolutely at the wrapper's origin (which the
 * Scene places to the RIGHT of the dot) and vertically centred on the dot via translateY(-50%),
 * left-aligned -- so it reads "Name" beside the dot with the text start as the stable anchor.
 */
const HubLabel = memo(({ text }: { readonly text: string }) => (
  <Box
    sx={({ palette, boxShadows }) => ({
      position: "absolute",
      transform: "translateY(-50%)",
      maxWidth: 180,
      px: 0.75,
      py: 0.2,
      borderRadius: "5px",
      bgcolor: alpha(palette.common.white, 0.88),
      border: `1px solid ${palette.gray[20]}`,
      boxShadow: boxShadows.sm,
      typography: "microText",
      fontWeight: 700,
      letterSpacing: "-0.01em",
      color: palette.gray[90],
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    })}
  >
    {text}
  </Box>
));

/**
 * The always-on hub labels, overlaid as HTML over the canvas (in the hash-frontend design
 * language rather than GPU text). The Scene re-emits `labels` -- only the on-screen hubs, with
 * their current container-pixel positions -- each frame, so they track the camera + settling
 * layout. Each label rides a cheap GPU transform; the pill itself is memoized on its text.
 * Click-through (pointer-events disabled) so it never eats a hover / pan on the canvas.
 */
export const EntityLabelOverlay = ({ labels }: EntityLabelOverlayProps) => (
  <>
    {labels.map((label) => (
      <div
        key={label.entityId}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate3d(${label.x}px, ${label.y}px, 0)`,
          pointerEvents: "none",
          willChange: "transform",
          zIndex: 5,
        }}
      >
        <HubLabel text={label.text} />
      </div>
    ))}
  </>
);
