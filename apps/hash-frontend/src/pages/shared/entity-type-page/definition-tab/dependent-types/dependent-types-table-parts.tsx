import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, ButtonBase, Typography } from "@mui/material";

import { EntityOrTypeIcon, FontAwesomeIcon } from "@hashintel/design-system";

import { ArrowUpRightRegularIcon } from "../../../../../shared/icons/arrow-up-right-regular-icon";
import {
  firstCellSx,
  openColumnWidth,
  rowHeight,
  subgridRowSx,
  tableGridClassName,
  treeGutterWidth,
  treeLineOffset,
} from "./dependent-types-table-layout";

import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";
import type { SxProps, Theme } from "@mui/material";
import type { HTMLAttributes, KeyboardEvent, ReactNode, Ref } from "react";

/** The white card around a table, which scrolls sideways when the page is narrow, and the grid its rows share, with the open column added on the right. */
export const TableCard = ({
  gridTemplateColumns,
  labelledBy,
  children,
}: {
  gridTemplateColumns: string;
  labelledBy: string;
  children: ReactNode;
}) => (
  <Box
    sx={({ palette }) => ({
      background: palette.common.white,
      borderRadius: 1.5,
      boxShadow: "0px 1px 5px rgba(27, 33, 40, 0.07)",
      overflowX: "auto",
    })}
  >
    <Box
      role="table"
      aria-labelledby={labelledBy}
      className={tableGridClassName}
      sx={{
        display: "grid",
        gridTemplateColumns: `${gridTemplateColumns} ${openColumnWidth}px`,
        minWidth: 560,
        p: 0.5,
        boxSizing: "border-box",
      }}
    >
      {children}
    </Box>
  </Box>
);

export const HeaderRow = ({ children }: { children: ReactNode }) => (
  <Box
    role="row"
    sx={({ palette }) => ({
      ...subgridRowSx,
      alignItems: "center",
      height: 42,
      borderBottom: `1px solid ${palette.gray[20]}`,
      fontSize: 14,
      lineHeight: "18px",
      fontWeight: 600,
      color: palette.gray[90],
    })}
  >
    {children}
  </Box>
);

export const ColumnHeader = ({
  sx,
  children,
}: {
  sx?: SxProps<Theme>;
  children: ReactNode;
}) => (
  <Box role="columnheader" sx={sx}>
    {children}
  </Box>
);

export const Cell = ({
  sx,
  children,
}: {
  sx?: SxProps<Theme>;
  children?: ReactNode;
}) => (
  <Box role="cell" sx={sx}>
    {children}
  </Box>
);

export const OpenTypeButton = ({
  label,
  describedBy,
  onClick,
  onFocusVisible,
  onBlur,
}: {
  label: string;
  /** The id of a description on screen, such as an open tooltip. */
  describedBy?: string;
  onClick: () => void;
  onFocusVisible?: () => void;
  onBlur?: () => void;
}) => (
  <Box
    role="cell"
    sx={{
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 1,
      width: openColumnWidth,
      height: rowHeight,
    }}
  >
    <ButtonBase
      aria-label={label}
      aria-describedby={describedBy}
      disableRipple
      onClick={onClick}
      onFocusVisible={onFocusVisible}
      onBlur={onBlur}
      sx={({ palette }) => ({
        position: "absolute",
        right: 0,
        top: 0,
        width: openColumnWidth,
        height: rowHeight,
        borderRadius: 1,
        color: palette.gray[70],
        opacity: 0,
        '[role="row"]:hover &, &.Mui-focusVisible': { opacity: 1 },
        "@media (hover: none)": { opacity: 1 },
        "& .open-type-button-dot": {
          width: 28,
          height: 28,
          borderRadius: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        "&:hover .open-type-button-dot": {
          background: palette.gray[20],
          color: palette.blue[70],
        },
        "&.Mui-focusVisible": {
          outline: `2px solid ${palette.blue[70]}`,
          outlineOffset: -4,
        },
      })}
    >
      <span className="open-type-button-dot">
        <ArrowUpRightRegularIcon sx={{ fontSize: 14 }} />
      </span>
    </ButtonBase>
  </Box>
);

/** A row's cells on the table's grid, in the first grid row of the box around them, so that the chevron or the tree lines can share its second column. */
const rowGridSx = ({ palette }: Theme) => ({
  ...subgridRowSx,
  gridRow: 1,
  height: rowHeight,
  alignItems: "center",
  fontSize: 14,
  lineHeight: "18px",
  color: palette.gray[80],
});

/** The chevron at the start of an expandable row's second column, turned down while the row is expanded. */
const ExpandChevron = ({ expanded }: { expanded: boolean }) => (
  <Box
    aria-hidden
    sx={({ palette }) => ({
      gridArea: "1 / 2",
      width: treeLineOffset * 2,
      height: rowHeight,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: palette.gray[60],
    })}
  >
    <FontAwesomeIcon
      icon={faChevronRight}
      sx={({ transitions }) => ({
        fontSize: 10,
        transform: expanded ? "rotate(90deg)" : "none",
        transition: transitions.create("transform", { duration: 300 }),
      })}
    />
  </Box>
);

const rowSx = ({ palette }: Theme) => ({
  position: "relative",
  borderRadius: 1,
  "&:hover": { background: palette.gray[10] },
});

/** The vertical line and elbow that join a nested row to the row above it. */
const TreeLines = ({ last }: { last: boolean }) => (
  <Box
    aria-hidden
    sx={{ gridColumn: 2, gridRow: 1, position: "relative", height: rowHeight }}
  >
    <Box
      aria-hidden
      sx={({ palette }) => ({
        position: "absolute",
        left: treeLineOffset,
        top: 0,
        width: "1px",
        height: last ? 21 : rowHeight,
        background: palette.gray[40],
        pointerEvents: "none",
      })}
    />
    <Box
      aria-hidden
      sx={({ palette }) => ({
        position: "absolute",
        left: treeLineOffset,
        top: 20,
        width: treeGutterWidth - treeLineOffset,
        height: "1px",
        background: palette.gray[40],
        pointerEvents: "none",
      })}
    />
  </Box>
);

/** A row inside an expanded row: its cells, its open button, and the tree lines that join it to the row above. */
export const NestedRow = ({
  last,
  openButton,
  children,
}: {
  /** Whether this is the expanded row's last nested row, where the tree line ends. */
  last: boolean;
  openButton: ReactNode;
  children: ReactNode;
}) => (
  <Box role="row" sx={[{ ...subgridRowSx, height: rowHeight }, rowSx]}>
    <Box sx={rowGridSx}>{children}</Box>
    {openButton}
    <TreeLines last={last} />
  </Box>
);

type TypeLabelProps = {
  entityType: EntityTypeWithMetadata;
  former: boolean;
  isLink: boolean;
  /** The version shown after the title of a current type. */
  version: number;
};

/** A type's icon, title, and its latest version or a "Former" tag. */
export const TypeLabel = ({
  entityType,
  former,
  isLink,
  version,
}: TypeLabelProps) => (
  <Box
    component="span"
    sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
  >
    <EntityOrTypeIcon
      entity={null}
      fontSize={14}
      fill={({ palette }) => (former ? palette.gray[50] : palette.blue[70])}
      isLink={isLink}
      icon={entityType.schema.icon}
    />
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Typography
        component="span"
        noWrap
        sx={({ palette }) => ({
          fontSize: "inherit",
          fontWeight: 600,
          color: former ? palette.gray[80] : palette.black,
        })}
      >
        {entityType.schema.title}
      </Typography>
      {former ? (
        <Box
          component="span"
          sx={({ palette }) => ({
            ml: 0.5,
            px: 0.75,
            py: "1px",
            borderRadius: 1,
            background: palette.gray[20],
            color: palette.gray[80],
            fontSize: 12,
            lineHeight: "16px",
            fontWeight: 500,
          })}
        >
          Former
        </Box>
      ) : (
        <Box
          component="span"
          sx={({ palette }) => ({ fontSize: 13, color: palette.gray[70] })}
        >
          {`v${version}`}
        </Box>
      )}
    </Box>
  </Box>
);

type RowToggleProps = {
  "aria-describedby"?: string;
  onFocusVisible?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

/** The button in an expandable row's first cell, whose pseudo-element covers the row, so that a click anywhere on the row toggles it. */
const RowToggle = ({
  label,
  expanded,
  onToggle,
  toggleProps: { onFocusVisible, ...toggleProps },
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  toggleProps: RowToggleProps;
  children: ReactNode;
}) => (
  <Box
    component="button"
    type="button"
    {...toggleProps}
    aria-label={label}
    aria-expanded={expanded}
    onClick={onToggle}
    onFocus={(event) => {
      if (event.currentTarget.matches(":focus-visible")) {
        onFocusVisible?.();
      }
    }}
    sx={({ palette }) => ({
      display: "flex",
      width: 1,
      m: 0,
      p: 0,
      border: 0,
      background: "none",
      color: "inherit",
      font: "inherit",
      lineHeight: "inherit",
      letterSpacing: "inherit",
      textAlign: "left",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: 1,
      },
      "&:focus-visible": { outline: "none" },
      "&:focus-visible::after": {
        outline: `2px solid ${palette.blue[70]}`,
        outlineOffset: 2,
      },
    })}
  >
    {children}
  </Box>
);

/** A type's row that expands into nested rows: the toggle with the type's label, the other cells, the open button, and the chevron that shows whether the row is expanded. */
export const ExpandableRow = ({
  type,
  expanded,
  onToggle,
  toggleProps = {},
  openButton,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>;
  type: TypeLabelProps;
  expanded: boolean;
  onToggle: () => void;
  toggleProps?: RowToggleProps;
  openButton: ReactNode;
}) => {
  const { title } = type.entityType.schema;

  return (
    <Box {...props} role="row" sx={[rowGridSx, rowSx, { userSelect: "none" }]}>
      <Cell sx={{ ...firstCellSx, maxWidth: 1 }}>
        <RowToggle
          label={type.former ? `${title}, former` : `${title} v${type.version}`}
          expanded={expanded}
          onToggle={onToggle}
          toggleProps={toggleProps}
        >
          <TypeLabel {...type} />
        </RowToggle>
      </Cell>
      {children}
      {openButton}
      <ExpandChevron expanded={expanded} />
    </Box>
  );
};
