import { ServiceHandler } from "@blockprotocol/core";

import serviceJsonDefinition from "./hook-service.json";
import { EmbedderHookMessageCallbacks, EmbedderHookMessages } from "./types";

/**
 * Creates a handler for the graph service for the embedder.
 * Register callbacks in the constructor or afterwards using the 'on' method to react to messages from the block.
 * Call the relevant methods to send messages to the block.
 */
export class HookEmbedderHandler
  extends ServiceHandler
  implements EmbedderHookMessages
{
  constructor({
    callbacks,
    element,
  }: {
    callbacks?: Partial<EmbedderHookMessageCallbacks>;
    element: HTMLElement;
  }) {
    super({ element, serviceName: "hook", sourceType: "embedder" });
    if (callbacks) {
      this.registerCallbacks(callbacks);
    }
  }

  // @todo what is this for

  /**
   * Call the provided function when the named message is received, passing the data/errors object from the message.
   * If the named message expects a response, the callback should provide the expected data/errors object as the return.
   * @param messageName the message name to listen for
   * @param handlerFunction the function to call when the message is received, with the message data / errors
   */
  on<K extends keyof EmbedderHookMessageCallbacks>(
    this: HookEmbedderHandler,
    messageName: K,
    handlerFunction: NonNullable<EmbedderHookMessageCallbacks[K]>,
  ) {
    const expectedMessageSource = "block";
    const messageJsonDefinition = serviceJsonDefinition.messages.find(
      (message) =>
        message.messageName === messageName &&
        message.source === expectedMessageSource,
    );
    if (!messageJsonDefinition) {
      throw new Error(
        `No message with name '${messageName}' expected from ${expectedMessageSource}.`,
      );
    }
    this.registerCallback({
      callback: handlerFunction,
      messageName,
    });
  }

  getInitPayload(this: HookEmbedderHandler): Record<string, any> {
    return {};
  }

  // blockEntity({ data }: { data?: Entity }) {
  //   this._blockEntity = data;
  //   this.sendMessage({
  //     message: {
  //       messageName: "blockEntity",
  //       data: this._blockEntity,
  //     },
  //   });
  // }
}
