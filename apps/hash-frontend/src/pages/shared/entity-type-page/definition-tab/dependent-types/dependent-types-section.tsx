import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  ButtonBase,
  Collapse,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  tableCellClasses,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useId, useState } from "react";

import { extractVersion } from "@blockprotocol/type-system";
import {
  EntityOrTypeIcon,
  FontAwesomeIcon,
  IconButton,
  WhiteCard,
} from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";

import { ArrowUpRightRegularIcon } from "../../../../../shared/icons/arrow-up-right-regular-icon";

import type { DependentTypeRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SxProps, Theme } from "@mui/material";
import type { ReactNode } from "react";

const formatVersions = (firstVersion: number, lastVersion: number) =>
  firstVersion === lastVersion
    ? `v${firstVersion}`
    : `v${firstVersion}–v${lastVersion}`;

const openColumnWidth = 56;

/** The same column widths for the table and for each row's nested range table, so their columns line up. */
const ColumnWidths = () => (
  <colgroup>
    <col />
    <col style={{ width: "20%" }} />
    <col style={{ width: "20%" }} />
    <col style={{ width: openColumnWidth }} />
  </colgroup>
);

const tableSx: SxProps<Theme> = ({ palette, typography }) => ({
  tableLayout: "fixed",
  [`.${tableCellClasses.root}`]: {
    ...typography.smallTextLabels,
    color: palette.gray[80],
    border: "none",
    px: 1.5,
    py: 0.5,
    height: 40,
  },
  [`.${tableCellClasses.head}`]: {
    fontWeight: 600,
    height: 42,
    borderBottom: `1px solid ${palette.gray[20]}`,
  },
});

const rangeRowSx: SxProps<Theme> = ({ palette }) => ({
  [`.${tableCellClasses.root}`]: { color: palette.gray[60] },
});

const OpenTypeButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <IconButton
    aria-label={label}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    size="small"
    unpadded
    sx={({ palette }) => ({ color: palette.gray[50] })}
  >
    <ArrowUpRightRegularIcon sx={{ fontSize: 14 }} />
  </IconButton>
);

const DependentTypeTableRow = ({
  row,
  isLink,
  onOpenType,
}: {
  row: DependentTypeRow;
  isLink: boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const { $id, title, icon, description } = row.entityType.schema;
  const latestVersion = extractVersion($id).toString();

  return (
    <>
      <TableRow
        onClick={() => setExpanded(!expanded)}
        sx={({ palette }) => ({
          cursor: "pointer",
          [`&:hover .${tableCellClasses.root}`]: {
            background: palette.gray[10],
          },
        })}
      >
        <TableCell>
          <ButtonBase
            aria-expanded={expanded}
            disableRipple
            sx={{ maxWidth: 1, justifyContent: "flex-start" }}
          >
            <FontAwesomeIcon
              icon={faChevronRight}
              sx={({ palette, transitions }) => ({
                color: palette.gray[50],
                fontSize: 12,
                mr: 1.5,
                transform: expanded ? "rotate(90deg)" : "none",
                transition: transitions.create("transform", { duration: 300 }),
              })}
            />
            <EntityOrTypeIcon
              entity={null}
              fontSize={14}
              fill={({ palette }) => palette.blue[70]}
              isLink={isLink}
              icon={icon}
            />
            <Tooltip title={description} describeChild>
              <Typography
                variant="smallTextLabels"
                fontWeight={600}
                ml={1}
                noWrap
              >
                {title}
                <Typography
                  component="span"
                  variant="microText"
                  color="gray.50"
                  ml={0.5}
                >
                  {` v${latestVersion}`}
                </Typography>
              </Typography>
            </Tooltip>
          </ButtonBase>
        </TableCell>
        <TableCell>
          {formatVersions(row.firstVersion, row.lastVersion)}
        </TableCell>
        <TableCell>
          {row.parentVersions.map((version) => `v${version}`).join(", ")}
        </TableCell>
        <TableCell>
          <OpenTypeButton
            label={`Open ${title} v${latestVersion}`}
            onClick={() => onOpenType($id)}
          />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell
          colSpan={4}
          sx={{ p: "0 !important", height: "auto !important" }}
        >
          <Collapse in={expanded} unmountOnExit>
            <Table sx={tableSx}>
              <ColumnWidths />
              <TableBody>
                {row.ranges.map((range) => (
                  <TableRow
                    key={`${range.firstVersion}-${range.parentVersion}`}
                    sx={rangeRowSx}
                  >
                    <TableCell />
                    <TableCell>
                      {formatVersions(range.firstVersion, range.lastVersion)}
                    </TableCell>
                    <TableCell>{`v${range.parentVersion}`}</TableCell>
                    <TableCell>
                      <OpenTypeButton
                        label={`Open ${title} v${range.lastVersion}`}
                        onClick={() => onOpenType(range.lastVersionId)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

export const DependentTypesSection = ({
  entityTypeTitle,
  rows,
  incomplete,
  error,
  isLinkType,
  onOpenType,
}: {
  entityTypeTitle: string;
  rows: DependentTypeRow[] | undefined;
  /** Whether a query stopped at the Graph's row limit, so rows or versions can be missing. */
  incomplete: boolean;
  error: Error | undefined;
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const failed = rows === undefined && !!error;
  const loading = rows === undefined && !error;

  const headingId = useId();

  const boldTitle: ReactNode = (
    <Box component="span" sx={{ fontWeight: "bold" }}>
      {entityTypeTitle}
    </Box>
  );

  const secondaryTextSx: SxProps<Theme> = ({ palette }) => ({
    color: palette.gray[70],
    fontSize: "var(--step--1)",
  });

  return (
    <Box
      component="section"
      aria-busy={loading}
      aria-labelledby={headingId}
      className={fluidFontClassName}
    >
      <Typography id={headingId} variant="h5">
        Types that extend {boldTitle}
      </Typography>
      <Typography sx={[secondaryTextSx, { mt: 0.5, mb: 2 }]}>
        Across all versions of {boldTitle}
      </Typography>
      {failed ? (
        <Typography sx={{ color: "error.main", fontSize: "var(--step--1)" }}>
          Couldn't load these types. Reload the page to try again.
        </Typography>
      ) : null}
      {loading ? <Skeleton variant="rounded" height={40} /> : null}
      {rows && incomplete ? (
        <Typography sx={[secondaryTextSx, { mb: 1 }]}>
          Some types or versions may be missing from this table.
        </Typography>
      ) : null}
      {rows?.length === 0 ? (
        <Box
          sx={({ palette }) => ({
            display: "inline-block",
            background: palette.gray[20],
            border: `1px solid ${palette.gray[30]}`,
            borderRadius: 1.5,
            color: palette.gray[80],
            fontSize: "var(--step--1)",
            px: 2,
            py: 1,
          })}
        >
          No types extend {boldTitle} yet.
        </Box>
      ) : null}
      {rows && rows.length > 0 ? (
        <WhiteCard sx={{ overflow: "visible" }}>
          <Box sx={{ p: 0.5 }}>
            <Table sx={tableSx}>
              <ColumnWidths />
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Versions</TableCell>
                  <TableCell>Extends {boldTitle}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <DependentTypeTableRow
                    key={row.entityType.schema.$id}
                    row={row}
                    isLink={isLinkType(row.entityType)}
                    onOpenType={onOpenType}
                  />
                ))}
              </TableBody>
            </Table>
          </Box>
        </WhiteCard>
      ) : null}
    </Box>
  );
};
