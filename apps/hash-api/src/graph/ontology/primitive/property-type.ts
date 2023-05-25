import {
  PROPERTY_TYPE_META_SCHEMA,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  PropertyTypeStructuralQuery,
  UpdatePropertyTypeRequest,
} from "@local/hash-graph-client";
import { ConstructPropertyTypeParams } from "@local/hash-graphql-shared/graphql/types";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountId,
  OntologyElementMetadata,
  OntologyTypeRecordId,
  ontologyTypeRecordIdToVersionedUrl,
  OwnedById,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { NotFoundError } from "../../../lib/error";
import {
  currentTimeInstantTemporalAxes,
  ImpureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
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
    schema: ConstructPropertyTypeParams;
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

  const schema = {
    $schema: PROPERTY_TYPE_META_SCHEMA,
    kind: "propertyType" as const,
    $id: propertyTypeId,
    ...params.schema,
  };

  const { graphApi } = ctx;

  const { data: metadata } = await graphApi.createPropertyType({
    ownedById,
    schema,
    actorId,
  });

  return { schema, metadata: metadata as OntologyElementMetadata };
};

/**
 * Get property types by a structural query.
 *
 * @param params.query the structural query to filter property types by.
 */
export const getPropertyTypes: ImpureGraphFunction<
  {
    query: PropertyTypeStructuralQuery;
  },
  Promise<Subgraph<PropertyTypeRootType>>
> = async ({ graphApi }, { query }) => {
  return await graphApi
    .getPropertyTypesByQuery(query)
    .then(({ data: subgraph }) => subgraph as Subgraph<PropertyTypeRootType>);
};

/**
 * Get a property type by its versioned URL.
 *
 * @param params.propertyTypeId the unique versioned URL for a property type.
 */
export const getPropertyTypeById: ImpureGraphFunction<
  {
    propertyTypeId: VersionedUrl;
  },
  Promise<PropertyTypeWithMetadata>
> = async (context, params) => {
  const { propertyTypeId } = params;

  const [propertyType] = await getPropertyTypes(context, {
    query: {
      filter: {
        equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then(getRoots);

  if (!propertyType) {
    throw new NotFoundError(
      `Could not find property type with ID "${propertyTypeId}"`,
    );
  }

  return propertyType;
};

/**
 * Get a property type rooted subgraph by its versioned URL.
 *
 * If the type does not already exist within the Graph, and is an externally-hosted type, this will also load the type into the Graph.
 */
export const getPropertyTypeSubgraphById: ImpureGraphFunction<
  Omit<PropertyTypeStructuralQuery, "filter"> & {
    propertyTypeId: VersionedUrl;
    actorId: AccountId;
  },
  Promise<Subgraph<PropertyTypeRootType>>
> = async (context, params) => {
  const { graphResolveDepths, temporalAxes, propertyTypeId, actorId } = params;

  const query: PropertyTypeStructuralQuery = {
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
    },
    graphResolveDepths,
    temporalAxes,
  };

  let subgraph = await getPropertyTypes(context, {
    query,
  });

  if (subgraph.roots.length === 0 && !propertyTypeId.startsWith(frontendUrl)) {
    await context.graphApi.createPropertyType({
      actorId,
      propertyTypeId,
    });

    subgraph = await getPropertyTypes(context, {
      query,
    });
  }

  return subgraph;
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
    propertyTypeId: VersionedUrl;
    schema: ConstructPropertyTypeParams;
    actorId: AccountId;
  },
  Promise<PropertyTypeWithMetadata>
> = async ({ graphApi }, params) => {
  const { schema, actorId, propertyTypeId } = params;
  const updateArguments: UpdatePropertyTypeRequest = {
    typeToUpdate: propertyTypeId,
    schema: {
      $schema: PROPERTY_TYPE_META_SCHEMA,
      kind: "propertyType" as const,
      ...schema,
    },
    actorId,
  };

  const { data: metadata } = await graphApi.updatePropertyType(updateArguments);

  const { recordId } = metadata;

  return {
    schema: {
      $schema: PROPERTY_TYPE_META_SCHEMA,
      kind: "propertyType" as const,
      ...schema,
      $id: ontologyTypeRecordIdToVersionedUrl(recordId as OntologyTypeRecordId),
    },
    metadata: metadata as OntologyElementMetadata,
  };
};
