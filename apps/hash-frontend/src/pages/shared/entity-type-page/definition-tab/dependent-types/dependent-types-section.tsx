import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  ToggleButton,
  toggleButtonClasses,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useId, useState } from "react";

import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";

import { getParentVersionRows } from "./dependent-type-rows";
import { DependentTypesByTypeTable } from "./dependent-types-by-type-table";
import { DependentTypesByVersionTable } from "./dependent-types-by-version-table";

import type { DependentTypeRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SxProps, Theme } from "@mui/material";
import type { ReactNode } from "react";

type Layout = "byType" | "byVersion";

const secondaryTextSx: SxProps<Theme> = ({ palette }) => ({
  color: palette.gray[70],
  fontSize: 14,
  lineHeight: "20px",
});

/**
 * Matches `TableHeaderToggle`: the options share a gray track and the selected
 * one is a raised white pill. MUI's default shades the selected option darker
 * gray, which reads as the unselected one on this gray section.
 */
const layoutToggleSx: SxProps<Theme> = ({
  palette,
  boxShadows,
  transitions,
}) => ({
  gap: "3px",
  padding: "3px",
  borderRadius: "8px",
  backgroundColor: palette.gray[10],
  border: `1px solid ${palette.gray[20]}`,
  [`.${toggleButtonClasses.root}`]: {
    border: "0 !important",
    borderRadius: "6px !important",
    margin: "0 !important",
    padding: "2px 10px",
    fontSize: 14,
    lineHeight: "20px",
    textTransform: "none",
    color: palette.gray[70],
    backgroundColor: "transparent",
    transition: transitions.create(["background-color", "box-shadow", "color"]),
    "&:hover": {
      backgroundColor: "transparent",
      color: palette.gray[90],
    },
    [`&.${toggleButtonClasses.selected}`]: {
      color: palette.gray[90],
      backgroundColor: palette.common.white,
      boxShadow: boxShadows.sm,
      "&:hover": {
        backgroundColor: palette.common.white,
      },
    },
  },
});

const InfoButton = ({ label, text }: { label: string; text: ReactNode }) => (
  <Tooltip title={text} describeChild placement="bottom-start">
    <IconButton
      aria-label={label}
      size="small"
      sx={({ palette }) => ({ color: palette.gray[70] })}
    >
      <FontAwesomeIcon icon={faCircleInfo} sx={{ fontSize: 14 }} />
    </IconButton>
  </Tooltip>
);

export const DependentTypesSection = ({
  entityType,
  knownParentLatestVersion,
  rows,
  incomplete,
  error,
  isLinkType,
  onOpenType,
}: {
  /** The type on the page. */
  entityType: EntityTypeWithMetadata;
  /** The latest version of the type on the page, if known. */
  knownParentLatestVersion: number | null;
  /** Current and former dependent types; `undefined` until they have loaded. */
  rows: DependentTypeRow[] | undefined;
  /** Whether a query stopped at the Graph's row limit, so rows or versions can be missing. */
  incomplete: boolean;
  error: Error | undefined;
  isLinkType: (entityType: EntityTypeWithMetadata) => boolean;
  onOpenType: (entityTypeId: VersionedUrl) => void;
}) => {
  const [layout, setLayout] = useState<Layout>("byType");

  const entityTypeTitle = entityType.schema.title;
  const [includeFormer, setIncludeFormer] = useState(false);

  const headingId = useId();

  const failed = rows === undefined && !!error;
  const loading = rows === undefined && !error;
  const shownRows = includeFormer ? rows : rows?.filter((row) => !row.former);
  const parentLatestVersion =
    knownParentLatestVersion ??
    Math.max(1, ...(rows ?? []).flatMap((row) => row.parentVersions));

  const boldTitle: ReactNode = (
    <Box component="span" sx={{ fontWeight: 700 }}>
      {entityTypeTitle}
    </Box>
  );

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
      {rows && rows.length > 0 ? (
        <Stack
          direction="row"
          sx={{ flexWrap: "wrap", alignItems: "center", gap: 2, mb: 1.5 }}
        >
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <ToggleButtonGroup
              aria-label="Table layout"
              exclusive
              size="small"
              value={layout}
              onChange={(_event, value: Layout | null) => {
                if (value) {
                  setLayout(value);
                }
              }}
              sx={layoutToggleSx}
            >
              <ToggleButton value="byType">By type</ToggleButton>
              <ToggleButton value="byVersion">By version</ToggleButton>
            </ToggleButtonGroup>
            <InfoButton
              label="About the layouts"
              text={
                <>
                  <Box component="span" sx={{ display: "block" }}>
                    By type: one row per type that extends {entityTypeTitle},
                    expandable into its version ranges.
                  </Box>
                  <Box component="span" sx={{ display: "block", mt: 0.5 }}>
                    By version: one row per version of {entityTypeTitle},
                    expandable into the types that extend it.
                  </Box>
                </>
              }
            />
          </Stack>
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={includeFormer}
                  onChange={(event) => setIncludeFormer(event.target.checked)}
                  size="small"
                  inputProps={{ role: "switch" }}
                />
              }
              label="Include former types"
              sx={{ m: 0, gap: 1 }}
            />
            <InfoButton
              label="About former types"
              text={`Former types: their latest version no longer extends ${entityTypeTitle}, or is archived.`}
            />
          </Stack>
        </Stack>
      ) : null}
      {failed ? (
        <Typography sx={{ color: "error.main", fontSize: 14 }}>
          Couldn't load these types. Reload the page to try again.
        </Typography>
      ) : null}
      {loading ? <Skeleton variant="rounded" height={40} /> : null}
      {rows && incomplete ? (
        <Typography sx={[secondaryTextSx, { mb: 1 }]}>
          Some types or versions may be missing from this table.
        </Typography>
      ) : null}
      {shownRows?.length === 0 ? (
        <Typography sx={secondaryTextSx}>
          No types extend {boldTitle} yet.
        </Typography>
      ) : null}
      {shownRows && shownRows.length > 0 ? (
        layout === "byType" ? (
          <DependentTypesByTypeTable
            entityTypeTitle={entityTypeTitle}
            parentLatestVersion={parentLatestVersion}
            rows={shownRows}
            isLinkType={isLinkType}
            onOpenType={onOpenType}
          />
        ) : (
          <DependentTypesByVersionTable
            entityType={entityType}
            parentVersionRows={getParentVersionRows({ rows: shownRows })}
            isLinkType={isLinkType}
            onOpenType={onOpenType}
          />
        )
      ) : null}
    </Box>
  );
};
