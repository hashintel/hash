import { IconButton } from "@hashintel/design-system";
import type { ValueMetadata } from "@local/hash-graph-client/api";
import type { EntityId, PropertyValue } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import {
  Box,
  Stack,
  type SxProps,
  TableCell,
  type Theme,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";

import { CircleInfoIcon } from "../../../../../../shared/icons/circle-info-icon";
import { ValueChip } from "../../../../../shared/value-chip";
import { defaultCellSx } from "../../../../../shared/virtualized-table";
import { SourcesPopover } from "../shared/sources-popover";

export const typographySx = {
  color: ({ palette }) => palette.common.black,
  fontSize: 12,
  fontWeight: 500,
} as const satisfies SxProps<Theme>;

export const cellSx = {
  ...defaultCellSx,
  ...typographySx,
  background: "white",
  "&:not(:last-child)": {
    borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
  },
} as const satisfies SxProps<Theme>;

export const NoValueCell = ({
  columnId,
  researchOngoing,
}: {
  columnId: string;
  researchOngoing: boolean;
}) => {
  if (!researchOngoing) {
    return (
      <TableCell
        key={columnId}
        sx={{ ...cellSx, color: ({ palette }) => palette.gray[50] }}
      >
        –
      </TableCell>
    );
  }

  return (
    <TableCell
      key={columnId}
      sx={({ palette }) => ({
        ...cellSx,
        background: palette.blue[15],
        color: palette.blue[70],
      })}
    >
      <Stack direction="row" alignItems="center">
        <Box
          sx={{
            background: ({ palette }) => palette.blue[70],
            height: 6,
            width: 6,
            borderRadius: "50%",
            mr: 1,
          }}
        />
        Researching...
      </Stack>
    </TableCell>
  );
};

export const LinkedEntitiesCell = ({
  linkedEntities,
  onEntityClick,
}: {
  linkedEntities: {
    linkEntityId: EntityId;
    targetEntityId: EntityId;
    targetEntityLabel: string;
  }[];
  onEntityClick: (entityId: EntityId) => void;
}) => {
  return (
    <TableCell sx={cellSx}>
      <Stack direction="row" spacing={1}>
        {linkedEntities.map(({ linkEntityId, targetEntityLabel }) => (
          <Box
            key={linkEntityId}
            component="button"
            onClick={() => onEntityClick(linkEntityId)}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              p: 0,
              textAlign: "left",
            }}
          >
            <ValueChip
              sx={{
                ...typographySx,
                color: ({ palette }) => palette.blue[70],
              }}
            >
              {targetEntityLabel}
            </ValueChip>
          </Box>
        ))}
      </Stack>
    </TableCell>
  );
};

export const PropertyValueCell = ({
  metadata,
  value,
}: {
  metadata?: ValueMetadata;
  value: PropertyValue;
}) => {
  const [showMetadataTooltip, setShowMetadataTooltip] = useState(false);

  const stringifiedValue = stringifyPropertyValue(value);
  const cellRef = useRef<HTMLDivElement>(null);

  const buttonId = generateUuid();

  return (
    <TableCell sx={{ ...cellSx, maxWidth: 700 }} ref={cellRef}>
      <Stack direction="row" alignItems="center">
        <Typography
          sx={{
            ...typographySx,
            lineHeight: 1,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {stringifiedValue}
        </Typography>
        <IconButton
          aria-describedby={buttonId}
          onClick={() => setShowMetadataTooltip(true)}
          sx={{ ml: 1 }}
        >
          <CircleInfoIcon
            sx={{
              fontSize: 12,
              fill: ({ palette }) => palette.gray[40],
            }}
          />
        </IconButton>
      </Stack>
      <SourcesPopover
        buttonId={buttonId}
        open={showMetadataTooltip}
        cellRef={cellRef}
        onClose={() => setShowMetadataTooltip(false)}
        sources={metadata?.provenance?.sources ?? []}
      />
    </TableCell>
  );
};
