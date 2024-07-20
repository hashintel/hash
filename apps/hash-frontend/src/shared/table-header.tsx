import type {
  Dispatch,
  FunctionComponent,
  MutableRefObject,
  ReactNode,
  SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  CheckIcon,
  Chip,
  EyeIconRegular,
  EyeSlashIconRegular,
  IconButton,
} from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  AccountGroupId,
  AccountId,
} from "@local/hash-graph-types/account";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  isBaseUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import {
  extractOwnedByIdFromEntityId,
  isExternalOntologyElementMetadata,
} from "@local/hash-subgraph";
import type {
  Box,
  Checkbox,
  chipClasses,
  FormControlLabel,
  formControlLabelClasses,
  styled,
  SxProps,
  Theme,
  Tooltip,
  tooltipClasses,
  TooltipProps,
} from "@mui/material";

import type { Row } from "../components/grid/utils/rows";
import type { MinimalUser } from "../lib/user-and-org";
import type { TypeEntitiesRow } from "../pages/shared/entities-table/use-entities-table";
import type { TypesTableRow } from "../pages/types/[[...type-kind]].page/types-table";

import { EarthAmericasRegularIcon } from "./icons/earth-americas-regular";
import { FilterListIcon } from "./icons/filter-list-icon";
import { HouseRegularIcon } from "./icons/house-regular-icon";
import { MagnifyingGlassRegularIcon } from "./icons/magnifying-glass-regular-icon";
import { BulkActionsDropdown } from "./table-header/bulk-actions-dropdown";
import type {
  ExportToCsvButton,
  GenerateCsvFileFunction,
} from "./table-header/export-to-csv-button";
import { TableHeaderButton } from "./table-header/table-header-button";

export const tableHeaderHeight = 50;

const CheckboxFilter: FunctionComponent<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <FormControlLabel
    label={label}
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
    control={
      <Checkbox
        checked={checked}
        sx={{
          svg: {
            width: 12,
            height: 12,
          },
        }}
        onChange={({ target }) => {
          onChange(target.checked);
        }}
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

export interface FilterState {
  includeArchived?: boolean;
  includeGlobal: boolean;
}

export type GetAdditionalCsvDataFunction = () => Promise<{
  prependedData: string[][];
  appendedData: string[][];
} | null>;

interface TableHeaderProps {
  internalWebIds: (AccountId | AccountGroupId)[];
  itemLabelPlural: "entities" | "pages" | "types";
  items?: (
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  selectedItems?: (
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  filterState: FilterState;
  endAdornment?: ReactNode;
  title: string;
  columns: SizedGridColumn[];
  currentlyDisplayedRowsRef: MutableRefObject<Row[] | null>;
  getAdditionalCsvData?: GetAdditionalCsvDataFunction;
  setFilterState: Dispatch<SetStateAction<FilterState>>;
  toggleSearch?: () => void;
  onBulkActionCompleted?: () => void;
}

const commonChipSx = {
  border: ({ palette }) => palette.gray[30],
  background: ({ palette }) => palette.gray[5],
  height: 24,
} as const satisfies SxProps<Theme>;

export const TableHeader: FunctionComponent<TableHeaderProps> = ({
  internalWebIds,
  itemLabelPlural,
  items,
  selectedItems,
  filterState,
  endAdornment,
  title,
  columns,
  currentlyDisplayedRowsRef,
  getAdditionalCsvData,
  setFilterState,
  toggleSearch,
  onBulkActionCompleted,
}) => {
  const [displayFilters, setDisplayFilters] = useState<boolean>(false);
  const [publicFilterHovered, setPublicFilterHovered] =
    useState<boolean>(false);

  const numberOfUserWebItems = useMemo(
    () =>
      items?.filter(({ metadata }) =>
        "entityTypeId" in metadata
          ? internalWebIds.includes(
              extractOwnedByIdFromEntityId(metadata.recordId.entityId),
            )
          : isExternalOntologyElementMetadata(metadata)
            ? false
            : internalWebIds.includes(metadata.ownedById),
      ).length,
    [items, internalWebIds],
  );

  const numberOfGlobalItems =
    items && typeof numberOfUserWebItems !== "undefined"
      ? items.length - numberOfUserWebItems
      : undefined;

  const generateCsvFile = useCallback<GenerateCsvFileFunction>(async () => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;

    if (!currentlyDisplayedRows) {
      return null;
    }

    const additionalCsvData = getAdditionalCsvData
      ? await getAdditionalCsvData()
      : undefined;

    const { prependedData, appendedData } = additionalCsvData ?? {};

    const prependedColumnTitles = prependedData?.[0];
    const prependedRows = prependedData?.splice(1);

    const appendedColumnTitles = appendedData?.[0];
    const appendedRows = appendedData?.splice(1);

    // Entity metadata columns (i.e. what's already being displayed in the entities table)

    const columnRowKeys = columns.flatMap(({ id }) => id);

    const tableContentColumnTitles = columns.map((column) =>
      /**
       * If the column is the entity label column, add the word "label" to the
       * column title. Otherwise we'd end up with an "Entity" or "Page" column title,
       * making it harder to distinguish from the property/outgoing link columns.
       */
      column.id === "entityLabel" ? `${column.title} label` : column.title,
    );

    // Collate the contents of the CSV file row by row (including the header)
    const content: string[][] = [
      [
        ...(prependedColumnTitles ?? []),
        ...tableContentColumnTitles,
        ...(appendedColumnTitles ?? []),
      ],
      ...currentlyDisplayedRows.map((row, i) => {
        const tableCells = columnRowKeys.map((key) => {
          const value = row[key];

          if (typeof value === "string") {
            return value;
          }
          if (key === "lastEditedBy") {
            const user = value as MinimalUser | undefined;

            return user?.displayName ?? "";
          }
          if (isBaseUrl(key)) {
            /**
             * If the key is a base URL, then the value needs to be obtained
             * from the nested `properties` field on the row.
             */
            return (row as TypeEntitiesRow).properties?.[key] ?? "";
          }
          if (key === "archived") {
            return (row as TypesTableRow).archived ? "Yes" : "No";
          }

          return "";
        });

        const prependedCells = prependedRows?.[i];
        const appendedCells = appendedRows?.[i];

        return [
          ...(prependedCells ?? []),
          ...tableCells,
          ...(appendedCells ?? []),
        ];
      }),
    ];

    return { title, content };
  }, [title, columns, currentlyDisplayedRowsRef, getAdditionalCsvData]);

  return (
    <Box
      display={"flex"}
      alignItems={"center"}
      justifyContent={"space-between"}
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
      <Box display={"flex"} gap={1.5} alignItems={"center"}>
        {selectedItems?.length ? (
          <BulkActionsDropdown
            selectedItems={selectedItems}
            onBulkActionCompleted={onBulkActionCompleted}
          />
        ) : (
          <>
            <NoMaxWidthTooltip
              title={
                "Visible to you inside your personal web and organizations you belong to"
              }
              placement={"top"}
            >
              <Chip
                label={`${numberOfUserWebItems ?? "–"} in your webs`}
                icon={
                  <HouseRegularIcon
                    sx={{
                      fill: ({ palette }) => palette.primary.main,
                    }}
                  />
                }
                sx={{
                  ...commonChipSx,
                  [`.${chipClasses.label}`]: {
                    color: ({ palette }) => palette.gray[70],
                    fontSize: 13,
                  },
                }}
              />
            </NoMaxWidthTooltip>
            <NoMaxWidthTooltip
              placement={"top"}
              title={`${
                filterState.includeGlobal ? "Hide" : "Show"
              } public ${itemLabelPlural} from outside of your webs`}
            >
              <Chip
                label={`${numberOfGlobalItems ?? "–"} others`}
                icon={
                  filterState.includeGlobal ? (
                    publicFilterHovered ? (
                      <EyeSlashIconRegular
                        sx={{ fill: ({ palette }) => palette.primary.main }}
                      />
                    ) : (
                      <CheckIcon
                        sx={{ fill: ({ palette }) => palette.primary.main }}
                      />
                    )
                  ) : publicFilterHovered ? (
                    <EyeIconRegular
                      sx={{ fill: ({ palette }) => palette.primary.main }}
                    />
                  ) : (
                    <EarthAmericasRegularIcon />
                  )
                }
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
                onMouseEnter={() => {
                  setPublicFilterHovered(true);
                }}
                onMouseLeave={() => {
                  setPublicFilterHovered(false);
                }}
                onClick={() => {
                  setDisplayFilters(true);
                  setFilterState((previous) => ({
                    ...previous,
                    includeGlobal: !previous.includeGlobal,
                  }));
                }}
              />
            </NoMaxWidthTooltip>
          </>
        )}

        {toggleSearch ? (
          <IconButton onClick={toggleSearch}>
            <MagnifyingGlassRegularIcon />
          </IconButton>
        ) : null}
      </Box>
      <Box display={"flex"} alignItems={"center"} columnGap={1}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            background: ({ palette }) =>
              displayFilters || Object.values(filterState).some(Boolean)
                ? palette.common.white
                : "transparent",
            transition: ({ transitions }) => transitions.create("background"),
            borderRadius: 15,
          }}
        >
          <TableHeaderButton
            variant={"tertiary_quiet"}
            startIcon={<FilterListIcon />}
            onClick={() => {
              setDisplayFilters(!displayFilters);
            }}
          >
            Filter
          </TableHeaderButton>
          <Box
            sx={{
              transition: ({ transitions }) => transitions.create("max-width"),
              maxWidth: displayFilters ? 500 : 0,
              overflow: "hidden",
            }}
          >
            <Box
              display={"flex"}
              flexWrap={"nowrap"}
              alignItems={"center"}
              height={"100%"}
              paddingRight={2}
            >
              {filterState.includeArchived !== undefined ? (
                <CheckboxFilter
                  label={"Include archived"}
                  checked={filterState.includeArchived}
                  onChange={(checked) => {
                    setFilterState((previous) => ({
                      ...previous,
                      includeArchived: checked,
                    }));
                  }}
                />
              ) : null}
              <CheckboxFilter
                label={"Include external"}
                checked={filterState.includeGlobal}
                onChange={(checked) => {
                  setFilterState((previous) => ({
                    ...previous,
                    includeGlobal: checked,
                  }));
                }}
              />
            </Box>
          </Box>
        </Box>
        <ExportToCsvButton generateCsvFile={generateCsvFile} />
        {endAdornment}
      </Box>
    </Box>
  );
};
