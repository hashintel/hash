import { useCallback, useMemo, useState } from "react";

import { typedEntries } from "@local/advanced-types/typed-entries";

import { useVirtualizedTableFilterState } from "../../../virtualized-table/use-filter-state";

import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../virtualized-table/header/filter";
import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * The single column the readonly link tables can filter on: the link entity's
 * own type. Both the incoming and outgoing tables expose it under this id.
 */
type LinkTypeFilterFieldId = "linkTypes";

export type LinkTypeFilterDefinitions =
  VirtualizedTableFilterDefinitionsByFieldId<LinkTypeFilterFieldId>;

export type LinkTypeFilterValues =
  VirtualizedTableFilterValuesByFieldId<LinkTypeFilterFieldId>;

/**
 * Derives the link-type filter shared by the incoming and outgoing link tables,
 * in both the readonly (server-paginated) and editable (client-side) cases.
 *
 * The filter options come from the unfiltered link-type breakdown (`typeIds` /
 * `typeTitles`) the caller supplies via {@link captureLinkTypeOptions}: the
 * server aggregate from {@link useEntityLinks} in the readonly case, or a
 * breakdown computed from the editor subgraph's links in the editable case. The
 * breakdown is captured once – on the first, necessarily unfiltered, load – and
 * never recaptured, so the options (and their counts) stay stable as the user
 * narrows the selection (in the readonly case the server breakdown itself
 * shrinks to the selected subset once filtered).
 *
 * The returned `filterTypeIds` derives purely from this hook's own state (the
 * captured options and the user's selection), so the readonly caller can pass it
 * into {@link useEntityLinks} without creating a render cycle, and the editable
 * caller can apply it client-side. It is `undefined` while every type is
 * selected (the default), so an untouched filter is a no-op; it is the empty
 * array once every type has been *deselected*, which both callers treat as
 * "match nothing" (distinct from the `undefined` "match everything"). Any other
 * value is the explicit set of selected type ids.
 */
export const useLinkTypeFilter = ({
  defaultSelectedLinkTypeIds,
}: {
  /**
   * Link entity type ids to pre-select when the table first opens, with every
   * other type deselected – e.g. when arriving from a clicked graph edge whose
   * link type should be focused. Any ids not present in the loaded breakdown are
   * ignored, and if none are present the filter falls back to "all selected" (a
   * no-op) rather than matching nothing.
   *
   * Because this seeds the same filter state as a manual selection, it drives
   * both modes automatically: server-side (readonly) the derived
   * {@link filterTypeIds} re-fetches the links narrowed to these types;
   * client-side (editable) the caller filters the in-memory links by the same
   * value. Pass a referentially stable Set, since changing it reconciles the
   * filter state.
   */
  defaultSelectedLinkTypeIds?: Set<VersionedUrl>;
} = {}) => {
  const [capturedOptions, setCapturedOptions] = useState<{
    typeIds: Record<VersionedUrl, number>;
    typeTitles: Record<VersionedUrl, string>;
  } | null>(null);

  /**
   * Record the unfiltered link-type breakdown the first time it is seen. The
   * functional update makes this idempotent and one-shot, so later (filtered, or
   * draft-edited) breakdowns do not overwrite the stable option list. The caller
   * decides which breakdown to pass, and passes `undefined` when there is none
   * to offer (e.g. an editable outgoing table, which is not filtered here).
   */
  const captureLinkTypeOptions = useCallback(
    (
      typeIds?: Record<VersionedUrl, number>,
      typeTitles?: Record<VersionedUrl, string>,
    ) => {
      if (!typeIds || !typeTitles || Object.keys(typeIds).length === 0) {
        return;
      }

      setCapturedOptions((existing) => existing ?? { typeIds, typeTitles });
    },
    [],
  );

  /**
   * The filter options and the full set of type ids they cover. The set is kept
   * separately (rather than read back off the definition, whose `initialValue`
   * widens to the filter union) so it can be reused for both the default value
   * and the "is anything deselected" check below.
   */
  const optionData = useMemo(() => {
    if (!capturedOptions) {
      return null;
    }

    const options: VirtualizedTableFilterDefinition["options"] = {};
    for (const [versionedUrl, count] of typedEntries(capturedOptions.typeIds)) {
      options[versionedUrl] = {
        label: capturedOptions.typeTitles[versionedUrl] ?? versionedUrl,
        value: versionedUrl,
        count,
      };
    }

    return { options, allTypeIds: new Set<string>(Object.keys(options)) };
  }, [capturedOptions]);

  const filterDefinitions = useMemo<
    LinkTypeFilterDefinitions | undefined
  >(() => {
    if (!optionData) {
      return undefined;
    }

    return {
      linkTypes: {
        header: "Link type",
        initialValue: optionData.allTypeIds,
        options: optionData.options,
        type: "checkboxes",
      },
    } satisfies LinkTypeFilterDefinitions;
  }, [optionData]);

  const defaultFilterValues = useMemo<LinkTypeFilterValues | null>(() => {
    if (!optionData) {
      return null;
    }

    if (defaultSelectedLinkTypeIds) {
      /**
       * Narrow the default selection to the requested types, keeping only those
       * actually present in the breakdown. If none are present we fall back to
       * selecting everything, so an unmatched seed leaves the filter a no-op
       * rather than hiding every link.
       */
      const selected = new Set<string>(
        [...defaultSelectedLinkTypeIds].filter((id) =>
          optionData.allTypeIds.has(id),
        ),
      );

      if (selected.size > 0) {
        return { linkTypes: selected };
      }
    }

    return { linkTypes: optionData.allTypeIds };
  }, [optionData, defaultSelectedLinkTypeIds]);

  const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
    defaultFilterValues,
    filterDefinitions,
  });

  const filterTypeIds = useMemo<VersionedUrl[] | undefined>(() => {
    const allTypeIds = optionData?.allTypeIds;
    const selected = filterValues?.linkTypes;

    if (!allTypeIds || !selected || typeof selected === "string") {
      return undefined;
    }

    /**
     * No type filter is applied while every option is selected (the default);
     * only once the user deselects at least one type do we constrain the query.
     */
    if (allTypeIds.difference(selected).size === 0) {
      return undefined;
    }

    return Array.from(selected) as VersionedUrl[];
  }, [optionData, filterValues]);

  return {
    captureLinkTypeOptions,
    filterDefinitions,
    filterValues: filterValues ?? undefined,
    setFilterValues,
    filterTypeIds,
  };
};
