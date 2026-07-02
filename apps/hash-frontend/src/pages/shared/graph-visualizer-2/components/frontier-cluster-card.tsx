import { Box, Divider, Typography } from "@mui/material";
import { keyframes } from "@mui/system";
import { memo } from "react";

import { Button } from "../../../../shared/ui/button";
import { graphColors } from "../visual-style";

interface FrontierClusterCardProps {
  /** Number of unexpanded (frontier) entities the cluster holds. */
  readonly count: number;
  /** Bubble centre in container pixels. */
  readonly x: number;
  readonly y: number;
  /** Bubble on-screen radius (px); the card sits just outside the right edge. */
  readonly radiusPx: number;
  /** A frontier fetch is already in flight, so the action is busy. */
  readonly isFetching: boolean;
  readonly onLoad: () => void;
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
}

const rise = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const [frontierR, frontierG, frontierB] = graphColors.frontier;

type FrontierClusterBodyProps = Pick<
  FrontierClusterCardProps,
  "count" | "isFetching" | "onLoad"
>;

/**
 * The card's visual body, memoized on its content (not the bubble position), so the per-frame
 * re-position of the wrapper never re-lays out this MUI tree. Echoes the grey frontier bubble with a
 * matching swatch and follows the same icon + title + stat discipline as the other graph cards.
 */
const FrontierClusterBodyComponent = ({
  count,
  isFetching,
  onLoad,
}: FrontierClusterBodyProps) => (
  <Box
    sx={({ palette, boxShadows }) => ({
      minWidth: 188,
      maxWidth: 260,
      bgcolor: palette.common.white,
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: "8px",
      boxShadow: boxShadows.md,
      overflow: "hidden",
      animation: `${rise} 130ms cubic-bezier(0.22, 1, 0.36, 1)`,
      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
    })}
  >
    <Box
      sx={{
        px: 1.75,
        pt: 1.5,
        pb: 1.25,
        display: "flex",
        alignItems: "center",
        gap: 1.25,
      }}
    >
      {/* A swatch in the frontier grey, tying the card to the greyed-out bubble it acts on. */}
      <Box
        sx={({ palette }) => ({
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: "50%",
          bgcolor: `rgb(${frontierR}, ${frontierG}, ${frontierB})`,
          border: `1px solid ${palette.gray[30]}`,
        })}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="smallTextLabels"
          sx={{
            display: "block",
            fontWeight: 600,
            lineHeight: 1.2,
            color: ({ palette }) => palette.gray[90],
          }}
        >
          Unexpanded cluster
        </Typography>
        <Typography
          variant="microText"
          sx={{
            display: "block",
            mt: 0.25,
            color: ({ palette }) => palette.gray[70],
          }}
        >
          <Box
            component="span"
            sx={{ fontWeight: 600, color: ({ palette }) => palette.gray[90] }}
          >
            {count.toLocaleString()}
          </Box>{" "}
          {count === 1 ? "entity" : "entities"} not loaded
        </Typography>
      </Box>
    </Box>

    <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />

    <Button
      variant="primary"
      size="xs"
      fullWidth
      disabled={isFetching}
      onClick={onLoad}
      sx={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
    >
      {isFetching ? "Loading..." : "Load entities"}
    </Button>
  </Box>
);

const FrontierClusterBody = memo(FrontierClusterBodyComponent);

/**
 * Action card for a wholly-frontier cluster bubble: its unexpanded entity count and a button that
 * loads them. Unlike the click-through hover cards, this one is interactive (the Load button), so
 * the bridge keeps it open while the cursor is over the bubble OR the card. The wrapper positions
 * the card just outside the bubble's right edge via a GPU transform and re-positions every frame so
 * it tracks the bubble; {@link FrontierClusterBody} is memoized so that move never re-lays it out.
 */
export const FrontierClusterCard = ({
  count,
  x,
  y,
  radiusPx,
  isFetching,
  onLoad,
  onMouseEnter,
  onMouseLeave,
}: FrontierClusterCardProps) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${x + radiusPx + 12}px, calc(${y}px - 50%), 0)`,
      pointerEvents: "auto",
      zIndex: 11,
      willChange: "transform",
    }}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    <FrontierClusterBody
      count={count}
      isFetching={isFetching}
      onLoad={onLoad}
    />
  </div>
);
