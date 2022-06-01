import {
  BlockProtocolEntity,
  BlockProtocolProps,
  BlockProtocolUpdateEntitiesAction,
} from "blockprotocol";

import { EmbedderServiceHandler } from "./embedder-service";
import { MessageCallback } from "./embedder-core";

type GraphCallbacks = {
  updateEntity: MessageCallback<
    BlockProtocolUpdateEntitiesAction,
    BlockProtocolEntity
  >;
};

export class EmbedderGraphHandler extends EmbedderServiceHandler {
  private _blockEntity?: BlockProtocolEntity;
  private _linkedAggregations?: BlockProtocolProps["linkedAggregations"];
  private _linkedEntities?: BlockProtocolProps["linkedEntities"];
  private _linkGroups?: BlockProtocolProps["linkGroups"];

  constructor({
    blockEntity,
    callbacks,
    element,
    linkedAggregations,
    linkedEntities,
    linkGroups,
  }: {
    blockEntity?: BlockProtocolEntity;
    callbacks?: GraphCallbacks;
    element: HTMLElement;
    linkedAggregations?: BlockProtocolProps["linkedAggregations"];
    linkedEntities?: BlockProtocolProps["linkedEntities"];
    linkGroups?: BlockProtocolProps["linkGroups"];
  }) {
    super({ element, serviceName: "graph" });
    this._blockEntity = blockEntity;
    this._linkedAggregations = linkedAggregations;
    this._linkedEntities = linkedEntities;
    this._linkGroups = linkGroups;
    if (callbacks) {
      this.registerCallbacks(callbacks);
    }
  }

  on<K extends keyof GraphCallbacks>(
    this: EmbedderGraphHandler,
    messageName: K,
    handlerFunction: NonNullable<GraphCallbacks[K]>,
  ) {
    this.registerCallback({
      callback: handlerFunction,
      messageName,
    });
  }

  getInitPayload(
    this: EmbedderGraphHandler,
  ): Record<string, Record<string, any>> {
    return {
      graph: {
        blockEntity: this.blockEntity,
        linkedAggregations: this.linkedAggregations,
        linkedEntities: this.linkedEntities,
        linkGroups: this.linkGroups,
      },
    };
  }

  set blockEntity(entity: EmbedderGraphHandler["_blockEntity"]) {
    this._blockEntity = entity;
    void this.sendMessage({
      message: {
        name: "blockEntity",
        payload: this.blockEntity,
      },
    });
  }

  get blockEntity() {
    return this._blockEntity;
  }

  set linkedAggregations(
    aggregation: EmbedderGraphHandler["_linkedAggregations"],
  ) {
    this._linkedAggregations = aggregation;
    void this.sendMessage({
      message: {
        name: "linkedAggregations",
        payload: this.linkedAggregations,
      },
    });
  }

  get linkedAggregations() {
    return this._linkedAggregations;
  }

  set linkedEntities(entities: EmbedderGraphHandler["_linkedEntities"]) {
    this._linkedEntities = entities;
    void this.sendMessage({
      message: {
        name: "linkedEntities",
        payload: this.linkedEntities,
      },
    });
  }

  get linkedEntities() {
    return this._linkedEntities;
  }

  set linkGroups(linkGroups: EmbedderGraphHandler["_linkGroups"]) {
    this._linkGroups = linkGroups;
    void this.sendMessage({
      message: {
        name: "linkGroups",
        payload: this.linkGroups,
      },
    });
  }

  get linkGroups() {
    return this._linkGroups;
  }
}
