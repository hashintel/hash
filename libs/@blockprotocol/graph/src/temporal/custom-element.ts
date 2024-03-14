import { LitElement } from "lit";

import type {
  BlockGraphProperties,
  Entity,
  EntityPropertiesObject,
  LinkEntityAndRightEntity,
} from "./main.js";
import { GraphBlockHandler } from "./main.js";
import { getOutgoingLinkAndTargetEntities, getRoots } from "./stdlib.js";

export interface BlockElementBase<
  RootEntity extends Entity = Entity,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- this is used in the class definition
  RootEntityLinkedEntities extends
    LinkEntityAndRightEntity[] = LinkEntityAndRightEntity[],
> extends LitElement,
    BlockGraphProperties<RootEntity> {}

/**
 * A class to use as a base for implementing Block Protocol blocks as custom elements.
 * This class handles establishing communication with the embedding application.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class BlockElementBase<
  RootEntity,
  RootEntityLinkedEntities,
> extends LitElement {
  /**
   * The 'graphModule' is a handler for sending messages to the embedding application, e.g. 'graphModule.updateEntity'
   * It starts off undefined and will be available once the initial exchange of messages has taken place (handled internally)
   * @see https://blockprotocol.org/spec/graph#message-definitions for a full list of available messages
   */
  protected graphModule?: GraphBlockHandler;
  protected blockEntity?: RootEntity;
  protected linkedEntities?: LinkEntityAndRightEntity[];

  /**
   * The properties sent to the block represent the messages sent automatically from the application to the block.
   * All block <> application messages are split into modules, and so is this property object.
   */
  static properties = {
    /**
     * The 'graph' object contains messages sent under the graph module from the app to the block.
     * They are sent on initialization and again when the application has new values to send.
     * One such message is 'graph.blockEntitySubgraph', which is a graph rooted at the block entity.
     * @see https://blockprotocol.org/spec/graph#message-definitions for a full list
     */
    graph: { type: Object },
  };

  connectedCallback() {
    super.connectedCallback();
    if (!this.graphModule || this.graphModule.destroyed) {
      this.graphModule = new GraphBlockHandler({
        element: this,
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.graphModule && !this.graphModule.destroyed) {
      this.graphModule.destroy();
    }
  }

  /**
   * A helper method that returns the root entity from blockEntitySubgraph,
   * i.e. the 'block entity'
   */
  getBlockEntity() {
    const blockEntity = getRoots(this.graph.blockEntitySubgraph)[0];
    if (!blockEntity) {
      throw new Error(
        "Cannot update self: no root entity on graph.blockEntitySubgraph passed to block",
      );
    }

    return blockEntity;
  }

  /**
   * A helper method that returns the entities linked from the root entity
   * of blockEntitySubgraph, i.e. the 'block entity'
   */
  getLinkedEntities() {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check in case being consumed as JS / to catch bugs
    if (!this.graph || !this.graph.blockEntitySubgraph) {
      throw new Error("graph.blockEntitySubgraph was not passed to block.");
    }

    return getOutgoingLinkAndTargetEntities<RootEntityLinkedEntities>(
      this.graph.blockEntitySubgraph,
      this.getBlockEntity().metadata.recordId.entityId,
    );
  }

  /**
   * A helper method to update the properties of the entity loaded into the block, i.e. this.graph.blockEntity
   * @param properties the properties object to assign to the entity, which will overwrite the existing object
   */
  protected updateSelfProperties(properties: EntityPropertiesObject) {
    if (!this.graphModule) {
      throw new Error(
        "Cannot updateSelfProperties – graphModule not yet connected.",
      );
    }

    const blockEntity = this.getBlockEntity();

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check in case being consumed as JS / to catch bugs
    if (!blockEntity) {
      throw new Error(
        "Cannot update self: no root entity on graph.blockEntitySubgraph passed to block",
      );
    }

    return this.graphModule.updateEntity({
      data: {
        entityId: blockEntity.metadata.recordId.entityId,
        entityTypeId: blockEntity.metadata.entityTypeId,
        properties,
        leftToRightOrder: blockEntity.linkData?.leftToRightOrder,
        rightToLeftOrder: blockEntity.linkData?.rightToLeftOrder,
      },
    });
  }
}
