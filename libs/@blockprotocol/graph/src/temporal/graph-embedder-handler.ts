import { ModuleHandler } from "@blockprotocol/core";

// @todo restore this when an issue with module resolution has been resolved
// import graphModuleJson from "./graph-module.json" assert { type: "json" };
import type {
  EntityRootType,
  GraphEmbedderMessageCallbacks,
  GraphEmbedderMessages,
  Subgraph,
} from "./main.js";

/**
 * Creates a handler for the graph module for the embedder.
 * Register callbacks in the constructor or afterwards using the 'on' method to react to messages from the block.
 * Call the relevant methods to send messages to the block.
 */
export class GraphEmbedderHandler
  extends ModuleHandler
  implements GraphEmbedderMessages
{
  private _blockEntitySubgraph: Subgraph<EntityRootType>;
  // private _linkedQueries?: LinkedQueries;
  private _readonly?: boolean;

  constructor({
    blockEntitySubgraph,
    callbacks,
    element,
    // linkedQueries,
    readonly,
  }: {
    blockEntitySubgraph: Subgraph<EntityRootType>;
    callbacks?: Partial<GraphEmbedderMessageCallbacks>;
    element?: HTMLElement | null;
    // linkedQueries?: LinkedQueries;
    readonly?: boolean;
  }) {
    super({ element, callbacks, moduleName: "graph", sourceType: "embedder" });
    this._blockEntitySubgraph = blockEntitySubgraph;
    // this._linkedQueries = linkedQueries;
    this._readonly = readonly;
  }

  /**
   * Registers multiple callbacks at once.
   * Useful for bulk updates to callbacks after the module is first initialised.
   */
  registerCallbacks(callbacks: Partial<GraphEmbedderMessageCallbacks>) {
    super.registerCallbacks(callbacks);
  }

  /**
   * Removes multiple callbacks at once.
   * Useful when replacing previously registered callbacks
   */
  removeCallbacks(callbacks: Partial<GraphEmbedderMessageCallbacks>) {
    super.removeCallbacks(callbacks);
  }

  /**
   * Call the provided function when the named message is received, passing the data/errors object from the message.
   * If the named message expects a response, the callback should provide the expected data/errors object as the return.
   * @param messageName the message name to listen for
   * @param handlerFunction the function to call when the message is received, with the message data / errors
   */
  on<K extends keyof GraphEmbedderMessageCallbacks>(
    this: GraphEmbedderHandler,
    messageName: K,
    handlerFunction: NonNullable<GraphEmbedderMessageCallbacks[K]>,
  ) {
    // @todo restore this when module resolution issue resolved
    // @see https://app.asana.com/0/1202542409311090/1202614421149286/f
    // const expectedMessageSource = "block";
    // const messageJsonDefinition = graphModuleJson.messages.find(
    //   (message) =>
    //     message.messageName === messageName &&
    //     message.source === expectedMessageSource,
    // );
    // if (!messageJsonDefinition) {
    //   throw new Error(
    //     `No message with name '${messageName}' expected from ${expectedMessageSource}.`,
    //   );
    // }
    this.registerCallback({
      callback: handlerFunction,
      messageName,
    });
  }

  getInitPayload(this: GraphEmbedderHandler): Record<string, any> {
    return {
      blockEntitySubgraph: this._blockEntitySubgraph,
      // linkedQueries: this._linkedQueries,
      readonly: this._readonly,
    };
  }

  blockEntitySubgraph({ data }: { data?: Subgraph<EntityRootType> }) {
    if (!data) {
      throw new Error("'data' must be provided with blockEntitySubgraph");
    }
    this._blockEntitySubgraph = data;
    this.sendMessage({
      message: {
        messageName: "blockEntitySubgraph",
        data: this._blockEntitySubgraph,
      },
    });
  }

  // linkedQueries({ data }: { data?: LinkedQueries }) {
  //   this._linkedQueries = data;
  //   this.sendMessage({
  //     message: {
  //       messageName: "linkedQueries",
  //       data: this._linkedQueries,
  //     },
  //   });
  // }

  readonly({ data }: { data?: boolean }) {
    this._readonly = data;
    this.sendMessage({
      message: {
        messageName: "readonly",
        data: this._readonly,
      },
    });
  }
}
