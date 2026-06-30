import { Box, Divider, Typography } from "@mui/material";
import { keyframes } from "@mui/system";
import { memo, useMemo } from "react";

import { EntityOrTypeIcon } from "@hashintel/design-system";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";

import type { VersionedUrl } from "@blockprotocol/type-system";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";

interface HighwaySummaryCardProps {
  /** The lane's single link type (a lane is single-type); null for a multi-type rollup. */
  readonly typeId: VersionedUrl | null;
  /** Fallback display label, used for a rollup (no single type to resolve from the schema). */
  readonly typeLabel: string;
  /** Total number of links the highway aggregates. */
  readonly count: number;
  /** Net direction of the bundled links, relative to the highway's source -> target. */
  readonly direction: "forward" | "reverse" | "both";
  /** The closed type schema the main thread already holds -- resolves the icon + title. */
  readonly closedMultiEntityTypesRootMap:
    | ClosedMultiEntityTypesRootMap
    | undefined;
  /** Cursor position in the container's local pixels. */
  readonly x: number;
  readonly y: number;
}

const rise = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/** A short human phrase for a bundle's net direction. */
function directionLabel(
  direction: HighwaySummaryCardProps["direction"],
): string {
  switch (direction) {
    case "both":
      return "Bidirectional";
    case "forward":
      return "Outgoing";
    case "reverse":
      return "Incoming";
  }
}

type HighwaySummaryBodyProps = Omit<HighwaySummaryCardProps, "x" | "y">;

/**
 * The card's visual body, memoized on its content (NOT the cursor position), so a mouse-move that
 * re-positions the wrapper every frame never re-lays out this MUI tree. Resolves the link type's
 * icon + title from the closed type schema the SAME way {@link EntityHoverCard} does (the
 * hierarchy-walking {@link getDisplayFieldsForClosedEntityType}), and follows the SAME icon +
 * title + subtitle + stat discipline, so the two hover surfaces read as one language.
 */
const HighwaySummaryBodyComponent = ({
  typeId,
  typeLabel,
  count,
  direction,
  closedMultiEntityTypesRootMap,
}: HighwaySummaryBodyProps) => {
  const typeFields = useMemo(() => {
    if (!typeId || !closedMultiEntityTypesRootMap) {
      return null;
    }
    try {
      const closedType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        [typeId],
      );
      const { icon, isLink } = getDisplayFieldsForClosedEntityType(closedType);
      const leaf = closedType.allOf[0];
      // A link type reads differently per direction: the forward title ("Has Member") vs the
      // inverse title ("Member Of"). A lane is single-direction, so pick the matching one.
      return {
        icon,
        isLink,
        title: leaf.title,
        inverseTitle: leaf.inverse?.title,
      };
    } catch {
      return null;
    }
  }, [typeId, closedMultiEntityTypesRootMap]);

  const title = typeFields
    ? direction === "reverse"
      ? (typeFields.inverseTitle ?? typeFields.title)
      : typeFields.title
    : typeLabel || "Links";

  return (
    <Box
      sx={({ palette, boxShadows }) => ({
        minWidth: 188,
        maxWidth: 280,
        bgcolor: palette.common.white,
        border: `1px solid ${palette.gray[20]}`,
        borderRadius: "8px",
        boxShadow: boxShadows.md,
        overflow: "hidden",
        animation: `${rise} 130ms cubic-bezier(0.22, 1, 0.36, 1)`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      })}
    >
      {/* Identity: the link type's icon anchors the type + direction, mirroring the entity card. */}
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
            icon={typeFields?.icon ?? null}
            isLink={typeFields?.isLink ?? true}
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
            {title}
          </Typography>
          <Typography
            variant="microText"
            sx={{
              display: "block",
              mt: 0.25,
              color: ({ palette }) => palette.gray[70],
            }}
          >
            {directionLabel(direction)}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />

      {/* Stat: how many links this ribbon aggregates -- the number a click expands into a table. */}
      <Box sx={{ px: 1.75, py: 1 }}>
        <Typography
          variant="microText"
          sx={{ color: ({ palette }) => palette.gray[70] }}
        >
          <Box
            component="span"
            sx={{ fontWeight: 600, color: ({ palette }) => palette.gray[90] }}
          >
            {count.toLocaleString()}
          </Box>{" "}
          {count === 1 ? "link" : "links"} bundled
        </Typography>
      </Box>

      <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />

      <Box sx={{ px: 1.75, py: 0.9, bgcolor: "gray.10" }}>
        <Typography
          variant="microText"
          sx={{ fontWeight: 600, color: "blue.70" }}
        >
          Click to view links
        </Typography>
      </Box>
    </Box>
  );
};

const HighwaySummaryBody = memo(HighwaySummaryBodyComponent);

/**
 * Hover summary for an aggregated highway: the link type(s) it bundles, the net direction, and how
 * many links (a click opens the full table). The wrapper positions the card via a GPU transform --
 * cheap per cursor-move frame -- while {@link HighwaySummaryBody} renders the contents, memoized so
 * the per-frame move never re-lays them out. Click-through so it never eats a hover.
 */
export const HighwaySummaryCard = ({
  typeId,
  typeLabel,
  count,
  direction,
  closedMultiEntityTypesRootMap,
  x,
  y,
}: HighwaySummaryCardProps) => (
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
    <HighwaySummaryBody
      typeId={typeId}
      typeLabel={typeLabel}
      count={count}
      direction={direction}
      closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
    />
  </div>
);
