import { Box, Tooltip } from "@mui/material";
import { useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import {
  cellSx,
  firstCellSx,
  formatVersions,
  subgridRowSx,
  tableGridClassName,
  toggleRowSx,
  treeCellSx,
} from "./dependent-types-table-layout";
import {
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

const gridTemplateColumns =
  "fit-content(240px) fit-content(600px) max-content minmax(0, 1fr)";

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
      <Box sx={cellSx}>
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
    <Box sx={subgridRowSx}>
      <Box sx={toggleRowSx}>
        <RowToggle
          expanded={expanded}
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
      </Box>
      {expanded ? (
        <Box
          sx={subgridRowSx}
          role="group"
          aria-label={`Types that extend ${parentLabel}`}
        >
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
  <TableCard gridTemplateColumns={gridTemplateColumns}>
    <HeaderRow>
      <Box
        sx={{ ...firstCellSx, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        <Box component="span" sx={{ fontWeight: 700 }}>
          {entityType.schema.title}
        </Box>{" "}
        version
      </Box>
      <Box sx={treeCellSx}>Extended by</Box>
      <Box
        sx={{
          ...cellSx,
          // Only an expanded row puts values in this column.
          [`.${tableGridClassName}:not(:has([role="group"])) &`]: {
            visibility: "hidden",
          },
        }}
      >
        Versions
      </Box>
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
);
