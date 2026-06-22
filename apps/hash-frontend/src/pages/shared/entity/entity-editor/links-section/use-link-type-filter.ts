import { useCallback, useMemo, useState } from "react";

import { typedEntries } from "@local/advanced-types/typed-entries";

import { useVirtualizedTableFilterState } from "../../../virtualized-table/use-filter-state";

import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../virtualized-table/header/filter";
import type { VersionedUrl } from "@blockprotocol/type-system";

/** The one column the link tables filter on: the link entity's own type. */
type LinkTypeFilterFieldId = "linkTypes";

export type LinkTypeFilterDefinitions =
  VirtualizedTableFilterDefinitionsByFieldId<LinkTypeFilterFieldId>;

export type LinkTypeFilterValues =
  VirtualizedTableFilterValuesByFieldId<LinkTypeFilterFieldId>;

/**
 * Derives the link-type filter shared by the incoming and outgoing link tables,
 * for both the readonly (server-paginated) and editable (client-side) cases.
 *
 * The returned `filterTypeIds` is `undefined` while every type is selected ("match everything",
 * the default no-op), an empty array once every type is deselected ("match
 * nothing"), or otherwise the explicit set of selected type ids.
 */
export const useLinkTypeFilter = ({
  defaultSelectedLinkTypeIds,
}: {
  defaultSelectedLinkTypeIds?: Set<VersionedUrl>;
} = {}) => {
  const [capturedOptions, setCapturedOptions] = useState<{
    typeIds: Record<VersionedUrl, number>;
    typeTitles: Record<VersionedUrl, string>;
  } | null>(null);

  /**
   * Record the link-type breakdown the first time it is seen; the functional
   * update keeps it one-shot, so later (filtered) breakdowns don't overwrite the
   * stable option list. The caller passes `undefined` when it has none to offer.
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
      // Keep only requested types present in the breakdown; if none match,
      // fall through to selecting everything (a no-op) rather than hiding all.
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

    // No filter while every option is selected (the default); only a
    // deselection constrains the query.
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
