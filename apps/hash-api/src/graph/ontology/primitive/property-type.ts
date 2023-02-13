import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import { UpdatePropertyTypeRequest } from "@local/hash-graph-client";
import { PropertyTypeWithoutId } from "@local/hash-graphql-shared/graphql/types";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
  OwnedById,
  PropertyTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph/main";
import { versionedUriFromComponents } from "@local/hash-subgraph/shared/type-system-patch";
import { getRoots } from "@local/hash-subgraph/stdlib/roots";
import { mapSubgraph } from "@local/hash-subgraph/temp";
import { mapOntologyMetadata } from "@local/hash-subgraph/temp/map-vertices";

import { NotFoundError } from "../../../lib/error";
import { ImpureGraphFunction, zeroedGraphResolveDepths } from "../..";
import { getNamespaceOfAccountOwner } from "./util";

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
    schema: PropertyTypeWithoutId;
    actorId: AccountId;
  },
  Promise<PropertyTypeWithMetadata>
> = async (ctx, params) => {
  const { ownedById, actorId } = params;

  const namespace = await getNamespaceOfAccountOwner(ctx, {
    ownerId: ownedById,
  });

  const propertyTypeId = generateTypeId({
    namespace,
    kind: "property-type",
    title: params.schema.title,
  });

  const schema = { $id: propertyTypeId, ...params.schema };

  const { graphApi } = ctx;

  const { data: metadata } = await graphApi.createPropertyType({
    ownedById,
    schema,
    actorId,
  });

  return { schema, metadata: mapOntologyMetadata(metadata) };
};

/**
 * Get a property type by its versioned URI.
 *
 * @param params.propertyTypeId the unique versioned URI for a property type.
 */
export const getPropertyTypeById: ImpureGraphFunction<
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
      timeProjection: {
        kernel: {
          axis: "transaction",
          timestamp: null,
        },
        image: {
          axis: "decision",
          start: null,
          end: null,
        },
      },
    })
    .then(
      ({ data }) =>
        mapSubgraph(data) as Subgraph<SubgraphRootTypes["propertyType"]>,
    );

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
 * @param params.propertyTypeId - the id of the property type that's being updated
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

  const mappedMetadata = mapOntologyMetadata(metadata);

  const { recordId } = mappedMetadata;

  return {
    schema: {
      ...schema,
      $id: versionedUriFromComponents(recordId.baseUri, recordId.version),
    },
    metadata: mappedMetadata,
  };
};
