import { AxiosError } from "axios";

import { EntityType } from "@blockprotocol/type-system-web";
import {
  GraphApi,
  PersistedEntityType,
  UpdateEntityTypeRequest,
} from "@hashintel/hash-graph-client";

import {
  EntityTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
  DataTypeModel,
} from "../index";
import { generateTypeId } from "../util";
import dataTypeModel from "./data-type.model";
import linkTypeModel from "./link-type.model";
import { getNamespaceOfAccountOwner } from "./util";

export type EntityTypeModelConstructorParams = {
  ownedById: string;
  schema: EntityType;
};

export type EntityTypeModelCreateParams = {
  ownedById: string;
  schema: Omit<EntityType, "$id">;
};

/**
 * @class {@link EntityTypeModel}
 */
export default class {
  ownedById: string;

  schema: EntityType;

  constructor({ schema, ownedById }: EntityTypeModelConstructorParams) {
    this.ownedById = ownedById;
    this.schema = schema;
  }

  static fromPersistedEntityType({
    inner,
    identifier,
  }: PersistedEntityType): EntityTypeModel {
    /**
     * @todo and a warning, these type casts are here to compensate for
     *   the differences between the Graph API package and the
     *   type system package.
     *
     *   The type system package can be considered the source of truth in
     *   terms of the shape of values returned from the API, but the API
     *   client is unable to be given as type package types - it generates
     *   its own types.
     *   https://app.asana.com/0/1202805690238892/1202892835843657/f
     */
    return new EntityTypeModel({
      schema: inner as EntityType,
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Create an entity type.
   *
   * @param params.ownedById - the id of the owner of the entity type
   * @param params.schema - the `EntityType`
   */
  static async create(
    graphApi: GraphApi,
    params: EntityTypeModelCreateParams,
  ): Promise<EntityTypeModel> {
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: params.ownedById,
    });

    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.schema.title,
    });
    const fullEntityType = { $id: entityTypeId, ...params.schema };

    const { data: identifier } = await graphApi
      .createEntityType({
        /**
         * @todo: replace uses of `accountId` with `ownedById` in the Graph API
         * @see [ADD ASANA LINK]
         */
        accountId: params.ownedById,
        schema: fullEntityType,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `entity type with the same URI already exists. [URI=${fullEntityType.$id}]`
            : `[${err.code}] couldn't create entity type: ${err.response?.data}.`,
        );
      });

    return new EntityTypeModel({
      schema: fullEntityType,
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Get all entity types at their latest version.
   */
  static async getAllLatest(graphApi: GraphApi): Promise<EntityTypeModel[]> {
    /**
     * @todo: get all latest entity types in specified account.
     *   This may mean implicitly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: persistedEntityTypes } =
      await graphApi.getLatestEntityTypes();

    return persistedEntityTypes.map(EntityTypeModel.fromPersistedEntityType);
  }

  /**
   * Get all entity types at their latest version with their references resolved as a list.
   *
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   * @param params.linkTypeQueryDepth recursion depth to use to resolve link types
   * @param params.entityTypeQueryDepth recursion depth to use to resolve entity types
   */
  static async getAllLatestResolved(
    graphApi: GraphApi,
    params: {
      dataTypeQueryDepth: number;
      propertyTypeQueryDepth: number;
      linkTypeQueryDepth: number;
      entityTypeQueryDepth: number;
    },
  ): Promise<
    {
      entityType: EntityTypeModel;
      referencedDataTypes: dataTypeModel[];
      referencedPropertyTypes: PropertyTypeModel[];
      referencedLinkTypes: LinkTypeModel[];
      referencedEntityTypes: EntityTypeModel[];
    }[]
  > {
    /**
     * @todo: get all latest entity types in specified account.
     *   This may mean implicitly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: entityTypeRootedSubgraphs } =
      await graphApi.getEntityTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        linkTypeQueryDepth: params.linkTypeQueryDepth,
        entityTypeQueryDepth: params.entityTypeQueryDepth,
        query: {
          eq: [{ path: ["version"] }, { literal: "latest" }],
        },
      });

    return entityTypeRootedSubgraphs.map((entityTypeRootedSubgraph) => ({
      entityType: EntityTypeModel.fromPersistedEntityType(
        entityTypeRootedSubgraph.entityType,
      ),
      referencedDataTypes: entityTypeRootedSubgraph.referencedDataTypes.map(
        DataTypeModel.fromPersistedDataType,
      ),
      referencedPropertyTypes:
        entityTypeRootedSubgraph.referencedPropertyTypes.map(
          PropertyTypeModel.fromPersistedPropertyType,
        ),
      referencedLinkTypes: entityTypeRootedSubgraph.referencedLinkTypes.map(
        linkTypeModel.fromPersistedLinkType,
      ),
      referencedEntityTypes: entityTypeRootedSubgraph.referencedEntityTypes.map(
        EntityTypeModel.fromPersistedEntityType,
      ),
    }));
  }

  /**
   * Get an entity type by its versioned URI.
   *
   * @param params.entityTypeId the unique versioned URI for an entity type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      entityTypeId: string;
    },
  ): Promise<EntityTypeModel> {
    const { entityTypeId } = params;
    const { data: persistedEntityType } = await graphApi.getEntityType(
      entityTypeId,
    );

    return EntityTypeModel.fromPersistedEntityType(persistedEntityType);
  }

  /**
   * Get an entity type by its versioned URI.
   *
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   * @param params.linkTypeQueryDepth recursion depth to use to resolve link types
   * @param params.entityTypeQueryDepth recursion depth to use to resolve entity types
   */
  static async getResolved(
    graphApi: GraphApi,
    params: {
      entityTypeId: string;
      dataTypeQueryDepth: number;
      propertyTypeQueryDepth: number;
      linkTypeQueryDepth: number;
      entityTypeQueryDepth: number;
    },
  ): Promise<{
    entityType: EntityTypeModel;
    referencedDataTypes: dataTypeModel[];
    referencedPropertyTypes: PropertyTypeModel[];
    referencedLinkTypes: LinkTypeModel[];
    referencedEntityTypes: EntityTypeModel[];
  }> {
    const { data: propertyTypeRootedSubgraphs } =
      await graphApi.getEntityTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        linkTypeQueryDepth: params.linkTypeQueryDepth,
        entityTypeQueryDepth: params.entityTypeQueryDepth,
        query: {
          eq: [{ path: ["versionedUri"] }, { literal: params.entityTypeId }],
        },
      });
    const entityTypeRootedSubgraph = propertyTypeRootedSubgraphs.pop();
    if (entityTypeRootedSubgraph === undefined) {
      throw new Error(
        `Unable to retrieve property type for URI: ${params.entityTypeId}`,
      );
    }

    return {
      entityType: EntityTypeModel.fromPersistedEntityType(
        entityTypeRootedSubgraph.entityType,
      ),
      referencedDataTypes: entityTypeRootedSubgraph.referencedDataTypes.map(
        DataTypeModel.fromPersistedDataType,
      ),
      referencedPropertyTypes:
        entityTypeRootedSubgraph.referencedPropertyTypes.map(
          PropertyTypeModel.fromPersistedPropertyType,
        ),
      referencedLinkTypes: entityTypeRootedSubgraph.referencedLinkTypes.map(
        LinkTypeModel.fromPersistedLinkType,
      ),
      referencedEntityTypes: entityTypeRootedSubgraph.referencedEntityTypes.map(
        EntityTypeModel.fromPersistedEntityType,
      ),
    };
  }

  /**
   * Update an entity type.
   *
   * @param params.schema an `EntityType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      schema: Omit<EntityType, "$id">;
    },
  ): Promise<EntityTypeModel> {
    const { schema } = params;
    const updateArguments: UpdateEntityTypeRequest = {
      /**
       * @todo: let caller update who owns the type, or create new method dedicated to changing the owner of the type
       *
       * @todo: replace uses of `accountId` with `ownedById` in the Graph API
       * @see [ADD ASANA LINK]
       */
      accountId: this.ownedById,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updateEntityType(
      updateArguments,
    );

    return new EntityTypeModel({
      schema: { ...schema, $id: identifier.uri },
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Get all outgoing link types of the entity type.
   */
  async getOutgoingLinkTypes(graphApi: GraphApi): Promise<LinkTypeModel[]> {
    const linkTypeIds = Object.keys(this.schema.links ?? {});

    return await Promise.all(
      linkTypeIds.map((linkTypeId) =>
        LinkTypeModel.get(graphApi, { linkTypeId }),
      ),
    );
  }

  /**
   * Whether an outgoing link is ordered or not.
   *
   * @todo: deprecate this method when the Graph API can be relied upon for schema validation
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param params.outgoingLinkType - the outgoing link type for which to check whether it is ordered
   */
  isOutgoingLinkOrdered(params: { outgoingLinkType: LinkTypeModel }) {
    const { outgoingLinkType } = params;

    const outgoingLinkDefinition = Object.entries(this.schema.links ?? {}).find(
      ([linkTypeId]) => linkTypeId === outgoingLinkType.schema.$id,
    )?.[1];

    if (!outgoingLinkDefinition) {
      throw new Error("Link is not an outgoing link on this entity");
    }

    if (
      typeof outgoingLinkDefinition === "object" &&
      "type" in outgoingLinkDefinition &&
      outgoingLinkDefinition.type === "array"
    ) {
      return outgoingLinkDefinition.ordered ?? false;
    }

    return false;
  }

  /**
   * Get all property types of the entity type.
   */
  async getPropertyTypes(graphApi: GraphApi): Promise<PropertyTypeModel[]> {
    const propertyTypeIds = Object.entries(this.schema.properties).map(
      ([property, valueOrArray]) => {
        if ("$ref" in valueOrArray) {
          return valueOrArray.$ref;
        } else if ("items" in valueOrArray) {
          return valueOrArray.items.$ref;
        } else {
          throw new Error(
            `unexpected format for property ${property}: ${JSON.stringify(
              valueOrArray,
            )}`,
          );
        }
      },
    );

    return await Promise.all(
      propertyTypeIds.map((propertyTypeId) =>
        PropertyTypeModel.get(graphApi, {
          propertyTypeId,
        }),
      ),
    );
  }
}
