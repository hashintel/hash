import { Chip } from "@hashintel/design-system";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
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

import { EarthAmericasRegularIcon } from "../../../shared/icons/earth-americas-regular";
import { FilterListIcon } from "../../../shared/icons/filter-list-icon";
import { HouseRegularIcon } from "../../../shared/icons/house-regular-icon";
import { Button } from "../../../shared/ui";
import { WorkspaceContext } from "../../shared/workspace-context";

export const typesTableHeaderHeight = 48;

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
  includeArchived: boolean;
  includeExternal: boolean;
};

type TypesTableHeaderProps = {
  types: (
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  filterState: FilterState;
  setFilterState: Dispatch<SetStateAction<FilterState>>;
};

export const TypesTableHeader: FunctionComponent<TypesTableHeaderProps> = ({
  types,
  filterState,
  setFilterState,
}) => {
  const { activeWorkspace } = useContext(WorkspaceContext);

  const [displayFilters, setDisplayFilters] = useState<boolean>(false);

  const numberOfActiveWorkspaceTypes = useMemo(() => {
    const activeWorkspaceTypes = activeWorkspace
      ? types.filter(({ metadata }) =>
          isExternalOntologyElementMetadata(metadata)
            ? false
            : metadata.custom.ownedById === activeWorkspace.accountId,
        )
      : undefined;

    return activeWorkspaceTypes ? activeWorkspaceTypes.length : undefined;
  }, [types, activeWorkspace]);

  const numberOfGlobalTypes =
    typeof numberOfActiveWorkspaceTypes !== "undefined"
      ? types.length - numberOfActiveWorkspaceTypes
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
        <Tooltip
          title={`Visible to you inside @${activeWorkspace?.shortname}`}
          placement="top"
        >
          <Chip
            icon={<HouseRegularIcon />}
            label={`${numberOfActiveWorkspaceTypes} in @${activeWorkspace?.shortname}`}
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
            label={`${numberOfGlobalTypes} globally`}
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
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          background: ({ palette }) => palette.common.white,
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
            <CheckboxFilter
              label="Include External"
              checked={filterState.includeExternal}
              onChange={(checked) =>
                setFilterState((prev) => ({
                  ...prev,
                  includeExternal: checked,
                }))
              }
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
