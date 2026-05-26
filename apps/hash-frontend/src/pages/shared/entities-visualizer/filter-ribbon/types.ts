import type { VersionedUrl, WebId } from "@blockprotocol/type-system";

export type WebFilterState = {
  selectedInternalWebIds: Set<WebId>;
  /**
   * Whether the user has opted into entities from webs they don't belong to.
   *
   * - false: query is restricted to `selectedInternalWebIds`.
   * - true: query allows any web EXCEPT internal webs that have been unchecked.
   */
  includeOtherWebs: boolean;
};

export type TypeFilterState = {
  /**
   * `null` means "all types selected" (the default). When the user unchecks
   * any type, this becomes an explicit `Set<VersionedUrl>` of selected types.
   */
  selectedTypeIds: Set<VersionedUrl> | null;
};

export type EntitiesFilterState = {
  web: WebFilterState;
  type: TypeFilterState;
  /**
   * Archived entities are excluded by default with no visible filter.
   * The "Include archived" filter pill can be added; when present and `true`,
   * archived entities are included in the result.
   */
  archived: {
    pillAdded: boolean;
    include: boolean;
  };
};
