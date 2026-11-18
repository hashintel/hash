import { Box, Tooltip } from "@mui/material";
import { useId, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import {
  cellSx,
  firstCellSx,
  formatVersions,
  subgridRowSx,
  tableGridClassName,
  treeCellSx,
} from "./dependent-types-table-layout";
import {
  Cell,
  ColumnHeader,
  ExpandableRow,
  HeaderRow,
  NestedRow,
  OpenTypeButton,
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
  const descriptionId = useId();

  const { entityType, former } = row;
  const { title, description } = entityType.schema;
  const descriptionShown = !!description && (hovered || focused);

  return (
    <NestedRow
      last={last}
      openButton={
        <OpenTypeButton
          label={`Open ${title} v${highestVersion}, the highest version that extends ${parentLabel}`}
          describedBy={descriptionShown ? descriptionId : undefined}
          onClick={() => onOpenType(highestVersionId)}
          onFocusVisible={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      }
    >
      <Cell sx={firstCellSx} />
      <Cell sx={{ ...treeCellSx, maxWidth: 1, display: "flex" }}>
        <Tooltip
          id={descriptionId}
          title={description}
          describeChild
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
      </Cell>
      <Cell sx={cellSx}>
        {ranges
          .map((range) => formatVersions(range.firstVersion, range.lastVersion))
          .join(", ")}
      </Cell>
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
      <ExpandableRow
        type={{
          entityType: parent,
          former: false,
          isLink: isLinkType(parent),
          version: parentVersion,
        }}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        openButton={
          <OpenTypeButton
            label={`Open ${parentLabel}`}
            onClick={() =>
              onOpenType(
                `${extractBaseUrl(parent.schema.$id)}v/${parentVersion}` as VersionedUrl,
              )
            }
          />
        }
      >
        <Cell
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
        </Cell>
        <Cell />
      </ExpandableRow>
      {expanded ? (
        <Box sx={subgridRowSx}>
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
  labelledBy,
  entityType,
  parentVersionRows,
  isLinkType,
  onOpenType,
}: {
  labelledBy: string;
  /** The type on the page, whose versions are the rows. */
  entityType: EntityTypeWithMetadata;
  parentVersionRows: ParentVersionRow[];
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => (
  <TableCard gridTemplateColumns={gridTemplateColumns} labelledBy={labelledBy}>
    <HeaderRow>
      <ColumnHeader
        sx={{ ...firstCellSx, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        <Box component="span" sx={{ fontWeight: 700 }}>
          {entityType.schema.title}
        </Box>{" "}
        version
      </ColumnHeader>
      <ColumnHeader sx={treeCellSx}>Extended by</ColumnHeader>
      <ColumnHeader
        sx={{
          ...cellSx,
          // Only an expanded row puts values in this column.
          [`.${tableGridClassName}:not(:has([aria-expanded="true"])) &`]: {
            visibility: "hidden",
          },
        }}
      >
        Versions
      </ColumnHeader>
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
