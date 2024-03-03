import core from "@blockprotocol/core";

import {
  GetEntityData as GetEntityDataGeneral,
  QueryEntitiesData as QueryEntitiesDataGeneral,
} from "../shared/types/entity.js";
/**
 * There's an issue when importing useGraphEmbedderModule from @blockprotocol/graph/react in hashintel/hash:
 * NextJS's output file tracing does not include graph-module.json, and yet an import statement for it is preserved.
 * This leads to a 'module cannot be found error'. For now, commenting out the import of the JSON from this file.
 * @todo restore this when module resolution issue resolved
 * @see https://app.asana.com/0/1202542409311090/1202614421149286/f
 */
// import graphModuleJson from "./graph-module.json" assert { type: "json" };
import {
  CreateEntityData,
  CreateResourceError,
  DataTypeRootType,
  DeleteEntityData,
  Entity,
  EntityPropertiesObject,
  EntityRootType,
  EntityTypeRootType,
  GetDataTypeData,
  GetEntityTypeData,
  GetPropertyTypeData,
  GraphBlockMessageCallbacks,
  GraphBlockMessages,
  PropertyTypeRootType,
  QueryDataTypesData,
  QueryDataTypesResult,
  QueryEntitiesResult,
  QueryEntityTypesData,
  QueryEntityTypesResult,
  QueryPropertyTypesData,
  QueryPropertyTypesResult,
  ReadOrModifyResourceError,
  Subgraph,
  UpdateEntityData,
  UploadFileData,
  UploadFileReturn,
} from "./main.js";

// @todo roll-up seems to be having trouble with import { ModuleLoader } from "@blockprotocol/core";
const { ModuleHandler } = core;

/**
 * Creates a handler for the graph module for the block.
 * Register callbacks in the constructor or afterwards using the 'on' method to react to messages from the embedder.
 * Call the relevant methods to send messages to the embedder.
 */
export class GraphBlockHandler
  extends ModuleHandler
  implements
    Omit<
      GraphBlockMessages,
      | "createEntityType"
      | "updateEntityType"
      | "createPropertyType"
      | "updatePropertyType"
    >
{
  constructor({
    callbacks,
    element,
  }: {
    callbacks?: Partial<GraphBlockMessageCallbacks>;
    element?: HTMLElement | null;
  }) {
    super({ element, callbacks, moduleName: "graph", sourceType: "block" });
  }

  getInitPayload(): Record<string, any> {
    // there are no block messages which are sentOnInitialization in the graph module
    return {};
  }

  /**
   * Registers multiple callbacks at once.
   * Useful for bulk updates to callbacks after the module is first initialised.
   */
  registerCallbacks(callbacks: Partial<GraphBlockMessageCallbacks>) {
    super.registerCallbacks(callbacks);
  }

  /**
   * Removes multiple callbacks at once.
   * Useful when replacing previously registered callbacks
   */
  removeCallbacks(callbacks: Partial<GraphBlockMessageCallbacks>) {
    super.removeCallbacks(callbacks);
  }

  /**
   * Call the provided function when the named message is received, passing the data/errors object from the message.
   * If the named message expects a response, the callback should provide the expected data/errors object as the return.
   * @param messageName the message name to listen for
   * @param handlerFunction the function to call when the message is received, with the message data / errors
   */
  on<K extends keyof GraphBlockMessageCallbacks>(
    this: GraphBlockHandler,
    messageName: K,
    handlerFunction: GraphBlockMessageCallbacks[K],
  ) {
    // @todo restore this when module resolution issue resolved
    // @see https://app.asana.com/0/1202542409311090/1202614421149286/f
    // const expectedMessageSource = "embedder";
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

  // @todo automate creation of these methods from graph-module.json and types.ts

  createEntity<
    ValidProperties extends EntityPropertiesObject = EntityPropertiesObject,
  >({ data }: { data?: CreateEntityData & { properties: ValidProperties } }) {
    return this.sendMessage<Entity, CreateResourceError>({
      message: {
        messageName: "createEntity",
        data,
      },
      respondedToBy: "createEntityResponse", // @todo get these from graph-module.json
    });
  }

  updateEntity<
    ValidProperties extends EntityPropertiesObject = EntityPropertiesObject,
  >({ data }: { data?: UpdateEntityData & { properties: ValidProperties } }) {
    return this.sendMessage<Entity, ReadOrModifyResourceError>({
      message: {
        messageName: "updateEntity",
        data,
      },
      respondedToBy: "updateEntityResponse",
    });
  }

  deleteEntity({ data }: { data?: DeleteEntityData }) {
    // @todo fix this 'any'
    return this.sendMessage<any, ReadOrModifyResourceError>({
      message: {
        messageName: "deleteEntity",
        data,
      },
      respondedToBy: "deleteEntityResponse",
    });
  }

  getEntity({ data }: { data?: GetEntityDataGeneral<boolean> }) {
    return this.sendMessage<
      Subgraph<EntityRootType>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "getEntity",
        data,
      },
      respondedToBy: "getEntityResponse",
    });
  }

  queryEntities({ data }: { data?: QueryEntitiesDataGeneral<boolean> }) {
    return this.sendMessage<
      QueryEntitiesResult<Subgraph<EntityRootType>>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "queryEntities",
        data,
      },
      respondedToBy: "queryEntitiesResponse",
    });
  }

  /** @todo - Add Type System mutation methods */
  // createEntityType({ data }: { data?: CreateEntityTypeData }) {
  //   return this.sendMessage<EntityType, CreateResourceError>({
  //     message: {
  //       messageName: "createEntityType",
  //       data,
  //     },
  //     respondedToBy: "createEntityTypeResponse", // @todo get this from graph-module.json
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

  getEntityType({ data }: { data?: GetEntityTypeData }) {
    return this.sendMessage<
      Subgraph<EntityTypeRootType>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "getEntityType",
        data,
      },
      respondedToBy: "getEntityTypeResponse",
    });
  }

  queryEntityTypes({ data }: { data?: QueryEntityTypesData }) {
    return this.sendMessage<
      QueryEntityTypesResult<Subgraph<EntityTypeRootType>>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "queryEntityTypes",
        data,
      },
      respondedToBy: "queryEntityTypesResponse",
    });
  }

  getPropertyType({ data }: { data?: GetPropertyTypeData }) {
    return this.sendMessage<
      Subgraph<PropertyTypeRootType>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "getPropertyType",
        data,
      },
      respondedToBy: "getPropertyTypeResponse",
    });
  }

  queryPropertyTypes({ data }: { data?: QueryPropertyTypesData }) {
    return this.sendMessage<
      QueryPropertyTypesResult<Subgraph<PropertyTypeRootType>>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "queryPropertyTypes",
        data,
      },
      respondedToBy: "queryPropertyTypesResponse",
    });
  }

  getDataType({ data }: { data?: GetDataTypeData }) {
    return this.sendMessage<
      Subgraph<DataTypeRootType>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "getDataType",
        data,
      },
      respondedToBy: "getDataTypeResponse",
    });
  }

  queryDataTypes({ data }: { data?: QueryDataTypesData }) {
    return this.sendMessage<
      QueryDataTypesResult<Subgraph<DataTypeRootType>>,
      ReadOrModifyResourceError
    >({
      message: {
        messageName: "queryDataTypes",
        data,
      },
      respondedToBy: "queryDataTypesResponse",
    });
  }

  requestLinkedQuery() {
    return this.sendMessage<null, "NOT_IMPLEMENTED">({
      message: {
        messageName: "requestLinkedQuery",
        data: null,
      },
      respondedToBy: "requestLinkedQueryResponse",
    });
  }

  /** @todo - Reimplement linked queries */
  // createLinkedQuery({ data }: { data?: CreateLinkedQueryData }) {
  //   return this.sendMessage<LinkedQuery, CreateResourceError>({
  //     message: {
  //       messageName: "createLinkedQuery",
  //       data,
  //     },
  //     respondedToBy: "createLinkedQueryResponse",
  //   });
  // }
  //
  // updateLinkedQuery({ data }: { data?: UpdateLinkedQueryData }) {
  //   return this.sendMessage<LinkedQuery, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "updateLinkedQuery",
  //       data,
  //     },
  //     respondedToBy: "updateLinkedQueryResponse",
  //   });
  // }
  //
  // deleteLinkedQuery({ data }: { data?: DeleteLinkedQueryData }) {
  //   // @todo fix this 'any'
  //   return this.sendMessage<any, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "deleteLinkedQuery",
  //       data,
  //     },
  //     respondedToBy: "deleteLinkedQueryResponse",
  //   });
  // }
  //
  // getLinkedQuery({ data }: { data?: GetLinkedQueryData }) {
  //   return this.sendMessage<LinkedQuery, ReadOrModifyResourceError>({
  //     message: {
  //       messageName: "getLinkedQuery",
  //       data,
  //     },
  //     respondedToBy: "getLinkedQueryResponse",
  //   });
  // }

  uploadFile({ data }: { data?: UploadFileData }) {
    return this.sendMessage<UploadFileReturn, CreateResourceError>({
      message: {
        messageName: "uploadFile",
        data,
      },
      respondedToBy: "uploadFileResponse",
    });
  }
}
