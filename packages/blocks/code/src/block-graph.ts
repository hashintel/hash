import {
  BlockProtocolEntity,
  BlockProtocolUpdateEntitiesAction,
} from "blockprotocol";

import { BlockServiceHandler } from "./block-service";
import { MessageCallback, MessageData } from "./block-core";

type GraphCallbacks = {
  blockEntity: MessageCallback<BlockProtocolEntity, void>;
};

export class BlockGraphHandler extends BlockServiceHandler {
  constructor({
    callbacks,
    element,
  }: {
    callbacks?: GraphCallbacks;
    element?: HTMLElement;
  }) {
    super({ element, serviceName: "graph" });
    if (callbacks) {
      this.registerCallbacks(callbacks);
    }
  }

  on<K extends keyof GraphCallbacks>(
    this: BlockGraphHandler,
    messageName: K,
    handlerFunction: NonNullable<GraphCallbacks[K]>,
  ) {
    this.registerCallback({
      callback: handlerFunction,
      messageName,
    });
  }

  updateEntity(
    this: BlockGraphHandler,
    payload: BlockProtocolUpdateEntitiesAction,
  ) {
    return this.sendMessage<BlockProtocolEntity>({
      message: {
        name: "updateEntity",
        payload,
      },
      respondedToBy: "updateEntityResponse",
    });
  }
}
