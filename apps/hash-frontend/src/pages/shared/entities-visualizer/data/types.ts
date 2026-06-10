import type { VersionedUrl, WebId } from "@blockprotocol/type-system";

export type EntitiesFilterState = {
  web: {
    selectedInternalWebIds: Set<WebId>;
    includeOtherWebs: boolean;
  };
  type: {
    selectedTypeIds: Set<VersionedUrl> | null;
  };
  includeArchived: boolean;
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
});
