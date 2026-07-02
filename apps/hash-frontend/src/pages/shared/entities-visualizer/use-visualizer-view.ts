import { useMemo } from "react";

import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import {
  computeIsDisplayingFilesOnly,
  resolveVisualizerView,
} from "./use-visualizer-view/resolve-visualizer-view";

import type { VisualizerView } from "../visualizer-views";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/**
 * Resolves which view (Table / Grid / Graph) to display and which views to
 * offer in the toggle, based on the fetched data and the user's explicit
 * selection (see {@link resolveVisualizerView} for the rules).
 */
export const useVisualizerView = ({
  closedMultiEntityTypesRootMap,
  definitions,
  entities,
  entityTypeBaseUrl,
  entityTypeId,
  selectedView,
}: {
  readonly closedMultiEntityTypesRootMap:
    | ClosedMultiEntityTypesRootMap
    | undefined;
  readonly definitions: ClosedMultiEntityTypesDefinitions | undefined;
  readonly entities: HashEntity[] | undefined;
  readonly entityTypeBaseUrl?: BaseUrl;
  readonly entityTypeId?: VersionedUrl;
  /** The user's explicit choice, or `null` to derive the default from the data. */
  readonly selectedView: VisualizerView | null;
}): {
  view: VisualizerView;
  viewOptions: VisualizerView[];
} => {
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  /** One closed multi-type per distinct entityTypeIds combination present in the results. */
  const closedMultiEntityTypes = useMemo(() => {
    if (!entities || !definitions || !closedMultiEntityTypesRootMap) {
      return [];
    }

    const relevantEntityTypesMap = new Map<string, ClosedMultiEntityType>();

    for (const { metadata } of entities) {
      const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        metadata.entityTypeIds,
      );

      const key = metadata.entityTypeIds.toSorted().join(",");

      relevantEntityTypesMap.set(key, closedMultiEntityType);
    }

    return Array.from(relevantEntityTypesMap.values());
  }, [entities, definitions, closedMultiEntityTypesRootMap]);

  const isDisplayingFilesOnly = useMemo(
    () =>
      computeIsDisplayingFilesOnly({
        closedMultiEntityTypes,
        entityTypeBaseUrl,
        entityTypeId,
        isFileType: (typeId) =>
          isSpecialEntityTypeLookup?.[typeId]?.isFile ?? false,
      }),
    [
      entityTypeBaseUrl,
      entityTypeId,
      closedMultiEntityTypes,
      isSpecialEntityTypeLookup,
    ],
  );

  return useMemo(
    () => resolveVisualizerView({ isDisplayingFilesOnly, selectedView }),
    [isDisplayingFilesOnly, selectedView],
  );
};
