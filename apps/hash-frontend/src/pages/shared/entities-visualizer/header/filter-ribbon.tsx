import { Box } from "@mui/material";

import { AddFiltersMenu } from "./add-filters-menu";
import { IncludeArchivedPill } from "./include-archived-pill";
import { TypeFilterPill } from "./type-filter-pill";
import { WebFilterPill } from "./web-filter-pill";

import type { EntitiesFilterState } from "../data/types";
import type { AvailableType } from "../data/use-available-types";
import type { WebId } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

type FilterRibbonProps = {
  availableTypes: AvailableType[];
  availableTypesLoading: boolean;
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  isTypePinned: boolean;
  setFilterState: (
    updater: (prev: EntitiesFilterState) => EntitiesFilterState,
  ) => void;
};

export const FilterRibbon: FunctionComponent<FilterRibbonProps> = ({
  availableTypes,
  availableTypesLoading,
  filterState,
  internalWebIds,
  isTypePinned,
  setFilterState,
}) => {
  const setIncludeArchived = (includeArchived: boolean) =>
    setFilterState((prev) => ({ ...prev, includeArchived }));

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <WebFilterPill
        internalWebIds={internalWebIds}
        webState={filterState.web}
        setWebState={(updater) =>
          setFilterState((prev) => ({ ...prev, web: updater(prev.web) }))
        }
      />
      {isTypePinned ? null : (
        <TypeFilterPill
          availableTypes={availableTypes}
          loading={availableTypesLoading}
          typeState={filterState.type}
          setTypeState={(updater) =>
            setFilterState((prev) => ({ ...prev, type: updater(prev.type) }))
          }
        />
      )}
      {filterState.includeArchived ? (
        <IncludeArchivedPill onRemove={() => setIncludeArchived(false)} />
      ) : null}
      <AddFiltersMenu
        includeArchived={filterState.includeArchived}
        onAddIncludeArchived={() => setIncludeArchived(true)}
      />
    </Box>
  );
};
