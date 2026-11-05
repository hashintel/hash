import { Box, Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import {
  cellSx,
  formatVersions,
  toggleRowSx,
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

const gridTemplateColumns = "240px minmax(0, 1fr) 128px";

const innerCellSx = { ...cellSx, pl: 1.5 } as const;

const countLabel = (count: number) =>
  count === 0 ? "No types" : count === 1 ? "1 type" : `${count} types`;

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
      <Box sx={cellSx} />
      <Box sx={{ ...innerCellSx, maxWidth: 1, display: "flex" }}>
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
  const empty = types.length === 0;
  const count = countLabel(types.length);
  const titles = types.map(({ row }) => row.entityType.schema.title).join(", ");

  return (
    <Box>
      <Box sx={toggleRowSx}>
        <RowToggle
          gridTemplateColumns={gridTemplateColumns}
          aria-expanded={empty ? undefined : expanded}
          aria-label={
            empty
              ? `${parentLabel}, extended by no types`
              : `${parentLabel}, extended by ${count}: ${titles}`
          }
          disabled={empty}
          onClick={() => setExpanded(!expanded)}
        >
          <Box sx={{ ...cellSx, maxWidth: 1 }}>
            <TypeLabel
              entityType={parent}
              former={false}
              isLink={isLinkType(parent)}
              version={parentVersion}
            />
          </Box>
          <Box
            sx={{
              ...innerCellSx,
              gridColumn: "2 / 4",
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
        {empty ? null : <ExpandChevron expanded={expanded} />}
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
        <Box sx={{ ...cellSx, overflow: "hidden", textOverflow: "ellipsis" }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {entityType.schema.title}
          </Box>{" "}
          version
        </Box>
        <Box sx={innerCellSx}>Extended by</Box>
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
      versions. In the “By child type” layout each type appears once.
    </Typography>
  </>
);
