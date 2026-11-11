import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, ButtonBase, Typography } from "@mui/material";
import { useId } from "react";

import { EntityOrTypeIcon, FontAwesomeIcon } from "@hashintel/design-system";

import { ArrowUpRightRegularIcon } from "../../../../../shared/icons/arrow-up-right-regular-icon";
import {
  openColumnWidth,
  rowHeight,
  rowToggleClassName,
  subgridRowSx,
  tableGridClassName,
  treeGutterWidth,
  treeLineOffset,
  visuallyHidden,
} from "./dependent-types-table-layout";

import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";
import type { ButtonBaseProps, Theme } from "@mui/material";
import type { ReactNode } from "react";

/** The white card around a table, which scrolls sideways when the page is narrow, and the grid its rows share, with the open column added on the right. */
export const TableCard = ({
  gridTemplateColumns,
  children,
}: {
  gridTemplateColumns: string;
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

export const OpenTypeButton = ({
  label,
  description,
  onClick,
  onFocusVisible,
  onBlur,
}: {
  label: string;
  /** Read out after the label, for a description shown elsewhere only on hover. */
  description?: string;
  onClick: () => void;
  onFocusVisible?: () => void;
  onBlur?: () => void;
}) => {
  const descriptionId = useId();

  return (
    <ButtonBase
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
      disableRipple
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
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
        "*:hover > &, &.Mui-focusVisible": { opacity: 1 },
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
      {description ? (
        <Box component="span" id={descriptionId} sx={visuallyHidden}>
          {description}
        </Box>
      ) : null}
    </ButtonBase>
  );
};

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

/** The button that spans an expandable row's cells and expands or collapses it. */
export const RowToggle = (
  props: Omit<ButtonBaseProps, "className" | "disableRipple" | "sx">,
) => (
  <ButtonBase
    {...props}
    className={rowToggleClassName}
    disableRipple
    sx={[
      rowGridSx,
      ({ palette }) => ({
        borderRadius: 1,
        justifyItems: "start",
        textAlign: "left",
        "&.Mui-focusVisible": {
          outline: `2px solid ${palette.blue[70]}`,
          outlineOffset: 2,
        },
      }),
    ]}
  />
);

/** The chevron at the start of an expandable row's second column, turned down while the row is expanded. */
export const ExpandChevron = ({ expanded }: { expanded: boolean }) => (
  <Box
    aria-hidden
    sx={({ palette }) => ({
      gridColumn: 2,
      gridRow: 1,
      width: treeLineOffset * 2,
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
        transition: transitions.create("transform", { duration: 300 }),
      })}
    />
  </Box>
);

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
  <Box
    sx={({ palette }) => ({
      ...subgridRowSx,
      position: "relative",
      height: rowHeight,
      borderRadius: 1,
      "&:hover": { background: palette.gray[10] },
    })}
  >
    <Box sx={rowGridSx}>{children}</Box>
    {openButton}
    <TreeLines last={last} />
  </Box>
);

/** A type's icon, title, and its latest version or a "Former" tag. */
export const TypeLabel = ({
  entityType,
  former,
  isLink,
  version,
}: {
  entityType: EntityTypeWithMetadata;
  former: boolean;
  isLink: boolean;
  /** The version shown after the title of a current type. */
  version: number;
}) => (
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
