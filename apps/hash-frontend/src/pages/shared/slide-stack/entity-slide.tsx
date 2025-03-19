import type { EntityId } from "@blockprotocol/type-system";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { memo } from "react";

import { Entity } from "../entity";
import type { EntityEditorProps } from "../entity/entity-editor";
import type { SlideItem } from "./types";

export type EntitySlideProps = {
  /**
   * The default outgoing link filters to apply to the links tables in the entity editor
   */
  defaultOutgoingLinkFilters?: EntityEditorProps["defaultOutgoingLinkFilters"];
  entityId: EntityId;
  /**
   * If the entity is a Flow proposal, it won't be persisted in the database yet.
   * This mock subgraph allows viewing it in the slide (and will disable attempting to request info from the db on it)
   */
  proposedEntitySubgraph?: Subgraph<EntityRootType>;
  replaceItem: (item: SlideItem) => void;
  removeItem: () => void;

  /**
   * Optional callback to react when the entity is updated in the database (updated, draft archived, draft published)
   */
  onEntityDbChange?: (entityId: EntityId) => void;
};

export const EntitySlide = memo(
  ({
    defaultOutgoingLinkFilters,
    entityId,
    proposedEntitySubgraph,
    onEntityDbChange,
    removeItem,
    replaceItem,
  }: EntitySlideProps) => {
    return (
      <Entity
        defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
        entityId={entityId}
        isInSlide
        onEntityUpdatedInDb={(entity) => {
          replaceItem({
            itemId: entity.entityId,
            kind: "entity",
          });
          onEntityDbChange?.(entity.entityId);
        }}
        onRemoteDraftArchived={() => {
          removeItem();

          onEntityDbChange?.(entityId);
        }}
        onRemoteDraftPublished={(persistedDraft) => {
          replaceItem({
            itemId: persistedDraft.entityId,
            kind: "entity",
          });
          onEntityDbChange?.(persistedDraft.entityId);
        }}
        proposedEntitySubgraph={proposedEntitySubgraph}
      />
    );
  },
);
