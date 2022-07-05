import { ServiceHandler } from "@blockprotocol/core";

import serviceJsonDefinition from "./hook-service.json";
import { BlockHookMessageCallbacks, BlockHookMessages } from "./types";
/**
 * Creates a handler for the graph service for the block.
 * Register callbacks in the constructor or afterwards using the 'on' method to react to messages from the embedder.
 * Call the relevant methods to send messages to the embedder.
 */
export class HookBlockHandler
  extends ServiceHandler
  implements BlockHookMessages
{
  constructor({
    callbacks,
    element,
  }: {
    callbacks?: Partial<BlockHookMessageCallbacks>;
    element: HTMLElement;
  }) {
    super({ element, serviceName: "hook", sourceType: "block" });
    if (callbacks) {
      this.registerCallbacks(callbacks);
    }
    this.coreHandler.initialize();
  }

  getInitPayload(): Record<string, any> {
    // there are no block messages which are sentOnInitialization in the hook service
    return {};
  }

  // @todo what is this for
  on<K extends keyof BlockHookMessageCallbacks>(
    this: HookBlockHandler,
    messageName: K,
    handlerFunction: BlockHookMessageCallbacks[K],
  ) {
    const expectedMessageSource = "embedder";
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

  async node(value: unknown, node: HTMLElement | null) {
    if (node) {
      await this.sendMessage({
        message: {
          messageName: "node",
          data: { node, value },
        },
      });
    }
  }

  async render(value: unknown) {
    const result = await this.sendMessage({
      message: {
        messageName: "render",
        data: { value },
      },
      respondedToBy: "renderResponse",
    });

    return result.data;
  }

  // @todo automate creation of these methods from graph-service.json and types.ts
  //
  // createEntity({ data }: { data?: CreateEntityData }) {
  //   return this.sendMessage<Entity, CreateResourceError>({
  //     message: {
  //       messageName: "createEntity",
  //       data,
  //     },
  //     respondedToBy: "createEntityResponse", // @todo get these from graph-service.json
  //   });
  // }
  //
  // updateEntity({ data }: { data?: UpdateEntityData }) {
  //   return this.sendMessage<Entity, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "updateEntity",
  //       data,
  //     },
  //     respondedToBy: "updateEntityResponse",
  //   });
  // }
  //
  // deleteEntity({ data }: { data?: DeleteEntityData }) {
  //   // @todo fix this 'any'
  //   return this.sendMessage<any, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "deleteEntity",
  //       data,
  //     },
  //     respondedToBy: "deleteEntityResponse",
  //   });
  // }
  //
  // getEntity({ data }: { data?: GetEntityData }) {
  //   return this.sendMessage<Entity, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "getEntity",
  //       data,
  //     },
  //     respondedToBy: "getEntityResponse",
  //   });
  // }
  //
  // aggregateEntities({ data }: { data?: AggregateEntitiesData }) {
  //   return this.sendMessage<
  //     AggregateEntitiesResult<Entity>,
  //     ReadOrModifyResourceError
  //   >({
  //     message: {
  //       messageName: "aggregateEntities",
  //       data,
  //     },
  //     respondedToBy: "aggregateEntitiesResponse",
  //   });
  // }
  //
  // createEntityType({ data }: { data?: CreateEntityTypeData }) {
  //   return this.sendMessage<EntityType, CreateResourceError>({
  //     message: {
  //       messageName: "createEntityType",
  //       data,
  //     },
  //     respondedToBy: "createEntityTypeResponse", // @todo get this from graph-service.json
  //   });
  // }
  //
  // updateEntityType({ data }: { data?: UpdateEntityTypeData }) {
  //   return this.sendMessage<EntityType, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "updateEntityType",
  //       data,
  //     },
  //     respondedToBy: "updateEntityTypeResponse",
  //   });
  // }
  //
  // deleteEntityType({ data }: { data?: DeleteEntityTypeData }) {
  //   // @todo fix this 'any'
  //   return this.sendMessage<any, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "deleteEntityType",
  //       data,
  //     },
  //     respondedToBy: "deleteEntityTypeResponse",
  //   });
  // }
  //
  // getEntityType({ data }: { data?: GetEntityTypeData }) {
  //   return this.sendMessage<EntityType, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "getEntityType",
  //       data,
  //     },
  //     respondedToBy: "getEntityTypeResponse",
  //   });
  // }
  //
  // aggregateEntityTypes({ data }: { data?: AggregateEntityTypesData }) {
  //   return this.sendMessage<
  //     AggregateEntitiesResult<EntityType>,
  //     ReadOrModifyResourceError
  //   >({
  //     message: {
  //       messageName: "aggregateEntityTypes",
  //       data,
  //     },
  //     respondedToBy: "aggregateEntityTypesResponse",
  //   });
  // }
  //
  // createLink({ data }: { data?: CreateLinkData }) {
  //   return this.sendMessage<Link, CreateResourceError>({
  //     message: {
  //       messageName: "createLink",
  //       data,
  //     },
  //     respondedToBy: "createLinkResponse",
  //   });
  // }
  //
  // updateLink({ data }: { data?: UpdateLinkData }) {
  //   return this.sendMessage<Link, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "updateLink",
  //       data,
  //     },
  //     respondedToBy: "updateLinkResponse",
  //   });
  // }
  //
  // deleteLink({ data }: { data?: DeleteLinkData }) {
  //   // @todo fix this 'any'
  //   return this.sendMessage<any, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "deleteLink",
  //       data,
  //     },
  //     respondedToBy: "deleteLinkResponse",
  //   });
  // }
  //
  // getLink({ data }: { data?: GetLinkData }) {
  //   return this.sendMessage<Link, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "getLink",
  //       data,
  //     },
  //     respondedToBy: "getLinkResponse",
  //   });
  // }
  //
  // createLinkedAggregation({ data }: { data?: CreateLinkedAggregationData }) {
  //   return this.sendMessage<LinkedAggregation, CreateResourceError>({
  //     message: {
  //       messageName: "createLinkedAggregation",
  //       data,
  //     },
  //     respondedToBy: "createLinkedAggregationResponse",
  //   });
  // }
  //
  // updateLinkedAggregation({ data }: { data?: UpdateLinkedAggregationData }) {
  //   return this.sendMessage<LinkedAggregation, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "updateLinkedAggregation",
  //       data,
  //     },
  //     respondedToBy: "updateLinkedAggregationResponse",
  //   });
  // }
  //
  // deleteLinkedAggregation({ data }: { data?: DeleteLinkedAggregationData }) {
  //   // @todo fix this 'any'
  //   return this.sendMessage<any, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "deleteLinkedAggregation",
  //       data,
  //     },
  //     respondedToBy: "deleteLinkedAggregationResponse",
  //   });
  // }
  //
  // getLinkedAggregation({ data }: { data?: GetLinkedAggregationData }) {
  //   return this.sendMessage<LinkedAggregation, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "getLinkedAggregation",
  //       data,
  //     },
  //     respondedToBy: "getLinkedAggregationResponse",
  //   });
  // }
  //
  // uploadFile({ data }: { data?: UploadFileData }) {
  //   return this.sendMessage<UploadFileReturn, CreateResourceError>({
  //     message: {
  //       messageName: "uploadFile",
  //       data,
  //     },
  //     respondedToBy: "uploadFileResponse",
  //   });
  // }
}
