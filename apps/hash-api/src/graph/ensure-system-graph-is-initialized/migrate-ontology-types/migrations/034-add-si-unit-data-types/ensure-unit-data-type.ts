import {
  componentsFromVersionedUrl,
  incrementOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getDataTypeById } from "@local/hash-graph-sdk/data-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

import { updateDataType } from "../../../../ontology/primitive/data-type";
import { getOrCreateOwningWebId } from "../../../system-webs-and-entities";
import {
  createSystemDataTypeIfNotExists,
  generateSystemDataTypeSchema,
} from "../../util";

import type { DataTypeMetadata } from "@blockprotocol/type-system";

export const ensureUnitDataType: typeof createSystemDataTypeIfNotExists =
  async (context, authentication, parameters) => {
    const existing = await createSystemDataTypeIfNotExists(
      context,
      authentication,
      parameters,
    );
    const { dataTypeDefinition, conversions, migrationState, webShortname } =
      parameters;

    if (
      JSON.stringify(existing.schema.allOf) ===
      JSON.stringify(dataTypeDefinition.allOf)
    ) {
      return existing;
    }

    // Keep the original version available to properties and values that reference it.
    const { baseUrl, version } = componentsFromVersionedUrl(
      existing.schema.$id,
    );
    const nextVersion = incrementOntologyTypeVersion(version);
    const nextId = versionedUrlFromComponents(baseUrl, nextVersion);
    const next = await getDataTypeById(context.graphApi, authentication, {
      dataTypeId: nextId,
      temporalAxes: currentTimeInstantTemporalAxes,
    }).catch((error: unknown) => {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    });

    if (next) {
      migrationState.dataTypeVersions[baseUrl] = nextVersion;
      return next;
    }

    const { systemActorMachineId } = await getOrCreateOwningWebId(
      context,
      webShortname,
    );
    const schema = generateSystemDataTypeSchema({
      ...dataTypeDefinition,
      dataTypeId: nextId,
    });
    const updated = isSelfHostedInstance
      ? await context.graphApi
          .loadExternalDataType(systemActorMachineId, {
            schema,
            conversions,
            provenance: context.provenance,
          })
          .then(({ data }) => ({ schema, metadata: data as DataTypeMetadata }))
      : await updateDataType(
          context,
          { actorId: systemActorMachineId },
          {
            dataTypeId: existing.schema.$id,
            schema: dataTypeDefinition,
            conversions,
          },
        );

    migrationState.dataTypeVersions[baseUrl] =
      updated.metadata.recordId.version;
    return updated;
  };
