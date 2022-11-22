import { AxiosError } from "axios";

import {
  GraphApi,
  UpdatePropertyTypeRequest,
} from "@hashintel/hash-graph-client";
import {
  PropertyTypeWithMetadata,
  OntologyElementMetadata,
} from "@hashintel/hash-subgraph";
import { generateTypeId } from "@hashintel/hash-shared/types";
import { PropertyType } from "@blockprotocol/type-system-web";
import { PropertyTypeModel } from "../index";
import { extractBaseUri } from "../util";
import { getNamespaceOfAccountOwner } from "./util";

type PropertyTypeModelConstructorParams = {
  propertyType: PropertyTypeWithMetadata;
};

/**
 * @class {@link PropertyTypeModel}
 */
export default class {
  private propertyType: PropertyTypeWithMetadata;

  constructor({ propertyType }: PropertyTypeModelConstructorParams) {
    this.propertyType = propertyType;
  }

  getSchema(): PropertyType {
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
    return this.propertyType.schema as PropertyType;
  }

  getMetadata(): OntologyElementMetadata {
    return this.propertyType.metadata;
  }

  static fromPropertyTypeWithMetadata(
    propertyType: PropertyTypeWithMetadata,
  ): PropertyTypeModel {
    return new PropertyTypeModel({ propertyType });
  }

  /**
   * Create a property type.
   *
   * @param params.ownedById - the id of the account who owns the property type
   * @param params.schema - the `PropertyType`
   * @param params.actorId - the id of the account that is creating the property type
   */
  static async create(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      schema: Omit<PropertyType, "$id">;
      actorId: string;
    },
  ): Promise<PropertyTypeModel> {
    const { ownedById, actorId } = params;

    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: ownedById,
    });

    const propertyTypeId = generateTypeId({
      namespace,
      kind: "property-type",
      title: params.schema.title,
    });

    const schema = { $id: propertyTypeId, ...params.schema };

    const { data: metadata } = await graphApi
      .createPropertyType({
        ownedById,
        schema,
        actorId,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `property type with the same URI already exists. [URI=${schema.$id}]`
            : `[${err.code}] couldn't create property type: ${err.response?.data}.`,
        );
      });

    return PropertyTypeModel.fromPropertyTypeWithMetadata({
      schema,
      metadata,
    });
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

    return PropertyTypeModel.fromPropertyTypeWithMetadata(
      persistedPropertyType as PropertyTypeWithMetadata,
    );
  }

  /**
   * Update a property type.
   *
   * @param params.schema - the updated `PropertyType`
   * @param params.actorId - the id of the account that is updating the type
   */
  async update(
    graphApi: GraphApi,
    params: {
      schema: Omit<PropertyType, "$id">;
      actorId: string;
    },
  ): Promise<PropertyTypeModel> {
    const { schema, actorId } = params;
    const updateArguments: UpdatePropertyTypeRequest = {
      typeToUpdate: this.getSchema().$id,
      schema,
      actorId,
    };

    const { data: metadata } = await graphApi.updatePropertyType(
      updateArguments,
    );

    return PropertyTypeModel.fromPropertyTypeWithMetadata({
      schema: {
        ...schema,
        $id: `${metadata.editionId.baseId}/v/${metadata.editionId.version}`,
      },
      metadata,
    });
  }

  getBaseUri() {
    return extractBaseUri(this.getSchema().$id);
  }
}
