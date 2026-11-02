import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, ButtonBase } from "@mui/material";
import { useState } from "react";

import { extractVersion } from "@blockprotocol/type-system";
import { FontAwesomeIcon } from "@hashintel/design-system";

import {
  cellSx,
  formatVersionList,
  formatVersions,
  openColumnWidth,
  rowHeight,
  visuallyHidden,
} from "./dependent-types-table-layout";
import {
  HeaderRow,
  OpenTypeButton,
  TableCard,
  TreeLines,
  TypeLabel,
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

const gridTemplateColumns = "minmax(0, 1fr) 128px 196px";

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
    <Box
      sx={({ palette }) => ({
        position: "relative",
        height: rowHeight,
        borderRadius: 1,
        "&:hover": { background: palette.gray[10] },
      })}
    >
      <Box
        sx={({ palette }) => ({
          height: rowHeight,
          pr: `${openColumnWidth}px`,
          display: "grid",
          gridTemplateColumns,
          alignItems: "center",
          fontSize: 14,
          lineHeight: "18px",
          color: palette.gray[80],
        })}
      >
        <Box sx={cellSx} />
        <Box sx={cellSx}>{versions}</Box>
        <Box sx={cellSx}>
          <Box component="span" sx={visuallyHidden}>
            extends {parentTitle}{" "}
          </Box>
          {`v${range.parentVersion}`}
        </Box>
      </Box>
      <OpenTypeButton
        label={`Open ${title} v${range.lastVersion}, the highest version in ${versions}, which extends ${parentTitle} v${range.parentVersion}`}
        onClick={() => onOpenType(range.lastVersionId)}
      />
      <TreeLines last={last} />
    </Box>
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
  const version = Number.parseInt(extractVersion($id).toString(), 10);
  const versions = formatVersions(row.firstVersion, row.lastVersion);
  const parentVersions = formatVersionList(row.parentVersions);

  return (
    <VersionGraphTooltip
      row={row}
      parentTitle={parentTitle}
      parentLatestVersion={parentLatestVersion}
    >
      {({ rowProps, toggleProps, hide }) => (
        <Box>
          <Box
            ref={rowProps.ref}
            onMouseEnter={rowProps.onMouseEnter}
            onMouseLeave={rowProps.onMouseLeave}
            sx={({ palette }) => ({
              position: "relative",
              height: rowHeight,
              "&:hover .dependent-type-row-toggle": {
                background: palette.gray[10],
              },
            })}
          >
            <ButtonBase
              {...toggleProps}
              className="dependent-type-row-toggle"
              aria-expanded={expanded}
              aria-label={
                former
                  ? `${title}, former, versions ${versions}, extends ${parentTitle} ${parentVersions}`
                  : `${title} v${version}, versions ${versions}, extends ${parentTitle} ${parentVersions}`
              }
              disableRipple
              onClick={() => {
                hide();
                setExpanded(!expanded);
              }}
              sx={({ palette }) => ({
                width: 1,
                height: rowHeight,
                pr: `${openColumnWidth}px`,
                borderRadius: 1,
                display: "grid",
                gridTemplateColumns,
                alignItems: "center",
                justifyItems: "start",
                textAlign: "left",
                fontSize: 14,
                lineHeight: "18px",
                color: palette.gray[80],
                "&.Mui-focusVisible": {
                  outline: `2px solid ${palette.blue[70]}`,
                  outlineOffset: 2,
                },
              })}
            >
              <Box sx={{ ...cellSx, maxWidth: 1 }}>
                <TypeLabel
                  entityType={entityType}
                  former={former}
                  isLink={isLink}
                  version={version}
                />
              </Box>
              <Box sx={cellSx}>{versions}</Box>
              <Box sx={cellSx}>{parentVersions}</Box>
            </ButtonBase>
            <Box
              aria-hidden
              sx={({ palette }) => ({
                position: "absolute",
                left: 0,
                top: 0,
                width: 28,
                height: rowHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: palette.gray[60],
                pointerEvents: "none",
              })}
            >
              <FontAwesomeIcon
                icon={faChevronRight}
                sx={({ transitions }) => ({
                  fontSize: 10,
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: transitions.create("transform", {
                    duration: 300,
                  }),
                })}
              />
            </Box>
            <OpenTypeButton
              label={
                former
                  ? `Open ${title} v${version}, its highest version that extends ${parentTitle}`
                  : `Open ${title} v${version}`
              }
              onClick={() => onOpenType($id)}
            />
          </Box>
          {expanded ? (
            <Box role="group" aria-label={`Version ranges of ${title}`}>
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
      )}
    </VersionGraphTooltip>
  );
};

/** One row per dependent type, expandable into its version ranges. */
export const DependentTypesByTypeTable = ({
  entityTypeTitle,
  parentLatestVersion,
  rows,
  isLinkType,
  onOpenType,
}: {
  entityTypeTitle: string;
  parentLatestVersion: number;
  rows: DependentTypeRow[];
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => (
  <TableCard>
    <HeaderRow gridTemplateColumns={gridTemplateColumns}>
      <Box sx={cellSx}>Type</Box>
      <Box sx={cellSx}>Versions</Box>
      <Box sx={cellSx}>
        Extends{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          {entityTypeTitle}
        </Box>
      </Box>
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
