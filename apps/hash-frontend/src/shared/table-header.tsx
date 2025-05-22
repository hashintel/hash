import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  CheckIcon,
  Chip,
  EyeRegularIcon,
  EyeSlashRegularIcon,
  IconButton,
  LoadingSpinner,
} from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { SxProps, Theme, TooltipProps } from "@mui/material";
import {
  Box,
  Checkbox,
  chipClasses,
  FormControlLabel,
  formControlLabelClasses,
  styled,
  Tooltip,
  tooltipClasses,
  useTheme,
} from "@mui/material";
import type {
  Dispatch,
  FunctionComponent,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useState } from "react";

import type { GridRow } from "../components/grid/grid";
import type { MinimalUser } from "../lib/user-and-org";
import type { EntitiesTableRow } from "../pages/shared/entities-visualizer/entities-table/types";
import type { TypesTableRow } from "../pages/shared/types-table";
import { EarthAmericasRegularIcon } from "./icons/earth-americas-regular";
import { FilterListIcon } from "./icons/filter-list-icon";
import { HouseRegularIcon } from "./icons/house-regular-icon";
import { MagnifyingGlassRegularIcon } from "./icons/magnifying-glass-regular-icon";
import { BulkActionsDropdown } from "./table-header/bulk-actions-dropdown";
import type { GenerateCsvFileFunction } from "./table-header/export-to-csv-button";
import { ExportToCsvButton } from "./table-header/export-to-csv-button";
import { TableHeaderButton } from "./table-header/table-header-button";

export const tableHeaderHeight = 50;

const CheckboxFilter: FunctionComponent<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <FormControlLabel
    sx={{
      borderRadius: 16,
      color: ({ palette }) => palette.gray[70],
      marginX: 0,
      flexShrink: 0,
      gap: 1,
      mt: 0.1,
      px: 1,
      py: 0.6,
      [`.${formControlLabelClasses.label}`]: {
        fontSize: 13,
        fontWeight: 500,
      },
      transition: ({ transitions }) =>
        transitions.create(["background", "color"]),
      "&:hover": {
        background: ({ palette }) => palette.gray[10],
        color: ({ palette }) => palette.gray[90],
      },
    }}
    label={label}
    control={
      <Checkbox
        sx={{
          svg: {
            width: 12,
            height: 12,
          },
        }}
        checked={checked}
        onChange={({ target }) => onChange(target.checked)}
      />
    }
  />
);

const NoMaxWidthTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))({
  [`& .${tooltipClasses.tooltip}`]: {
    maxWidth: "none",
  },
});

export type FilterState = {
  includeArchived?: boolean;
  includeGlobal: boolean;
  limitToWebs: string[] | false;
};

type TableHeaderProps<R extends GridRow> = {
  currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
  currentlyDisplayedRowsRef: MutableRefObject<R[] | null>;
  endAdornment?: ReactNode;
  filterState: FilterState;
  hideExportToCsv?: boolean;
  hideFilters?: boolean;
  itemLabelPlural: "entities" | "pages" | "types";
  loading: boolean;
  numberOfExternalItems?: number;
  numberOfUserWebItems?: number;
  onlyOneWeb?: boolean;
  onBulkActionCompleted?: () => void;
  selectedItems?: (
    | HashEntity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  setFilterState: Dispatch<SetStateAction<FilterState>>;
  title: string;
  toggleSearch?: () => void;
};

const commonChipSx = {
  border: ({ palette }) => palette.gray[30],
  background: ({ palette }) => palette.gray[5],
  height: 24,
} as const satisfies SxProps<Theme>;

export const TableHeader = <R extends GridRow>({
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  endAdornment,
  filterState,
  hideExportToCsv,
  hideFilters,
  itemLabelPlural,
  loading,
  numberOfExternalItems,
  numberOfUserWebItems,
  onlyOneWeb,
  onBulkActionCompleted,
  selectedItems,
  setFilterState,
  title,
  toggleSearch,
}: TableHeaderProps<R>) => {
  const [displayFilters, setDisplayFilters] = useState<boolean>(false);
  const [publicFilterHovered, setPublicFilterHovered] =
    useState<boolean>(false);

  const theme = useTheme();

  const generateCsvFile = useCallback<GenerateCsvFileFunction>(() => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
    if (!currentlyDisplayedRows) {
      return null;
    }

    const currentlyDisplayedColumns = currentlyDisplayedColumnsRef.current;
    if (!currentlyDisplayedColumns) {
      return null;
    }

    // Entity metadata columns (i.e. what's already being displayed in the entities table)

    const columnRowKeys = currentlyDisplayedColumns.map(({ id }) => id).flat();

    const tableContentColumnTitles = currentlyDisplayedColumns.map((column) =>
      /**
       * If the column is the entity label column, add the word "label" to the
       * column title. Otherwise we'd end up with an "Entity" or "Page" column title,
       * making it harder to distinguish from the property/outgoing link columns.
       */
      column.id === "entityLabel" ? `${column.title} label` : column.title,
    );

    // Collate the contents of the CSV file row by row (including the header)
    const content: string[][] = [
      tableContentColumnTitles,
      ...currentlyDisplayedRows.map((row) => {
        const tableCells = columnRowKeys.map((key) => {
          const value = row[key as keyof R];

          if (typeof value === "string") {
            return value;
          } else if (key === "lastEditedBy" || key === "createdBy") {
            const user = value as MinimalUser | undefined;

            return user?.displayName ?? "";
          } else if (key === "archived") {
            return (row as unknown as TypesTableRow).archived ? "Yes" : "No";
          } else if (key === "sourceEntity" || key === "targetEntity") {
            return (
              (row as unknown as EntitiesTableRow).sourceEntity?.label ?? ""
            );
          } else if (key === "entityTypes") {
            return (row as unknown as EntitiesTableRow).entityTypes
              .map((type) => type.title)
              .join(", ");
          } else {
            return stringifyPropertyValue(value);
          }
        });
        return tableCells;
      }),
    ];

    return { title, content };
  }, [title, currentlyDisplayedColumnsRef, currentlyDisplayedRowsRef]);

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        background: ({ palette }) => palette.gray[20],
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: ({ palette }) => palette.gray[30],
        px: 1.5,
        py: 1,
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
        gap: 1.5,
      }}
    >
      <Box display="flex" gap={1.5} alignItems="center">
        {selectedItems && selectedItems.length ? (
          <BulkActionsDropdown
            selectedItems={selectedItems}
            onBulkActionCompleted={onBulkActionCompleted}
          />
        ) : hideFilters ? null : (
          <>
            <NoMaxWidthTooltip
              title={
                onlyOneWeb
                  ? "Visible to you in this web"
                  : "Visible to you inside your personal web and organizations you belong to"
              }
              placement="top"
            >
              <Chip
                icon={
                  <HouseRegularIcon
                    sx={{
                      fill: ({ palette }) => palette.primary.main,
                    }}
                  />
                }
                label={`${numberOfUserWebItems ?? "–"} in ${
                  onlyOneWeb ? "this web" : "your webs"
                }`}
                sx={{
                  ...commonChipSx,
                  [`.${chipClasses.label}`]: {
                    color: ({ palette }) => palette.gray[70],
                    fontSize: 13,
                  },
                }}
              />
            </NoMaxWidthTooltip>
            {onlyOneWeb ? null : (
              <NoMaxWidthTooltip
                title={`${
                  filterState.includeGlobal ? "Hide" : "Show"
                } public ${itemLabelPlural} from outside of your webs`}
                placement="top"
              >
                <Chip
                  onMouseEnter={() => setPublicFilterHovered(true)}
                  onMouseLeave={() => setPublicFilterHovered(false)}
                  onClick={() => {
                    setDisplayFilters(true);
                    setFilterState((prev) => ({
                      ...prev,
                      includeGlobal: !prev.includeGlobal,
                    }));
                  }}
                  icon={
                    filterState.includeGlobal ? (
                      publicFilterHovered ? (
                        <EyeSlashRegularIcon
                          sx={{ fill: ({ palette }) => palette.primary.main }}
                        />
                      ) : (
                        <CheckIcon
                          sx={{ fill: ({ palette }) => palette.primary.main }}
                        />
                      )
                    ) : publicFilterHovered ? (
                      <EyeRegularIcon
                        sx={{ fill: ({ palette }) => palette.primary.main }}
                      />
                    ) : (
                      <EarthAmericasRegularIcon />
                    )
                  }
                  label={`${numberOfExternalItems ?? "–"} others`}
                  sx={({ palette }) => ({
                    ...commonChipSx,
                    [`.${chipClasses.label}`]: {
                      color: palette.gray[70],
                      fontSize: 13,
                    },
                    "&:hover": {
                      background: palette.common.white,
                      border: palette.common.white,
                    },
                  })}
                />
              </NoMaxWidthTooltip>
            )}
          </>
        )}
        {loading && <LoadingSpinner size={16} color={theme.palette.blue[70]} />}
      </Box>
      <Box display="flex" alignItems="center" columnGap={1}>
        {!hideFilters && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              background: ({ palette }) =>
                displayFilters ||
                Object.values(filterState).some((value) => value)
                  ? palette.common.white
                  : "transparent",
              transition: ({ transitions }) => transitions.create("background"),
              borderRadius: 15,
            }}
          >
            <TableHeaderButton
              variant="tertiary_quiet"
              onClick={() => setDisplayFilters(!displayFilters)}
              startIcon={<FilterListIcon />}
            >
              Filter
            </TableHeaderButton>
            <Box
              sx={{
                transition: ({ transitions }) =>
                  transitions.create("max-width"),
                maxWidth: displayFilters ? 500 : 0,
                overflow: "hidden",
              }}
            >
              <Box
                display="flex"
                flexWrap="nowrap"
                alignItems="center"
                height="100%"
                paddingRight={2}
              >
                {filterState.includeArchived !== undefined ? (
                  <CheckboxFilter
                    label="Include archived"
                    checked={filterState.includeArchived}
                    onChange={(checked) =>
                      setFilterState((prev) => ({
                        ...prev,
                        includeArchived: checked,
                      }))
                    }
                  />
                ) : null}
                {onlyOneWeb ? null : (
                  <CheckboxFilter
                    label="Include external"
                    checked={filterState.includeGlobal}
                    onChange={(checked) =>
                      setFilterState((prev) => ({
                        ...prev,
                        includeGlobal: checked,
                      }))
                    }
                  />
                )}
              </Box>
            </Box>
          </Box>
        )}
        {!hideExportToCsv && (
          <ExportToCsvButton generateCsvFile={generateCsvFile} />
        )}
        {toggleSearch ? (
          /**
           * @todo H-3909 full text search via API
           */
          <Tooltip title="Search for text in visible rows" placement="top">
            <IconButton onClick={toggleSearch}>
              <MagnifyingGlassRegularIcon />
            </IconButton>
          </Tooltip>
        ) : null}
        {endAdornment}
      </Box>
    </Box>
  );
};
