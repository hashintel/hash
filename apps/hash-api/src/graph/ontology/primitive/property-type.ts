import type { PropertyTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  OntologyTemporalMetadata,
  OntologyTypeRecordId,
  PropertyTypeMetadata,
  PropertyTypeWithMetadata,
  ProvidedOntologyEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  ontologyTypeRecordIdToVersionedUrl,
  PROPERTY_TYPE_META_SCHEMA,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import { NotFoundError } from "@local/hash-backend-utils/error";
import type {
  ArchivePropertyTypeParams,
  QueryPropertyTypesParams,
  QueryPropertyTypeSubgraphParams,
  UnarchivePropertyTypeParams,
  UpdatePropertyTypeRequest,
} from "@local/hash-graph-client";
import type { ConstructPropertyTypeParams } from "@local/hash-graph-sdk/ontology";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { mapGraphApiPropertyTypesToPropertyTypes } from "@local/hash-isomorphic-utils/subgraph-mapping";

import type { ImpureGraphFunction } from "../../context-types";
import { getWebShortname, isExternalTypeId } from "./util";

/**
 * Create a property type.
 *
 * @param params.webId - the id of the account who owns the property type
 * @param params.schema - the `PropertyType`
 * @param [params.webShortname] – the shortname of the web that owns the property type, if the web entity does not yet exist.
 *    - Only for seeding purposes. Caller is responsible for ensuring the webShortname is correct for the webId.
 * @param params.actorId - the id of the account that is creating the property type
 */
export const createPropertyType: ImpureGraphFunction<
  {
    webId: WebId;
    schema: ConstructPropertyTypeParams;
    webShortname?: string;
    provenance?: Omit<
      ProvidedOntologyEditionProvenance,
      "origin" | "actorType"
    >;
  },
  Promise<PropertyTypeWithMetadata>
> = async (ctx, authentication, params) => {
  const { webId, webShortname } = params;

  const shortname =
    webShortname ??
    (await getWebShortname(ctx, authentication, {
      accountOrAccountGroupId: webId,
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
      webId,
      schema,
      provenance: {
        ...ctx.provenance,
        ...params.provenance,
      },
    },
  );

  // TODO: Avoid casting through `unknown` when new codegen is in place
  //   see https://linear.app/hash/issue/H-4463/utilize-new-codegen-and-replace-custom-defined-node-types
  return { schema, metadata: metadata as unknown as PropertyTypeMetadata };
};

export const getPropertyTypes: ImpureGraphFunction<
  QueryPropertyTypesParams,
  Promise<PropertyTypeWithMetadata[]>
> = async ({ graphApi }, { actorId }, request) =>
  graphApi
    .queryPropertyTypes(actorId, request)
    .then(({ data: response }) =>
      mapGraphApiPropertyTypesToPropertyTypes(response.propertyTypes),
    );

/**
 * Get property types by a structural query.
 *
 * @param params.query the structural query to filter property types by.
 */
export const getPropertyTypeSubgraph: ImpureGraphFunction<
  QueryPropertyTypeSubgraphParams,
  Promise<Subgraph<PropertyTypeRootType>>
> = async ({ graphApi }, { actorId }, request) =>
  graphApi
    .queryPropertyTypeSubgraph(actorId, request)
    .then(({ data: response }) =>
      mapGraphApiSubgraphToSubgraph(response.subgraph, actorId),
    );

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
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
  });

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
  DistributiveOmit<QueryPropertyTypeSubgraphParams, "filter"> & {
    propertyTypeId: VersionedUrl;
  },
  Promise<Subgraph<PropertyTypeRootType>>
> = async (context, authentication, params) => {
  const { propertyTypeId, ...subgraphRequest } = params;

  const request: QueryPropertyTypeSubgraphParams = {
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
    },
    ...subgraphRequest,
  };

  let subgraph = await getPropertyTypeSubgraph(
    context,
    authentication,
    request,
  );

  if (subgraph.roots.length === 0 && isExternalTypeId(propertyTypeId)) {
    await context.graphApi.loadExternalPropertyType(authentication.actorId, {
      propertyTypeId,
    });

    subgraph = await getPropertyTypeSubgraph(context, authentication, request);
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
    provenance?: ProvidedOntologyEditionProvenance;
  },
  Promise<PropertyTypeWithMetadata>
> = async (ctx, { actorId }, params) => {
  const { schema, propertyTypeId } = params;
  const updateArguments: UpdatePropertyTypeRequest = {
    typeToUpdate: propertyTypeId,
    schema: {
      $schema: PROPERTY_TYPE_META_SCHEMA,
      kind: "propertyType" as const,
      ...schema,
    },
    provenance: {
      ...ctx.provenance,
      ...params.provenance,
    },
  };

  const { data: metadata } = await ctx.graphApi.updatePropertyType(
    actorId,
    updateArguments,
  );

  const { recordId } = metadata;

  return {
    schema: {
      $schema: PROPERTY_TYPE_META_SCHEMA,
      kind: "propertyType" as const,
      ...schema,
      $id: ontologyTypeRecordIdToVersionedUrl(
        // TODO: Avoid casting through `unknown` when new codegen is in place
        //   see https://linear.app/hash/issue/H-4463/utilize-new-codegen-and-replace-custom-defined-node-types
        recordId as unknown as OntologyTypeRecordId,
      ),
    },
    // TODO: Avoid casting through `unknown` when new codegen is in place
    //   see https://linear.app/hash/issue/H-4463/utilize-new-codegen-and-replace-custom-defined-node-types
    metadata: metadata as unknown as PropertyTypeMetadata,
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

  return temporalMetadata as OntologyTemporalMetadata;
};

/**
 * Unarchives a data type
 *
 * @param params.propertyTypeId - the id of the property type that's being unarchived
 * @param params.actorId - the id of the account that is unarchiving the property type
 */
export const unarchivePropertyType: ImpureGraphFunction<
  Omit<UnarchivePropertyTypeParams, "provenance">,
  Promise<OntologyTemporalMetadata>
> = async ({ graphApi, provenance }, { actorId }, params) => {
  const { data: temporalMetadata } = await graphApi.unarchivePropertyType(
    actorId,
    { ...params, provenance },
  );

  return temporalMetadata as OntologyTemporalMetadata;
};
