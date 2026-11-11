import { Box, Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import {
  cellSx,
  firstCellSx,
  formatVersions,
  toggleRowSx,
  treeCellSx,
} from "./dependent-types-table-layout";
import {
  ExpandChevron,
  HeaderRow,
  NestedRow,
  OpenTypeButton,
  RowToggle,
  TableCard,
  TypeLabel,
} from "./dependent-types-table-parts";

import type { ParentVersionRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const versionColumnWidth = 240;

const gridTemplateColumns = `${versionColumnWidth}px minmax(0, 400px) 128px minmax(0, 1fr)`;

const innerCellSx = { ...cellSx, pl: 1.5 } as const;

const countLabel = (count: number) =>
  count === 1 ? "1 type" : `${count} types`;

const DependentTypeSubRow = ({
  type: { row, ranges, highestVersion, highestVersionId },
  parentLabel,
  last,
  isLink,
  onOpenType,
}: {
  type: ParentVersionRow["types"][number];
  parentLabel: string;
  last: boolean;
  isLink: boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const { entityType, former } = row;
  const { title, description } = entityType.schema;

  return (
    <NestedRow
      gridTemplateColumns={gridTemplateColumns}
      treeLeft={versionColumnWidth}
      last={last}
      openButton={
        <OpenTypeButton
          label={`Open ${title} v${highestVersion}, the highest version that extends ${parentLabel}`}
          description={description}
          onClick={() => onOpenType(highestVersionId)}
          onFocusVisible={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      }
    >
      <Box sx={firstCellSx} />
      <Box sx={{ ...treeCellSx, maxWidth: 1, display: "flex" }}>
        <Tooltip
          title={description}
          open={hovered || focused}
          onOpen={() => setHovered(true)}
          onClose={() => setHovered(false)}
        >
          <Box component="span" sx={{ display: "flex", minWidth: 0 }}>
            <TypeLabel
              entityType={entityType}
              former={former}
              isLink={isLink}
              version={row.version}
            />
          </Box>
        </Tooltip>
      </Box>
      <Box sx={innerCellSx}>
        {ranges
          .map((range) => formatVersions(range.firstVersion, range.lastVersion))
          .join(", ")}
      </Box>
    </NestedRow>
  );
};

const ParentVersionTableRow = ({
  parentVersionRow: { parentVersion, types },
  parent,
  isLinkType,
  onOpenType,
}: {
  parentVersionRow: ParentVersionRow;
  parent: EntityTypeWithMetadata;
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const parentTitle = parent.schema.title;
  const parentLabel = `${parentTitle} v${parentVersion}`;
  const count = countLabel(types.length);
  const titles = types.map(({ row }) => row.entityType.schema.title).join(", ");

  return (
    <Box>
      <Box sx={toggleRowSx}>
        <RowToggle
          gridTemplateColumns={gridTemplateColumns}
          aria-expanded={expanded}
          aria-label={`${parentLabel}, extended by ${count}: ${titles}`}
          onClick={() => setExpanded(!expanded)}
        >
          <Box sx={{ ...firstCellSx, maxWidth: 1 }}>
            <TypeLabel
              entityType={parent}
              former={false}
              isLink={isLinkType(parent)}
              version={parentVersion}
            />
          </Box>
          <Box
            sx={{
              ...treeCellSx,
              gridColumn: "2 / -1",
              maxWidth: 1,
              display: "flex",
              alignItems: "baseline",
              gap: 1.5,
            }}
          >
            <Box
              component="span"
              sx={({ palette }) => ({
                flex: "none",
                minWidth: 52,
                fontSize: 13,
                color: palette.gray[70],
              })}
            >
              {count}
            </Box>
            <Box
              component="span"
              sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {titles}
            </Box>
          </Box>
        </RowToggle>
        <OpenTypeButton
          label={`Open ${parentLabel}`}
          onClick={() =>
            onOpenType(
              `${extractBaseUrl(parent.schema.$id)}v/${parentVersion}` as VersionedUrl,
            )
          }
        />
        <ExpandChevron expanded={expanded} left={versionColumnWidth} />
      </Box>
      {expanded ? (
        <Box role="group" aria-label={`Types that extend ${parentLabel}`}>
          {types.map((type, index) => (
            <DependentTypeSubRow
              key={type.row.entityType.schema.$id}
              type={type}
              parentLabel={parentLabel}
              last={index === types.length - 1}
              isLink={isLinkType(type.row.entityType)}
              onOpenType={onOpenType}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
};

/** One row per version of the parent, newest first, expandable into the types that extend it. */
export const DependentTypesByVersionTable = ({
  entityType,
  parentVersionRows,
  isLinkType,
  onOpenType,
}: {
  /** The type on the page, whose versions are the rows. */
  entityType: EntityTypeWithMetadata;
  parentVersionRows: ParentVersionRow[];
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => (
  <>
    <TableCard>
      <HeaderRow gridTemplateColumns={gridTemplateColumns}>
        <Box
          sx={{ ...firstCellSx, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {entityType.schema.title}
          </Box>{" "}
          version
        </Box>
        <Box sx={treeCellSx}>Extended by</Box>
        <Box sx={innerCellSx}>Versions</Box>
      </HeaderRow>
      {parentVersionRows.map((parentVersionRow) => (
        <ParentVersionTableRow
          key={parentVersionRow.parentVersion}
          parentVersionRow={parentVersionRow}
          parent={entityType}
          isLinkType={isLinkType}
          onOpenType={onOpenType}
        />
      ))}
    </TableCard>
    <Typography
      sx={({ palette }) => ({
        mt: 1.5,
        fontSize: 13,
        lineHeight: "18px",
        color: palette.gray[70],
      })}
    >
      In this layout a type can appear under several{" "}
      <Box
        component="span"
        sx={({ palette }) => ({ fontWeight: 600, color: palette.gray[80] })}
      >
        {entityType.schema.title}
      </Box>{" "}
      versions. In the “By type” layout each type appears once.
    </Typography>
  </>
);
