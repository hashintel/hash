import { useCallback } from "react";

import { useSlideStack } from "../slide-stack";

import type { EntityEditorProps } from "../entity/entity-editor";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/**
 * Stable click handlers that open the visualizer's drill-down surfaces (an
 * entity, an entity type, or an aggregated edge's link table) in the slide
 * stack.
 */
export const useSlideStackHandlers = (): {
  handleEntityClick: (
    entityId: EntityId,
    options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
  ) => void;
  handleEntityTypeClick: (params: { entityTypeId: VersionedUrl }) => void;
  handleOpenLinkTable: (linkEntityIds: readonly EntityId[]) => void;
} => {
  const { pushToSlideStack } = useSlideStack();

  const handleEntityClick = useCallback(
    (
      entityId: EntityId,
      options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
    ) => {
      pushToSlideStack({
        kind: "entity",
        itemId: entityId,
        defaultOutgoingLinkFilters: options?.defaultOutgoingLinkFilters,
      });
    },
    [pushToSlideStack],
  );

  const handleEntityTypeClick = useCallback(
    ({ entityTypeId: itemId }: { entityTypeId: VersionedUrl }) => {
      pushToSlideStack({ kind: "entityType", itemId });
    },
    [pushToSlideStack],
  );

  const handleOpenLinkTable = useCallback(
    (linkEntityIds: readonly EntityId[]) => {
      pushToSlideStack({
        kind: "linkTable",
        itemId: `linkTable:${linkEntityIds[0] ?? "empty"}:${linkEntityIds.length}`,
        linkEntityIds: [...linkEntityIds],
      });
    },
    [pushToSlideStack],
  );

  return { handleEntityClick, handleEntityTypeClick, handleOpenLinkTable };
};
