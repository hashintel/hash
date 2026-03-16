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
import type {
  ArchivePropertyTypeParams,
  UnarchivePropertyTypeParams,
  UpdatePropertyTypeRequest,
} from "@local/hash-graph-client";
import type { ConstructPropertyTypeParams } from "@local/hash-graph-sdk/ontology";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";

import type { ImpureGraphFunction } from "../../context-types";
import { getWebShortname } from "./util";

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
