import { AxiosError } from "axios";
import { PropertyType } from "@blockprotocol/type-system-web";

import {
  GraphApi,
  PersistedPropertyType,
  UpdatePropertyTypeRequest,
} from "@hashintel/hash-graph-client";
import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";

import { DataTypeModel, PropertyTypeModel, UserModel } from "../index";
import {
  extractBaseUri,
  generateSchemaUri,
  workspaceAccountId,
  splitVersionedUri,
} from "../util";

type PropertyTypeModelConstructorParams = {
  accountId: string;
  schema: PropertyType;
};

/**
 * @class {@link PropertyTypeModel}
 */
export default class {
  accountId: string;

  schema: PropertyType;

  constructor({ schema, accountId }: PropertyTypeModelConstructorParams) {
    this.accountId = accountId;
    this.schema = schema;
  }

  static fromPersistedPropertyType({
    inner,
    identifier,
  }: PersistedPropertyType): PropertyTypeModel {
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
    return new PropertyTypeModel({
      schema: inner as PropertyType,
      accountId: identifier.ownedById,
    });
  }

  /**
   * Create a property type.
   *
   * @param params.accountId the accountId of the account creating the property type
   * @param params.schema a `PropertyType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: Omit<PropertyType, "$id">;
    },
  ): Promise<PropertyTypeModel> {
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

    const propertyTypeUri = generateSchemaUri({
      namespace,
      kind: "property-type",
      title: params.schema.title,
    });
    const fullPropertyType = { $id: propertyTypeUri, ...params.schema };

    const { data: identifier } = await graphApi
      .createPropertyType({
        accountId: params.accountId,
        schema: fullPropertyType,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `property type with the same URI already exists. [URI=${fullPropertyType.$id}]`
            : `[${err.code}] couldn't create property type: ${err.response?.data}.`,
        );
      });

    return new PropertyTypeModel({
      schema: fullPropertyType,
      accountId: identifier.ownedById,
    });
  }

  /**
   * Get all property types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the property types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    params: {
      accountId: string;
    },
  ): Promise<PropertyTypeModel[]> {
    const resolved = await this.getAllLatestResolved(graphApi, {
      accountId: params.accountId,
      dataTypeQueryDepth: 0,
      propertyTypeQueryDepth: 0,
    });
    return resolved.map((propertyType) => propertyType.propertyType);
  }

  /**
   * Get all property types at their latest version with their references resolved as a list.
   *
   * @param params.accountId the accountId of the account creating the property type
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   */
  static async getAllLatestResolved(
    graphApi: GraphApi,
    params: {
      accountId: string;
      dataTypeQueryDepth: number;
      propertyTypeQueryDepth: number;
    },
  ): Promise<
    {
      propertyType: PropertyTypeModel;
      referencedDataTypes: DataTypeModel[];
      referencedPropertyTypes: PropertyTypeModel[];
    }[]
  > {
    /**
     * @todo: get all latest property types in specified account.
     *   This may mean implicitly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: propertyTypeSubgraphs } =
      await graphApi.getPropertyTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        query: {
          eq: [{ path: ["version"] }, { literal: "latest" }],
        },
      });

    return propertyTypeSubgraphs.map((propertyTypeSubgraph) => ({
      propertyType: PropertyTypeModel.fromPersistedPropertyType(
        propertyTypeSubgraph.propertyType,
      ),
      referencedDataTypes: propertyTypeSubgraph.referencedDataTypes.map(
        DataTypeModel.fromPersistedDataType,
      ),
      referencedPropertyTypes: propertyTypeSubgraph.referencedPropertyTypes.map(
        PropertyTypeModel.fromPersistedPropertyType,
      ),
    }));
  }

  /**
   * Get a property type by its versioned URI.
   *
   * @param params.versionedUri the unique versioned URI for a property type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      versionedUri: string;
    },
  ): Promise<PropertyTypeModel> {
    const { versionedUri } = params;
    const { data: persistedPropertyType } = await graphApi.getPropertyType(
      versionedUri,
    );

    return PropertyTypeModel.fromPersistedPropertyType(persistedPropertyType);
  }

  /**
   * Get a property type by its versioned URI.
   *
   * @param params.versionedUri the unique versioned URI for a property type.
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   */
  static async getResolved(
    graphApi: GraphApi,
    params: {
      versionedUri: string;
      dataTypeQueryDepth: number;
      propertyTypeQueryDepth: number;
    },
  ): Promise<{
    propertyType: PropertyTypeModel;
    referencedDataTypes: DataTypeModel[];
    referencedPropertyTypes: PropertyTypeModel[];
  }> {
    const { baseUri, version } = splitVersionedUri(params.versionedUri);
    const { data: propertyTypeSubgraphs } =
      await graphApi.getPropertyTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        query: {
          all: [
            { eq: [{ path: ["uri"] }, { literal: baseUri }] },
            { eq: [{ path: ["version"] }, { literal: version }] },
          ],
        },
      });
    const propertyTypeSubgraph = propertyTypeSubgraphs.pop();
    if (propertyTypeSubgraph === undefined) {
      throw new Error(
        `Unable to retrieve property type for URI: ${params.versionedUri}`,
      );
    }

    return {
      propertyType: PropertyTypeModel.fromPersistedPropertyType(
        propertyTypeSubgraph.propertyType,
      ),
      referencedDataTypes: propertyTypeSubgraph.referencedDataTypes.map(
        DataTypeModel.fromPersistedDataType,
      ),
      referencedPropertyTypes: propertyTypeSubgraph.referencedPropertyTypes.map(
        PropertyTypeModel.fromPersistedPropertyType,
      ),
    };
  }

  /**
   * Update a property type.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema a `PropertyType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: Omit<PropertyType, "$id">;
    },
  ): Promise<PropertyTypeModel> {
    const { accountId, schema } = params;
    const updateArguments: UpdatePropertyTypeRequest = {
      accountId,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updatePropertyType(
      updateArguments,
    );

    return new PropertyTypeModel({
      schema: { ...schema, $id: identifier.uri },
      accountId: identifier.ownedById,
    });
  }

  get baseUri() {
    return extractBaseUri(this.schema.$id);
  }
}
