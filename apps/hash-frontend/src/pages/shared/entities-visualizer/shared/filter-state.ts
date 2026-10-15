import type { WebFilterState } from "../../filter-bar";
import type { PropertyFilter } from "./property-filters/property-filter";
import type { VersionedUrl, WebId } from "@blockprotocol/type-system";

export type EntitiesFilterState = {
  web: WebFilterState;
  type: {
    selectedTypeIds: Set<VersionedUrl> | null;
  };
  includeArchived: boolean;
  /**
   * Per-property value filters (e.g. `Age > 13`).
   */
  propertyFilters: PropertyFilter[];
};

export const createDefaultFilterState = (
  internalWebIds: WebId[],
): EntitiesFilterState => ({
  web: {
    selectedInternalWebIds: new Set<WebId>(internalWebIds),
    includeOtherWebs: false,
  },
  type: { selectedTypeIds: null },
  includeArchived: false,
  propertyFilters: [],
});
