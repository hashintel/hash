import {
  BlockProtocolEntity,
  BlockProtocolProps,
  BlockProtocolUpdateEntitiesAction,
} from "blockprotocol";

import { EmbedderServiceHandler } from "./embedder-service";
import { MessageCallback } from "./embedder-core";

// @todo don't duplicate this
export type HookServiceValue = {
  __hookServiceValueTag: true;
};

type HookCallbacks = {
  render: MessageCallback<{ value: HookServiceValue }, unknown>;
};

export class EmbedderHookService extends EmbedderServiceHandler {
  constructor({
    callbacks,
    element,
  }: {
    callbacks?: HookCallbacks;
    element: HTMLElement;
  }) {
    super({ element, serviceName: "hook" });
    if (callbacks) {
      this.registerCallbacks(callbacks);
    }
  }

  getInitPayload() {
    return {};
  }
}
