import { BlockProtocolEntity } from "blockprotocol";
import { MessageCallback } from "./block-core";

import { BlockServiceHandler } from "./block-service";

type GraphCallbacks = {
  blockEntity: MessageCallback<BlockProtocolEntity, void>;
};

export type HookServiceValue = {
  __hookServiceValueTag: true;
};

export class BlockHookHandler extends BlockServiceHandler {
  constructor({
    callbacks,
    element,
  }: {
    callbacks?: GraphCallbacks;
    element?: HTMLElement;
  }) {
    super({ element, serviceName: "hook" });
    if (callbacks) {
      this.registerCallbacks(callbacks);
    }
  }

  async render(value: HookServiceValue) {
    const result = await this.sendMessage({
      message: {
        name: "render",
        payload: {
          value,
        },
      },
      respondedToBy: "renderResponse",
    });

    return result.payload;
  }

  // on<K extends keyof GraphCallbacks>(
  //   this: BlockGraphHandler,
  //   messageName: K,
  //   handlerFunction: NonNullable<GraphCallbacks[K]>,
  // ) {
  //   this.registerCallback({
  //     callback: handlerFunction,
  //     messageName,
  //   });
  // }
  //
  // updateEntity(
  //   this: BlockGraphHandler,
  //   payload: BlockProtocolUpdateEntitiesAction,
  // ) {
  //   return this.sendMessage<BlockProtocolEntity>({
  //     message: {
  //       name: "updateEntity",
  //       payload,
  //     },
  //     respondedToBy: "updateEntityResponse",
  //   });
  // }
}
