import { Chip, IconButton } from "@hashintel/design-system";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  extractOwnedByIdFromEntityId,
  isExternalOntologyElementMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import {
  Box,
  buttonClasses,
  Checkbox,
  chipClasses,
  FormControlLabel,
  formControlLabelClasses,
  Tooltip,
} from "@mui/material";
import {
  Dispatch,
  FunctionComponent,
  SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";

import { WorkspaceContext } from "../pages/shared/workspace-context";
import { EarthAmericasRegularIcon } from "./icons/earth-americas-regular";
import { FilterListIcon } from "./icons/filter-list-icon";
import { HouseRegularIcon } from "./icons/house-regular-icon";
import { MagnifyingGlassRegularIcon } from "./icons/magnifying-glass-regular-icon";
import { BulkActionsDropdown } from "./table-header/bulk-actions-dropdown";
import { Button } from "./ui";

export const tableHeaderHeight = 50;

const CheckboxFilter: FunctionComponent<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <FormControlLabel
    sx={{
      marginX: 0,
      flexShrink: 0,
      gap: 1,
      [`.${formControlLabelClasses.label}`]: {
        fontSize: 13,
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

export type FilterState = {
  includeArchived?: boolean;
  includeGlobal: boolean;
};

type TableHeaderProps = {
  items: (
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  selectedItems: (
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  filterState: FilterState;
  setFilterState: Dispatch<SetStateAction<FilterState>>;
  toggleSearch?: () => void;
  onBulkActionCompleted?: () => void;
};

export const TableHeader: FunctionComponent<TableHeaderProps> = ({
  items,
  selectedItems,
  filterState,
  setFilterState,
  toggleSearch,
  onBulkActionCompleted,
}) => {
  const { activeWorkspace, activeWorkspaceOwnedById } =
    useContext(WorkspaceContext);

  const [displayFilters, setDisplayFilters] = useState<boolean>(false);

  const numberOfActiveWorkspaceItems = useMemo(() => {
    const activeWorkspaceItems = activeWorkspace
      ? items.filter(({ metadata }) =>
          "entityTypeId" in metadata
            ? extractOwnedByIdFromEntityId(metadata.recordId.entityId) ===
              activeWorkspaceOwnedById
            : isExternalOntologyElementMetadata(metadata)
            ? false
            : metadata.custom.ownedById === activeWorkspaceOwnedById,
        )
      : undefined;

    return activeWorkspaceItems ? activeWorkspaceItems.length : undefined;
  }, [items, activeWorkspace, activeWorkspaceOwnedById]);

  const numberOfGlobalItems =
    typeof numberOfActiveWorkspaceItems !== "undefined"
      ? items.length - numberOfActiveWorkspaceItems
      : undefined;

  return (
    <Box
      display="flex"
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
      <Box display="flex" gap={1.5}>
        {selectedItems.length ? (
          <BulkActionsDropdown
            selectedItems={selectedItems}
            onBulkActionCompleted={onBulkActionCompleted}
          />
        ) : (
          <>
            <Tooltip
              title={`Visible to you inside @${activeWorkspace?.shortname}`}
              placement="top"
            >
              <Chip
                icon={<HouseRegularIcon />}
                label={`${numberOfActiveWorkspaceItems} in @${activeWorkspace?.shortname}`}
                sx={{
                  [`.${chipClasses.label}`]: {
                    fontSize: 13,
                  },
                  border: ({ palette }) => palette.common.white,
                  background: ({ palette }) => palette.gray[5],
                }}
              />
            </Tooltip>
            <Tooltip
              title={`Visible to you outside of @${activeWorkspace?.shortname}`}
              placement="top"
            >
              <Chip
                icon={<EarthAmericasRegularIcon />}
                label={`${numberOfGlobalItems} others`}
                sx={{
                  [`.${chipClasses.label}`]: {
                    fontSize: 13,
                  },
                  fontSize: 13,
                  border: ({ palette }) => palette.gray[30],
                  background: ({ palette }) => palette.common.white,
                }}
              />
            </Tooltip>
          </>
        )}

        {toggleSearch ? (
          <IconButton onClick={toggleSearch}>
            <MagnifyingGlassRegularIcon />
          </IconButton>
        ) : null}
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          background: ({ palette }) =>
            displayFilters || Object.values(filterState).some((value) => value)
              ? palette.common.white
              : "transparent",
          transition: ({ transitions }) => transitions.create("background"),
          borderRadius: 15,
        }}
      >
        <Button
          variant="tertiary_quiet"
          onClick={() => setDisplayFilters(!displayFilters)}
          startIcon={<FilterListIcon />}
          sx={{
            py: 0.25,
            px: 2,
            borderRadius: 15,
            background: "transparent",
            minHeight: "unset",
            minWidth: "unset",
            fontWeight: 500,
            fontSize: 13,
            color: ({ palette }) => palette.gray[70],
            [`.${buttonClasses.startIcon}`]: {
              color: ({ palette }) => palette.gray[70],
            },
            ":hover": {
              color: ({ palette }) => palette.gray[90],
              background: ({ palette }) => palette.gray[30],
              [`.${buttonClasses.startIcon}`]: {
                color: ({ palette }) => palette.gray[90],
              },
            },
          }}
        >
          Filter
        </Button>
        <Box
          sx={{
            transition: ({ transitions }) => transitions.create("max-width"),
            maxWidth: displayFilters ? 500 : 0,
            overflow: "hidden",
          }}
        >
          <Box
            display="flex"
            flexWrap="nowrap"
            alignItems="center"
            height="100%"
            paddingLeft={1}
            paddingRight={3}
            gap={1}
          >
            {filterState.includeArchived !== undefined ? (
              <CheckboxFilter
                label="Include Archived"
                checked={filterState.includeArchived}
                onChange={(checked) =>
                  setFilterState((prev) => ({
                    ...prev,
                    includeArchived: checked,
                  }))
                }
              />
            ) : null}
            <CheckboxFilter
              label="Include Global"
              checked={filterState.includeGlobal}
              onChange={(checked) =>
                setFilterState((prev) => ({
                  ...prev,
                  includeGlobal: checked,
                }))
              }
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
