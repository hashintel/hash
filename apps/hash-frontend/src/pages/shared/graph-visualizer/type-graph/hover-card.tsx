/**
 * Hover / selection card for a type node, and the smaller card for a hovered
 * link-type edge. Same shell + per-frame positioning pattern as the entity
 * lifecycle's `entity-graph/hover-card.tsx`: a GPU-transformed click-through
 * wrapper moves every pan frame, the memoized body lays out once per subject.
 */
import { Box, Divider, Typography } from "@mui/material";
import { keyframes } from "@mui/system";
import { memo } from "react";

import { EntityOrTypeIcon } from "@hashintel/design-system";

import { Button } from "../../../../shared/ui/button";

import type { Position } from "../geometry";
import type { TypeDisplayInfo } from "./build-graph";

const rise = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const KIND_LABELS: Record<TypeDisplayInfo["kind"], string> = {
  entityType: "Entity Type",
  linkType: "Link Type",
  anything: "Any entity type",
};

interface TypeHoverCardProps extends Position {
  readonly display: TypeDisplayInfo;
  /**
   * When set, the card is "pinned" (a selection, not a hover): it renders an
   * Open action that calls this. Must be referentially stable across pans, or
   * the memoized body re-renders every frame.
   */
  readonly onOpen?: () => void;
}

type TypeHoverCardBodyProps = Omit<TypeHoverCardProps, "x" | "y">;

const TypeHoverCardBodyComponent = ({
  display,
  onOpen,
}: TypeHoverCardBodyProps) => (
  <Box
    sx={({ palette, boxShadows }) => ({
      position: "relative",
      minWidth: 190,
      maxWidth: 280,
      bgcolor: onOpen ? palette.blue[10] : palette.common.white,
      border: `1px solid ${onOpen ? palette.blue[30] : palette.gray[20]}`,
      borderRadius: "8px",
      boxShadow: boxShadows.md,
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
      <Box
        sx={({ palette }) => ({
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: "7px",
          bgcolor: palette.gray[10],
          border: `1px solid ${palette.gray[20]}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <EntityOrTypeIcon
          entity={null}
          icon={display.icon}
          isLink={display.kind === "linkType"}
          fontSize={17}
          fill={({ palette }) => palette.gray[70]}
        />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="smallTextLabels"
          sx={{
            display: "block",
            fontWeight: 600,
            lineHeight: 1.2,
            color: ({ palette }) => palette.gray[90],
            wordBreak: "break-word",
          }}
        >
          {display.title}
        </Typography>
        <Typography
          variant="microText"
          sx={{
            display: "block",
            mt: 0.25,
            color: ({ palette }) => palette.gray[70],
          }}
        >
          {KIND_LABELS[display.kind]}
          {display.kind !== "anything" && !display.isLoaded
            ? " · not in view"
            : ""}
        </Typography>
      </Box>
    </Box>

    {onOpen ? (
      <>
        <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
        <Button
          variant="primary"
          size="xs"
          fullWidth
          onClick={onOpen}
          // The wrapper is click-through (pointerEvents: none) so it never
          // eats a hover/pan on the canvas; the one interactive control opts
          // back in.
          sx={{
            pointerEvents: "auto",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          Open
        </Button>
      </>
    ) : null}
  </Box>
);

const TypeHoverCardBody = memo(TypeHoverCardBodyComponent);

export const TypeHoverCard = ({
  display,
  x,
  y,
  onOpen,
}: TypeHoverCardProps) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${x + 14}px, ${y + 14}px, 0)`,
      pointerEvents: "none",
      zIndex: 10,
      willChange: "transform",
    }}
  >
    <TypeHoverCardBody display={display} onOpen={onOpen} />
  </div>
);

interface EdgeHoverCardProps extends Position {
  readonly linkTypeTitle: string;
  readonly sourceTitle: string;
  readonly targetTitle: string;
}

const EdgeHoverCardBodyComponent = ({
  linkTypeTitle,
  sourceTitle,
  targetTitle,
}: Omit<EdgeHoverCardProps, "x" | "y">) => (
  <Box
    sx={({ palette, boxShadows }) => ({
      minWidth: 170,
      maxWidth: 280,
      px: 1.75,
      py: 1.25,
      bgcolor: palette.common.white,
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: "8px",
      boxShadow: boxShadows.md,
      animation: `${rise} 130ms cubic-bezier(0.22, 1, 0.36, 1)`,
      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
    })}
  >
    <Typography
      variant="smallTextLabels"
      sx={{
        display: "block",
        fontWeight: 600,
        lineHeight: 1.2,
        color: ({ palette }) => palette.gray[90],
      }}
    >
      {linkTypeTitle}
    </Typography>
    <Typography
      variant="microText"
      sx={{
        display: "block",
        mt: 0.25,
        color: ({ palette }) => palette.gray[70],
      }}
    >
      {sourceTitle} &rarr; {targetTitle}
    </Typography>
  </Box>
);

const EdgeHoverCardBody = memo(EdgeHoverCardBodyComponent);

/** The hovered link-type edge's summary, anchored to the edge. */
export const EdgeHoverCard = ({
  linkTypeTitle,
  sourceTitle,
  targetTitle,
  x,
  y,
}: EdgeHoverCardProps) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${x + 14}px, ${y + 14}px, 0)`,
      pointerEvents: "none",
      zIndex: 10,
      willChange: "transform",
    }}
  >
    <EdgeHoverCardBody
      linkTypeTitle={linkTypeTitle}
      sourceTitle={sourceTitle}
      targetTitle={targetTitle}
    />
  </div>
);
