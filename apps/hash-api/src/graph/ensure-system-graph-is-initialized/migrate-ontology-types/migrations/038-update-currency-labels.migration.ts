/* eslint-disable no-param-reassign */
import { isDeepStrictEqual } from "node:util";

import {
  incrementOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { queryDataTypes } from "@local/hash-graph-sdk/data-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

import { updateDataType } from "../../../ontology/primitive/data-type";
import { getOrCreateOwningWebId } from "../../system-webs-and-entities";
import { activeCurrencies } from "../currencies";
import { getCurrencyLabel } from "./038-update-currency-labels/currency-labels";

import type { MigrationFunction } from "../types";
import type { BaseUrl } from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const { systemActorMachineId } = await getOrCreateOwningWebId(context, "h");

  for (const { code } of activeCurrencies) {
    const baseUrl =
      `https://hash.ai/@h/types/data-type/${code.toLowerCase()}/` as BaseUrl;
    const { dataTypes } = await queryDataTypes(
      context.graphApi,
      authentication,
      {
        filter: {
          all: [
            { equal: [{ path: ["baseUrl"] }, { parameter: baseUrl }] },
            { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    );
    const current = dataTypes[0];
    if (!current) {
      throw new Error(`Currency data type ${code} has not been seeded`);
    }

    const label = getCurrencyLabel(code);
    const { version } = current.metadata.recordId;
    if (isDeepStrictEqual(current.schema.label, label)) {
      migrationState.dataTypeVersions[baseUrl] = version;
      continue;
    }

    const { $id, $schema, kind, ...definition } = current.schema;
    const schema = { ...definition, label };
    const conversions = current.metadata.conversions ?? {};

    if (isSelfHostedInstance) {
      const nextVersion = incrementOntologyTypeVersion(version);
      await context.graphApi.loadExternalDataType(systemActorMachineId, {
        schema: {
          ...schema,
          $id: versionedUrlFromComponents(baseUrl, nextVersion),
          $schema,
          kind,
        },
        conversions,
        provenance: context.provenance,
      });
      migrationState.dataTypeVersions[baseUrl] = nextVersion;
    } else {
      const updated = await updateDataType(
        context,
        { actorId: systemActorMachineId },
        { dataTypeId: $id, schema, conversions },
      );
      migrationState.dataTypeVersions[baseUrl] =
        updated.metadata.recordId.version;
    }
  }

  return migrationState;
};

export default migrate;
