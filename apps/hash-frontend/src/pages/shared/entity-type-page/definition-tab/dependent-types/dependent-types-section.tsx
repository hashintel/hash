import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  ToggleButton,
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

const InfoButton = ({ label, text }: { label: string; text: string }) => (
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
  parentLatestVersion,
  rows,
  incomplete,
  error,
  isLinkType,
  onOpenType,
}: {
  /** The type on the page. */
  entityType: EntityTypeWithMetadata;
  /** The latest version of the type on the page, if known. */
  parentLatestVersion: number | null;
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
  const [currentOnly, setCurrentOnly] = useState(true);

  const headingId = useId();

  const failed = rows === undefined && !!error;
  const loading = rows === undefined && !error;
  const shownRows = currentOnly ? rows?.filter((row) => !row.former) : rows;
  const latestParentVersion =
    parentLatestVersion ??
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
            >
              <ToggleButton value="byType">By child type</ToggleButton>
              <ToggleButton value="byVersion">By parent version</ToggleButton>
            </ToggleButtonGroup>
            <InfoButton
              label="About the layouts"
              text={`By child type: one row per type that extends ${entityTypeTitle}, expandable into its version ranges. By parent version: one row per version of ${entityTypeTitle}, expandable into the types that extend it.`}
            />
          </Stack>
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={currentOnly}
                  onChange={(event) => setCurrentOnly(event.target.checked)}
                  size="small"
                  inputProps={{ role: "switch" }}
                />
              }
              label="Current children only"
              sx={{ m: 0, gap: 1 }}
            />
            <InfoButton
              label="About current children"
              text={`On: lists only types whose latest version still extends ${entityTypeTitle}. Off: also lists former children, whose latest version no longer extends ${entityTypeTitle} or is archived.`}
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
            parentLatestVersion={latestParentVersion}
            rows={shownRows}
            isLinkType={isLinkType}
            onOpenType={onOpenType}
          />
        ) : (
          <DependentTypesByVersionTable
            entityType={entityType}
            parentVersionRows={getParentVersionRows({
              rows: shownRows,
              parentLatestVersion: latestParentVersion,
            })}
            isLinkType={isLinkType}
            onOpenType={onOpenType}
          />
        )
      ) : null}
    </Box>
  );
};
