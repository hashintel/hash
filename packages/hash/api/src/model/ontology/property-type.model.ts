import { AxiosError } from "axios";
import { PropertyType } from "@blockprotocol/type-system-web";

import {
  GraphApi,
  PersistedPropertyType,
  UpdatePropertyTypeRequest,
} from "@hashintel/hash-graph-client";

import { DataTypeModel, PropertyTypeModel } from "../index";
import { extractBaseUri, generateTypeId } from "../util";
import { getNamespaceOfAccountOwner } from "./util";

type PropertyTypeModelConstructorParams = {
  ownedById: string;
  schema: PropertyType;
};

/**
 * @class {@link PropertyTypeModel}
 */
export default class {
  ownedById: string;

  schema: PropertyType;

  constructor({ schema, ownedById }: PropertyTypeModelConstructorParams) {
    this.ownedById = ownedById;
    this.schema = schema;
  }

  static fromPersistedPropertyType({
    inner,
    metadata: { identifier },
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
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Create a property type.
   *
   * @param params.ownedById the id of the owner of the property type
   * @param params.schema a `PropertyType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      schema: Omit<PropertyType, "$id">;
    },
  ): Promise<PropertyTypeModel> {
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: params.ownedById,
    });

    const propertyTypeId = generateTypeId({
      namespace,
      kind: "property-type",
      title: params.schema.title,
    });
    const fullPropertyType = { $id: propertyTypeId, ...params.schema };

    const { data: identifier } = await graphApi
      .createPropertyType({
        /**
         * @todo: replace uses of `accountId` with `ownedById` in the Graph API
         * @see https://app.asana.com/0/1202805690238892/1203063463721791/f
         */
        accountId: params.ownedById,
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
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Get all property types at their latest version.
   */
  static async getAllLatest(graphApi: GraphApi): Promise<PropertyTypeModel[]> {
    const resolved = await this.getAllLatestResolved(graphApi, {
      dataTypeQueryDepth: 0,
      propertyTypeQueryDepth: 0,
    });
    return resolved.map((propertyType) => propertyType.propertyType);
  }

  /**
   * Get all property types at their latest version with their references resolved as a list.
   *
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   */
  static async getAllLatestResolved(
    graphApi: GraphApi,
    params: {
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
    const { data: propertyTypeRootedSubgraphs } =
      await graphApi.getPropertyTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        query: {
          eq: [{ path: ["version"] }, { literal: "latest" }],
        },
      });

    return propertyTypeRootedSubgraphs.map((propertyTypeRootedSubgraph) => ({
      propertyType: PropertyTypeModel.fromPersistedPropertyType(
        propertyTypeRootedSubgraph.propertyType,
      ),
      referencedDataTypes: propertyTypeRootedSubgraph.referencedDataTypes.map(
        DataTypeModel.fromPersistedDataType,
      ),
      referencedPropertyTypes:
        propertyTypeRootedSubgraph.referencedPropertyTypes.map(
          PropertyTypeModel.fromPersistedPropertyType,
        ),
    }));
  }

  /**
   * Get a property type by its versioned URI.
   *
   * @param params.propertyTypeId the unique versioned URI for a property type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      propertyTypeId: string;
    },
  ): Promise<PropertyTypeModel> {
    const { propertyTypeId } = params;
    const { data: persistedPropertyType } = await graphApi.getPropertyType(
      propertyTypeId,
    );

    return PropertyTypeModel.fromPersistedPropertyType(persistedPropertyType);
  }

  /**
   * Get a property type by its versioned URI.
   *
   * @param params.propertyTypeId the unique versioned URI for a property type.
   * @param params.dataTypeQueryDepth recursion depth to use to resolve data types
   * @param params.propertyTypeQueryDepth recursion depth to use to resolve property types
   */
  static async getResolved(
    graphApi: GraphApi,
    params: {
      propertyTypeId: string;
      dataTypeQueryDepth: number;
      propertyTypeQueryDepth: number;
    },
  ): Promise<{
    propertyType: PropertyTypeModel;
    referencedDataTypes: DataTypeModel[];
    referencedPropertyTypes: PropertyTypeModel[];
  }> {
    const { data: propertyTypeRootedSubgraphs } =
      await graphApi.getPropertyTypesByQuery({
        dataTypeQueryDepth: params.dataTypeQueryDepth,
        propertyTypeQueryDepth: params.propertyTypeQueryDepth,
        query: {
          eq: [{ path: ["versionedUri"] }, { literal: params.propertyTypeId }],
        },
      });
    const propertyTypeRootedSubgraph = propertyTypeRootedSubgraphs.pop();
    if (propertyTypeRootedSubgraph === undefined) {
      throw new Error(
        `Unable to retrieve property type for URI: ${params.propertyTypeId}`,
      );
    }

    return {
      propertyType: PropertyTypeModel.fromPersistedPropertyType(
        propertyTypeRootedSubgraph.propertyType,
      ),
      referencedDataTypes: propertyTypeRootedSubgraph.referencedDataTypes.map(
        DataTypeModel.fromPersistedDataType,
      ),
      referencedPropertyTypes:
        propertyTypeRootedSubgraph.referencedPropertyTypes.map(
          PropertyTypeModel.fromPersistedPropertyType,
        ),
    };
  }

  /**
   * Update a property type.
   *
   * @param params.schema a `PropertyType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      schema: Omit<PropertyType, "$id">;
    },
  ): Promise<PropertyTypeModel> {
    const { schema } = params;
    const updateArguments: UpdatePropertyTypeRequest = {
      /**
       * @todo: let caller update who owns the type, or create new method dedicated to changing the owner of the type
       * @see https://app.asana.com/0/1202805690238892/1203063463721793/f
       *
       * @todo: replace uses of `accountId` with `ownedById` in the Graph API
       * @see https://app.asana.com/0/1202805690238892/1203063463721791/f
       */
      accountId: this.ownedById,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updatePropertyType(
      updateArguments,
    );

    return new PropertyTypeModel({
      schema: { ...schema, $id: identifier.uri },
      ownedById: identifier.ownedById,
    });
  }

  get baseUri() {
    return extractBaseUri(this.schema.$id);
  }
}
