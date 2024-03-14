import type { VersionedUrl } from "@blockprotocol/type-system";
import { PROPERTY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import type {
  ArchivePropertyTypeParams,
  ModifyRelationshipOperation,
  OntologyTemporalMetadata,
  PropertyTypePermission,
  PropertyTypeStructuralQuery,
  UnarchivePropertyTypeParams,
  UpdatePropertyTypeRequest,
} from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import type { ConstructPropertyTypeParams } from "@local/hash-isomorphic-utils/types";
import type {
  OntologyTypeRecordId,
  OwnedById,
  PropertyTypeAuthorizationRelationship,
  PropertyTypeMetadata,
  PropertyTypeRelationAndSubject,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import { ontologyTypeRecordIdToVersionedUrl } from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import type { ImpureGraphFunction } from "../../context-types";
import { getWebShortname, isExternalTypeId } from "./util";

/**
 * Create a property type.
 *
 * @param params.ownedById - the id of the account who owns the property type
 * @param params.schema - the `PropertyType`
 * @param [params.webShortname] – the shortname of the web that owns the property type, if the web entity does not yet exist.
 *    - Only for seeding purposes. Caller is responsible for ensuring the webShortname is correct for the ownedById.
 * @param params.actorId - the id of the account that is creating the property type
 */
export const createPropertyType: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    schema: ConstructPropertyTypeParams;
    webShortname?: string;
    relationships: PropertyTypeRelationAndSubject[];
  },
  Promise<PropertyTypeWithMetadata>
> = async (ctx, authentication, params) => {
  const { ownedById, webShortname } = params;

  const shortname =
    webShortname ??
    (await getWebShortname(ctx, authentication, {
      accountOrAccountGroupId: ownedById,
    }));

  const propertyTypeId = generateTypeId({
    kind: "property-type",
    title: params.schema.title,
    webShortname: shortname,
  });

  const schema = {
    $schema: PROPERTY_TYPE_META_SCHEMA,
    kind: "propertyType" as const,
    $id: propertyTypeId,
    ...params.schema,
  };

  const { graphApi } = ctx;

  const { data: metadata } = await graphApi.createPropertyType(
    authentication.actorId,
    {
      ownedById,
      schema,
      relationships: params.relationships,
    },
  );

  return { schema, metadata: metadata as PropertyTypeMetadata };
};

/**
 * Get property types by a structural query.
 *
 * @param params.query the structural query to filter property types by.
 */
export const getPropertyTypes: ImpureGraphFunction<
  {
    query: Omit<PropertyTypeStructuralQuery, "includeDrafts">;
  },
  Promise<Subgraph<PropertyTypeRootType>>
> = async ({ graphApi }, { actorId }, { query }) => {
  return await graphApi
    .getPropertyTypesByQuery(actorId, { includeDrafts: false, ...query })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph(data);
      return subgraph as Subgraph<PropertyTypeRootType>;
    });
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
> = async (context, authentication, params) => {
  const { propertyTypeId } = params;

  const [propertyType] = await getPropertyTypes(context, authentication, {
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
  Omit<PropertyTypeStructuralQuery, "filter" | "includeDrafts"> & {
    propertyTypeId: VersionedUrl;
  },
  Promise<Subgraph<PropertyTypeRootType>>
> = async (context, authentication, params) => {
  const { graphResolveDepths, temporalAxes, propertyTypeId } = params;

  const query: Omit<PropertyTypeStructuralQuery, "includeDrafts"> = {
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
    },
    graphResolveDepths,
    temporalAxes,
  };

  let subgraph = await getPropertyTypes(context, authentication, {
    query,
  });

  if (subgraph.roots.length === 0 && isExternalTypeId(propertyTypeId)) {
    await context.graphApi.loadExternalPropertyType(authentication.actorId, {
      propertyTypeId,
    });

    subgraph = await getPropertyTypes(context, authentication, {
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
    relationships: PropertyTypeRelationAndSubject[];
  },
  Promise<PropertyTypeWithMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { schema, propertyTypeId } = params;
  const updateArguments: UpdatePropertyTypeRequest = {
    typeToUpdate: propertyTypeId,
    schema: {
      $schema: PROPERTY_TYPE_META_SCHEMA,
      kind: "propertyType" as const,
      ...schema,
    },
    relationships: params.relationships,
  };

  const { data: metadata } = await graphApi.updatePropertyType(
    actorId,
    updateArguments,
  );

  const { recordId } = metadata;

  return {
    schema: {
      $schema: PROPERTY_TYPE_META_SCHEMA,
      kind: "propertyType" as const,
      ...schema,
      $id: ontologyTypeRecordIdToVersionedUrl(recordId as OntologyTypeRecordId),
    },
    metadata: metadata as PropertyTypeMetadata,
  };
};

/**
 * Archives a data type
 *
 * @param params.propertyTypeId - the id of the property type that's being archived
 * @param params.actorId - the id of the account that is archiving the property type
 */
export const archivePropertyType: ImpureGraphFunction<
  ArchivePropertyTypeParams,
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { data: temporalMetadata } = await graphApi.archivePropertyType(
    actorId,
    params,
  );

  return temporalMetadata;
};

/**
 * Unarchives a data type
 *
 * @param params.propertyTypeId - the id of the property type that's being unarchived
 * @param params.actorId - the id of the account that is unarchiving the property type
 */
export const unarchivePropertyType: ImpureGraphFunction<
  UnarchivePropertyTypeParams,
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi }, { actorId }, params) => {
  const { data: temporalMetadata } = await graphApi.unarchivePropertyType(
    actorId,
    params,
  );

  return temporalMetadata;
};

export const getPropertyTypeAuthorizationRelationships: ImpureGraphFunction<
  { propertyTypeId: VersionedUrl },
  Promise<PropertyTypeAuthorizationRelationship[]>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getPropertyTypeAuthorizationRelationships(actorId, params.propertyTypeId)
    .then(({ data }) =>
      data.map(
        (relationship) =>
          ({
            resource: {
              kind: "propertyType",
              resourceId: params.propertyTypeId,
            },
            ...relationship,
          }) as PropertyTypeAuthorizationRelationship,
      ),
    );

export const modifyPropertyTypeAuthorizationRelationships: ImpureGraphFunction<
  {
    operation: ModifyRelationshipOperation;
    relationship: PropertyTypeAuthorizationRelationship;
  }[],
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.modifyPropertyTypeAuthorizationRelationships(
    actorId,
    params.map(({ operation, relationship }) => ({
      operation,
      resource: relationship.resource.resourceId,
      relationAndSubject: relationship,
    })),
  );
};

export const checkPropertyTypePermission: ImpureGraphFunction<
  { propertyTypeId: VersionedUrl; permission: PropertyTypePermission },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .checkPropertyTypePermission(
      actorId,
      params.propertyTypeId,
      params.permission,
    )
    .then(({ data }) => data.has_permission);
