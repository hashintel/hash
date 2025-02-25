import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { memo } from "react";

import { Entity } from "../../@/[shortname]/entities/[entity-uuid].page/entity";
import type { EntityEditorProps } from "../../@/[shortname]/entities/[entity-uuid].page/entity/entity-editor";
import type { SlideItem } from "./types";

export type EntitySlideProps = {
  /**
   * The default outgoing link filters to apply to the links tables in the entity editor
   */
  defaultOutgoingLinkFilters?: EntityEditorProps["defaultOutgoingLinkFilters"];
  removeItem: () => void;
  /**
   * When the entity is updated, call this function with the updated entity's entityId.
   */
  replaceItem: (item: SlideItem) => void;
  entityId: EntityId;
  /**
   * If the entity is a Flow proposal, it won't be persisted in the database yet.
   * This mock subgraph allows viewing it in the slide (and will disable attempting to request info from the db on it)
   */
  proposedEntitySubgraph?: Subgraph<EntityRootType>;
};

export const EntitySlide = memo(
  ({
    defaultOutgoingLinkFilters,
    entityId,
    proposedEntitySubgraph,
    removeItem,
    replaceItem,
  }: EntitySlideProps) => {
    return (
      <Entity
        defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
        entityId={entityId}
        isInSlide
        onEntityUpdatedInDb={(entity) =>
          replaceItem({
            itemId: entity.entityId,
            kind: "entity",
          })
        }
        onRemoteDraftArchived={() => {
          removeItem();
        }}
        onRemoteDraftPublished={(persistedDraft) =>
          replaceItem({
            itemId: persistedDraft.entityId,
            kind: "entity",
          })
        }
        proposedEntitySubgraph={proposedEntitySubgraph}
      />
    );
  },
);
