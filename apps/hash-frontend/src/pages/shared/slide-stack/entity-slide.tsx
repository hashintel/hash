import type { EntityId } from "@local/hash-graph-types/entity";
import { memo } from "react";

import { Entity } from "../../@/[shortname]/entities/[entity-uuid].page/entity";
import type { EntityEditorProps } from "../../@/[shortname]/entities/[entity-uuid].page/entity/entity-editor";
import type { SlideItem } from "./types";

export type EntitySlideProps = {
  /**
   * The default outgoing link filters to apply to the links tables in the entity editor
   */
  defaultOutgoingLinkFilters?: EntityEditorProps["defaultOutgoingLinkFilters"];
  /**
   * Hide the link to open the entity in a new tab.
   */
  hideOpenInNew?: boolean;
  removeItem: () => void;
  /**
   * When the entity is updated, call this function with the updated entity's entityId.
   */
  replaceItem: (item: SlideItem) => void;
  entityId: EntityId;
};

export const EntitySlide = memo(
  ({
    defaultOutgoingLinkFilters,
    entityId,
    hideOpenInNew,
    removeItem,
    replaceItem,
  }: EntitySlideProps) => {
    return (
      <Entity
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
      />
    );
  },
);
