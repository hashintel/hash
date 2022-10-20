import { AxiosError } from "axios";

import { EntityType } from "@blockprotocol/type-system-web";
import {
  GraphApi,
  PersistedEntityType,
  UpdateEntityTypeRequest,
} from "@hashintel/hash-graph-client";
import { generateTypeId, types } from "@hashintel/hash-shared/types";
import { EntityTypeModel, PropertyTypeModel, LinkTypeModel } from "../index";
import { getNamespaceOfAccountOwner } from "./util";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

export type EntityTypeModelConstructorParams = {
  ownedById: string;
  schema: EntityType;
  createdById: string;
  updatedById: string;
  removedById?: string;
};

export type EntityTypeModelCreateParams = {
  ownedById: string;
  schema: Omit<EntityType, "$id">;
  actorId: string;
};

/**
 * @class {@link EntityTypeModel}
 */
export default class {
  ownedById: string;

  schema: EntityType;

  createdById: string;
  updatedById: string;
  removedById?: string;

  constructor({
    schema,
    ownedById,
    createdById,
    updatedById,
    removedById,
  }: EntityTypeModelConstructorParams) {
    this.ownedById = ownedById;
    this.schema = schema;

    this.createdById = createdById;
    this.updatedById = updatedById;
    this.removedById = removedById;
  }

  static fromPersistedEntityType({
    inner,
    metadata: { identifier, createdById, updatedById, removedById },
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
      createdById,
      updatedById,
      removedById,
    });
  }

  /**
   * Create an entity type.
   *
   * @param params.ownedById - the id of the account who owns the entity type
   * @param params.schema - the `EntityType`
   * @param params.actorId - the id of the account that is creating the entity type
   */
  static async create(
    graphApi: GraphApi,
    params: EntityTypeModelCreateParams,
  ): Promise<EntityTypeModel> {
    const { ownedById, actorId } = params;
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: params.ownedById,
    });

    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.schema.title,
    });
    const fullEntityType = { $id: entityTypeId, ...params.schema };

    const { data: metadata } = await graphApi
      .createEntityType({
        actorId,
        ownedById,
        schema: fullEntityType,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `entity type with the same URI already exists. [URI=${fullEntityType.$id}]`
            : `[${err.code}] couldn't create entity type: ${err.response?.data}.`,
        );
      });

    return EntityTypeModel.fromPersistedEntityType({
      inner: fullEntityType,
      metadata,
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
   * Update an entity type.
   *
   * @param params.schema - the updated `EntityType`
   * @param params.actorId - the id of the account that is updating the entity type
   */
  async update(
    graphApi: GraphApi,
    params: {
      schema: Omit<EntityType, "$id">;
      actorId: string;
    },
  ): Promise<EntityTypeModel> {
    const { schema, actorId } = params;
    const updateArguments: UpdateEntityTypeRequest = {
      actorId,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: metadata } = await graphApi.updateEntityType(updateArguments);

    const { identifier } = metadata;

    return EntityTypeModel.fromPersistedEntityType({
      inner: { ...schema, $id: identifier.uri },
      metadata,
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
      throw new Error(
        `Link type with ID = '${outgoingLinkType.schema.$id}' is not an outgoing link on entity type with ID = '${this.schema.$id}'`,
      );
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

  /**
   * Get the workspace type name of this entity type if it is a workspace type. Otherwise return `undefined`.
   */
  get workspaceTypeName(): string | undefined {
    for (const [key, workspaceEntityType] of Object.entries(
      WORKSPACE_TYPES.entityType,
    ) as [keyof typeof WORKSPACE_TYPES.entityType, EntityTypeModel][]) {
      if (workspaceEntityType.schema.$id === this.schema.$id) {
        return types.entityType[key].title;
      }
    }

    return undefined;
  }
}
