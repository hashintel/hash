import { AxiosError } from "axios";

import {
  GraphApi,
  OntologyElementMetadata,
  PropertyTypeWithMetadata,
  UpdatePropertyTypeRequest,
} from "@hashintel/hash-graph-client";
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

  get schema(): PropertyType {
    /**
     * @todo: remove this casting when we update the type system package
     * @see https://app.asana.com/0/1201095311341924/1203259817761581/f
     */
    return this.propertyType.schema as PropertyType;
  }

  get metadata(): OntologyElementMetadata {
    return this.propertyType.metadata;
  }

  constructor({ propertyType }: PropertyTypeModelConstructorParams) {
    this.propertyType = propertyType;
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
      persistedPropertyType,
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
      typeToUpdate: this.schema.$id,
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

  get baseUri() {
    return extractBaseUri(this.schema.$id);
  }
}
