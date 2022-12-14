import { AxiosError } from "axios";
import { UpdatePropertyTypeRequest } from "@hashintel/hash-graph-client";
import {
  PropertyTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { AccountId, OwnedById } from "@hashintel/hash-shared/types";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { ImpureGraphFunction, zeroedGraphResolveDepths } from "../..";
import { getNamespaceOfAccountOwner } from "./util";
import { NotFoundError } from "../../../lib/error";

/**
 * Create a property type.
 *
 * @param params.ownedById - the id of the account who owns the property type
 * @param params.schema - the `PropertyType`
 * @param params.actorId - the id of the account that is creating the property type
 */
export const createPropertyType: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    schema: Omit<PropertyType, "$id">;
    actorId: AccountId;
  },
  Promise<PropertyTypeWithMetadata>
> = async ({ graphApi }, params) => {
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

  return { schema, metadata };
};

/**
 * Get a property type by its versioned URI.
 *
 * @param params.propertyTypeId the unique versioned URI for a property type.
 */
export const getPropertyType: ImpureGraphFunction<
  {
    propertyTypeId: VersionedUri;
  },
  Promise<PropertyTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { propertyTypeId } = params;
  const propertyTypeSubgraph = await graphApi
    .getPropertyTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: propertyTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
    })
    .then(({ data }) => data as Subgraph<SubgraphRootTypes["propertyType"]>);

  const [propertyType] = getRoots(propertyTypeSubgraph);

  if (!propertyType) {
    throw new NotFoundError(
      `Could not find property type with ID "${propertyTypeId}"`,
    );
  }

  return propertyType;
};

/**
 * Update a property type.
 *
 * @param params.schema - the updated `PropertyType`
 * @param params.actorId - the id of the account that is updating the type
 */
export const updatePropertyType: ImpureGraphFunction<
  {
    propertyTypeId: VersionedUri;
    schema: Omit<PropertyType, "$id">;
    actorId: AccountId;
  },
  Promise<PropertyTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { schema, actorId, propertyTypeId } = params;
  const updateArguments: UpdatePropertyTypeRequest = {
    typeToUpdate: propertyTypeId,
    schema,
    actorId,
  };

  const { data: metadata } = await graphApi.updatePropertyType(updateArguments);

  return {
    schema: {
      ...schema,
      $id: versionedUriFromComponents(
        metadata.editionId.baseId,
        metadata.editionId.version,
      ),
    },
    metadata,
  };
};
