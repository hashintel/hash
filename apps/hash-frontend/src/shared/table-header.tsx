import { CheckIcon } from "@hashintel/block-design-system";
import {
  Chip,
  EyeIconRegular,
  EyeSlashIconRegular,
  IconButton,
} from "@hashintel/design-system";
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
  styled,
  SxProps,
  Theme,
  Tooltip,
  tooltipClasses,
  TooltipProps,
} from "@mui/material";
import {
  Dispatch,
  FunctionComponent,
  SetStateAction,
  useMemo,
  useState,
} from "react";

import { useAuthenticatedUser } from "../pages/shared/auth-info-context";
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
    sx={({ palette }) => ({
      borderRadius: 16,
      color: palette.gray[70],
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
        background: palette.gray[10],
        color: palette.gray[90],
      },
    })}
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
};

type TableHeaderProps = {
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
  setFilterState: Dispatch<SetStateAction<FilterState>>;
  toggleSearch?: () => void;
  onBulkActionCompleted?: () => void;
};

const commonChipSx = {
  border: ({ palette }) => palette.gray[30],
  background: ({ palette }) => palette.gray[5],
  height: 24,
} as const satisfies SxProps<Theme>;

export const TableHeader: FunctionComponent<TableHeaderProps> = ({
  itemLabelPlural,
  items,
  selectedItems,
  filterState,
  setFilterState,
  toggleSearch,
  onBulkActionCompleted,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [displayFilters, setDisplayFilters] = useState<boolean>(false);
  const [publicFilterHovered, setPublicFilterHovered] =
    useState<boolean>(false);

  const userWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
    ];
  }, [authenticatedUser]);

  const numberOfUserWebItems = useMemo(
    () =>
      items?.filter(({ metadata }) =>
        "entityTypeId" in metadata
          ? userWebIds.includes(
              extractOwnedByIdFromEntityId(metadata.recordId.entityId),
            )
          : isExternalOntologyElementMetadata(metadata)
          ? false
          : userWebIds.includes(metadata.custom.ownedById),
      ).length,
    [items, userWebIds],
  );

  const numberOfGlobalItems =
    items && typeof numberOfUserWebItems !== "undefined"
      ? items.length - numberOfUserWebItems
      : undefined;

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
        ) : (
          <>
            <NoMaxWidthTooltip
              title="Visible to you inside your personal web and organizations you belong to"
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
                label={`${numberOfUserWebItems} in your webs`}
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
                label={`${numberOfGlobalItems} others`}
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
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
