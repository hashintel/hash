import { Box } from "@mui/material";

import { createDefaultFilterState } from "../data/types";
import { AddFiltersMenu } from "./add-filters-menu";
import { ClearFiltersButton } from "./clear-filters-button";
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

const isWebFilterDefault = (
  web: EntitiesFilterState["web"],
  internalWebIds: WebId[],
) => {
  if (web.includeOtherWebs) {
    return false;
  }

  return internalWebIds.every((id) => web.selectedInternalWebIds.has(id));
};

const isTypeFilterDefault = (
  type: EntitiesFilterState["type"],
  availableTypes: AvailableType[],
) => {
  if (type.selectedTypeIds === null) {
    return true;
  }

  return availableTypes.every(({ entityTypeId }) =>
    type.selectedTypeIds!.has(entityTypeId),
  );
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

  const webIsDefault = isWebFilterDefault(filterState.web, internalWebIds);
  const typeIsDefault =
    isTypePinned || isTypeFilterDefault(filterState.type, availableTypes);
  const archivedIsDefault = !filterState.includeArchived;

  const filtersAreDefault = webIsDefault && typeIsDefault && archivedIsDefault;

  const handleClear = () => {
    setFilterState(() => createDefaultFilterState(internalWebIds));
  };

  const allExtraFiltersEnabled = filterState.includeArchived;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
      {!allExtraFiltersEnabled && (
        <AddFiltersMenu onAddIncludeArchived={() => setIncludeArchived(true)} />
      )}
      {filtersAreDefault ? null : <ClearFiltersButton onClear={handleClear} />}
    </Box>
  );
};
