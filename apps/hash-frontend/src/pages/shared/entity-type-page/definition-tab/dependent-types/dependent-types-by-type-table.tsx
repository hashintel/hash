import { Box } from "@mui/material";
import { useState } from "react";

import {
  cellSx,
  firstCellSx,
  formatVersionList,
  formatVersions,
  subgridRowSx,
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
} from "./dependent-types-table-parts";
import { VersionGraphTooltip } from "./version-graph-tooltip";

import type {
  DependentTypeRow,
  DependentTypeVersionRange,
} from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Theme } from "@mui/material";

const gridTemplateColumns =
  "fit-content(320px) max-content max-content minmax(0, 1fr)";

/** A nested row's text, lighter than its row's so that a range reads apart from the type's versions. */
const nestedTextSx = ({ palette }: Theme) => ({ color: palette.gray[70] });

const RangeRow = ({
  range,
  title,
  parentTitle,
  last,
  onOpenType,
}: {
  range: DependentTypeVersionRange;
  title: string;
  parentTitle: string;
  last: boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const versions = formatVersions(range.firstVersion, range.lastVersion);

  return (
    <NestedRow
      last={last}
      openButton={
        <OpenTypeButton
          label={`Open ${title} v${range.lastVersion}, the highest version in ${versions}, which extends ${parentTitle} v${range.parentVersion}`}
          onClick={() => onOpenType(range.lastVersionId)}
        />
      }
    >
      <Cell sx={firstCellSx} />
      <Cell sx={[treeCellSx, nestedTextSx]}>{versions}</Cell>
      <Cell sx={[cellSx, nestedTextSx]}>{`v${range.parentVersion}`}</Cell>
    </NestedRow>
  );
};

const DependentTypeTableRow = ({
  row,
  parentTitle,
  parentLatestVersion,
  isLink,
  onOpenType,
}: {
  row: DependentTypeRow;
  parentTitle: string;
  parentLatestVersion: number;
  isLink: boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const { entityType, former } = row;
  const { $id, title } = entityType.schema;
  const { version } = row;
  const versions = formatVersions(row.firstVersion, row.lastVersion);
  const parentVersions = formatVersionList(row.parentVersions);

  return (
    <Box sx={subgridRowSx}>
      <VersionGraphTooltip
        row={row}
        parentTitle={parentTitle}
        parentLatestVersion={parentLatestVersion}
        expanded={expanded}
      >
        {({ rowRef, toggleProps, hide }) => (
          <ExpandableRow
            ref={rowRef}
            type={{ entityType, former, isLink, version }}
            expanded={expanded}
            onToggle={() => {
              hide();
              setExpanded(!expanded);
            }}
            toggleProps={toggleProps}
            openButton={
              <OpenTypeButton
                label={
                  former
                    ? `Open ${title} v${version}, its highest version that extends ${parentTitle}`
                    : `Open ${title} v${version}`
                }
                onClick={() => onOpenType($id)}
              />
            }
          >
            <Cell sx={treeCellSx}>{versions}</Cell>
            <Cell sx={cellSx}>{parentVersions}</Cell>
          </ExpandableRow>
        )}
      </VersionGraphTooltip>
      {expanded ? (
        <Box sx={subgridRowSx}>
          {row.ranges.map((range, index) => (
            <RangeRow
              key={`${range.firstVersion}-${range.parentVersion}`}
              range={range}
              title={title}
              parentTitle={parentTitle}
              last={index === row.ranges.length - 1}
              onOpenType={onOpenType}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
};

/** One row per dependent type, expandable into its version ranges. */
export const DependentTypesByTypeTable = ({
  labelledBy,
  entityTypeTitle,
  parentLatestVersion,
  rows,
  isLinkType,
  onOpenType,
}: {
  labelledBy: string;
  entityTypeTitle: string;
  parentLatestVersion: number;
  rows: DependentTypeRow[];
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => (
  <TableCard gridTemplateColumns={gridTemplateColumns} labelledBy={labelledBy}>
    <HeaderRow>
      <ColumnHeader sx={firstCellSx}>Type</ColumnHeader>
      <ColumnHeader sx={treeCellSx}>Versions</ColumnHeader>
      <ColumnHeader sx={cellSx}>
        Extends{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          {entityTypeTitle}
        </Box>
      </ColumnHeader>
    </HeaderRow>
    {rows.map((row) => (
      <DependentTypeTableRow
        key={row.entityType.schema.$id}
        row={row}
        parentTitle={entityTypeTitle}
        parentLatestVersion={parentLatestVersion}
        isLink={isLinkType(row.entityType)}
        onOpenType={onOpenType}
      />
    ))}
  </TableCard>
);
