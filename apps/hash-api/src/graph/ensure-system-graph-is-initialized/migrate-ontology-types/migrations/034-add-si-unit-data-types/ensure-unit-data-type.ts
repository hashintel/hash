import { isDeepStrictEqual } from "node:util";

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

import type {
  BaseUrl,
  Conversions,
  DataTypeMetadata,
} from "@blockprotocol/type-system";

const normalizeConversionNumbers = (
  conversions: Record<BaseUrl, Conversions>,
): unknown =>
  JSON.parse(
    JSON.stringify(conversions, (_key, value: unknown) =>
      // The graph rounds floating constants to 15 significant digits when
      // converting f64 to decimal. Integer constants retain their precision.
      typeof value === "number" && !Number.isSafeInteger(value)
        ? Number(value.toPrecision(15))
        : value,
    ),
  );

export const ensureUnitDataType: typeof createSystemDataTypeIfNotExists =
  async (context, authentication, parameters) => {
    let existing = await createSystemDataTypeIfNotExists(
      context,
      authentication,
      parameters,
    );
    const { dataTypeDefinition, conversions, migrationState, webShortname } =
      parameters;

    while (true) {
      const expectedSchema = generateSystemDataTypeSchema({
        ...dataTypeDefinition,
        abstract: dataTypeDefinition.abstract ?? false,
        dataTypeId: existing.schema.$id,
      });
      const { baseUrl, version } = componentsFromVersionedUrl(
        existing.schema.$id,
      );
      if (
        isDeepStrictEqual(
          { ...existing.schema, abstract: existing.schema.abstract ?? false },
          expectedSchema,
        ) &&
        isDeepStrictEqual(
          normalizeConversionNumbers(existing.metadata.conversions ?? {}),
          normalizeConversionNumbers(conversions),
        )
      ) {
        migrationState.dataTypeVersions[baseUrl] = version;
        return existing;
      }

      // Preserve versions referenced by existing properties and values.
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
        existing = next;
        continue;
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
            .then(({ data }) => ({
              schema,
              metadata: data as DataTypeMetadata,
            }))
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
    }
  };
