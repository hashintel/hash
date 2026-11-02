import { Box, ButtonBase, Typography } from "@mui/material";
import { useId } from "react";

import { EntityOrTypeIcon } from "@hashintel/design-system";

import { ArrowUpRightRegularIcon } from "../../../../../shared/icons/arrow-up-right-regular-icon";
import {
  openColumnWidth,
  rowHeight,
  visuallyHidden,
} from "./dependent-types-table-layout";

import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";
import type { ReactNode } from "react";

/** The white card around a table, which scrolls sideways when the page is narrow. */
export const TableCard = ({ children }: { children: ReactNode }) => (
  <Box
    sx={({ palette }) => ({
      background: palette.common.white,
      borderRadius: 1.5,
      boxShadow: "0px 1px 5px rgba(27, 33, 40, 0.07)",
      overflowX: "auto",
    })}
  >
    <Box sx={{ minWidth: 560, p: 0.5, boxSizing: "border-box" }}>
      {children}
    </Box>
  </Box>
);

export const HeaderRow = ({
  gridTemplateColumns,
  children,
}: {
  gridTemplateColumns: string;
  children: ReactNode;
}) => (
  <Box
    sx={({ palette }) => ({
      display: "grid",
      gridTemplateColumns,
      alignItems: "center",
      height: 42,
      pr: `${openColumnWidth}px`,
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

/** The vertical line and elbow that join a nested row to the row above it. */
export const TreeLines = ({ last }: { last: boolean }) => (
  <>
    <Box
      aria-hidden
      sx={({ palette }) => ({
        position: "absolute",
        left: 14,
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
        left: 14,
        top: 20,
        width: 11,
        height: "1px",
        background: palette.gray[40],
        pointerEvents: "none",
      })}
    />
  </>
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
