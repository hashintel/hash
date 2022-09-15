import { AxiosError } from "axios";

import { EntityType } from "@blockprotocol/type-system-web";
import {
  GraphApi,
  PersistedEntityType,
  UpdateEntityTypeRequest,
} from "@hashintel/hash-graph-client";
import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";

import {
  EntityTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
  UserModel,
  DataTypeModel,
} from "../index";
import {
  generateSchemaUri,
  splitVersionedUri,
  workspaceAccountId,
} from "../util";
import dataTypeModel from "./data-type.model";
import linkTypeModel from "./link-type.model";

export type EntityTypeModelConstructorParams = {
  accountId: string;
  schema: EntityType;
};

export type EntityTypeModelCreateParams = {
  accountId: string;
  schema: Omit<EntityType, "$id">;
};

/**
 * @class {@link EntityTypeModel}
 */
export default class {
  accountId: string;

  schema: EntityType;

  constructor({ schema, accountId }: EntityTypeModelConstructorParams) {
    this.accountId = accountId;
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
      accountId: identifier.ownedById,
    });
  }

  /**
   * Create an entity type.
   *
   * @param params.accountId the accountId of the account creating the entity type
   * @param params.schema an `EntityType`
   */
  static async create(
    graphApi: GraphApi,
    params: EntityTypeModelCreateParams,
  ): Promise<EntityTypeModel> {
    /** @todo - get rid of this hack for the root account */
    const namespace =
      params.accountId === workspaceAccountId
        ? WORKSPACE_ACCOUNT_SHORTNAME
        : (
            await UserModel.getUserByAccountId(graphApi, {
              accountId: params.accountId,
            })
          )?.getShortname();

    if (namespace == null) {
      throw new Error(
        `failed to get namespace for account: ${params.accountId}`,
      );
    }

    const entityTypeUri = generateSchemaUri({
      namespace,
      kind: "entity-type",
      title: params.schema.title,
    });
    const fullEntityType = { $id: entityTypeUri, ...params.schema };

    const { data: identifier } = await graphApi
      .createEntityType({
        accountId: params.accountId,
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
      accountId: identifier.ownedById,
    });
  }

  /**
   * Get all entity types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the entity types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<EntityTypeModel[]> {
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
   * @param params.accountId the accountId of the account creating the property type
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   * @param params.linkTypeQueryDepth recursion depth to use to resolve link types
   * @param params.entityTypeQueryDepth recursion depth to use to resolve entity types
   */
  static async getAllLatestResolved(
    graphApi: GraphApi,
    params: {
      accountId: string;
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
   * @param params.accountId the accountId of the account requesting the entity type
   * @param params.versionedUri the unique versioned URI for an entity type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      versionedUri: string;
    },
  ): Promise<EntityTypeModel> {
    const { versionedUri } = params;
    const { data: persistedEntityType } = await graphApi.getEntityType(
      versionedUri,
    );

    return EntityTypeModel.fromPersistedEntityType(persistedEntityType);
  }

  /**
   * Get an entity type by its versioned URI.
   *
   * @param params.accountId the accountId of the account requesting the entity type
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   * @param params.linkTypeQueryDepth recursion depth to use to resolve link types
   * @param params.entityTypeQueryDepth recursion depth to use to resolve entity types
   */
  static async getResolved(
    graphApi: GraphApi,
    params: {
      versionedUri: string;
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
    const { baseUri, version } = splitVersionedUri(params.versionedUri);
    const { data: propertyTypeRootedSubgraphs } =
      await graphApi.getEntityTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        linkTypeQueryDepth: params.linkTypeQueryDepth,
        entityTypeQueryDepth: params.entityTypeQueryDepth,
        query: {
          all: [
            { eq: [{ path: ["uri"] }, { literal: baseUri }] },
            { eq: [{ path: ["version"] }, { literal: version }] },
          ],
        },
      });
    const entityTypeRootedSubgraph = propertyTypeRootedSubgraphs.pop();
    if (entityTypeRootedSubgraph === undefined) {
      throw new Error(
        `Unable to retrieve property type for URI: ${params.versionedUri}`,
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
   * @param params.accountId the accountId of the account making the update
   * @param params.schema an `EntityType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: Omit<EntityType, "$id">;
    },
  ): Promise<EntityTypeModel> {
    const { accountId, schema } = params;
    const updateArguments: UpdateEntityTypeRequest = {
      accountId,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updateEntityType(
      updateArguments,
    );

    return new EntityTypeModel({
      schema: { ...schema, $id: identifier.uri },
      accountId: identifier.ownedById,
    });
  }

  /**
   * Get all outgoing link types of the entity type.
   */
  async getOutgoingLinkTypes(graphApi: GraphApi): Promise<LinkTypeModel[]> {
    const linkTypeVersionedUris = Object.keys(this.schema.links ?? {});

    return await Promise.all(
      linkTypeVersionedUris.map((versionedUri) =>
        LinkTypeModel.get(graphApi, {
          versionedUri,
        }),
      ),
    );
  }

  /**
   * Get all property types of the entity type.
   */
  async getPropertyTypes(graphApi: GraphApi): Promise<PropertyTypeModel[]> {
    const propertyTypeVersionedUris = Object.entries(
      this.schema.properties,
    ).map(([property, valueOrArray]) => {
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
    });

    return await Promise.all(
      propertyTypeVersionedUris.map((versionedUri) =>
        PropertyTypeModel.get(graphApi, {
          versionedUri,
        }),
      ),
    );
  }
}
