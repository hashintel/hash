import { isDeepStrictEqual } from "node:util";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { mapFlowDefinitionToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { logger } from "../../../logger";
import { createEntity } from "../../knowledge/primitive/entity";
import { getOrgByShortname } from "../../knowledge/system-types/org";
import { queryAllEntityPages } from "./util";

import type { ImpureGraphFunction } from "../../context-types";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

/**
 * Whether an entity already holds a flow definition. Compared without validating, because a migration writes its
 * snapshot as it was.
 */
const entityHoldsFlowDefinition = (
  entity: HashEntity<FlowDefinitionEntity>,
  flowDefinition: FlowDefinitionWithId["flowDefinition"],
) => {
  const {
    name,
    description,
    inputDefinition,
    stepDefinition,
    outputDefinition,
  } = simplifyProperties(entity.properties);

  return isDeepStrictEqual(
    {
      name,
      description,
      inputs: inputDefinition,
      steps: stepDefinition,
      outputs: outputDefinition,
    },
    flowDefinition,
  );
};

/**
 * Makes the `Flow Definition` entity of each of the given flows hold its definition: creates the entity in the `h`
 * web if it doesn't exist, with the flow's id as its entity uuid, and otherwise updates it if its definition
 * differs or it's on an earlier version of the type, creating a new edition. Runs and triggers link to the entity,
 * and runs load the definition from it.
 *
 * Anyone can view them, through the policy migration 032 creates for flow definitions in the `h` web.
 *
 * Migrations call this with a snapshot of the flows HASH provides (see `flow-definition-snapshots.ts`).
 * In development and tests, `migrateOntologyTypes` calls it with the dev-only flows defined in code .
 */
export const seedFlowDefinitions: ImpureGraphFunction<
  {
    flows: FlowDefinitionWithId[];
    flowDefinitionEntityTypeId: VersionedUrl;
  },
  Promise<void>
> = async (context, authentication, { flows, flowDefinitionEntityTypeId }) => {
  const hashOrg = await getOrgByShortname(context, authentication, {
    shortname: "h",
  });

  if (!hashOrg) {
    throw new Error(
      "Org with shortname 'h' does not exist, but is needed to seed flow definitions.",
    );
  }

  /*
   * Found by the type's base URL, so that an entity on an earlier version of the type is updated rather than
   * created again with the same uuid.
   */
  const existingEntitiesByUuid = new Map(
    (
      (await queryAllEntityPages(context, authentication, {
        filter: {
          all: [
            { equal: [{ path: ["webId"] }, { parameter: hashOrg.webId }] },
            {
              equal: [
                { path: ["type", "baseUrl"] },
                {
                  parameter: systemEntityTypes.flowDefinition.entityTypeBaseUrl,
                },
              ],
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      })) as HashEntity<FlowDefinitionEntity>[]
    ).map((entity) => [
      extractEntityUuidFromEntityId(entity.metadata.recordId.entityId),
      entity,
    ]),
  );

  for (const { flowDefinitionId, flowDefinition } of flows) {
    const existingEntity = existingEntitiesByUuid.get(flowDefinitionId);

    if (existingEntity) {
      if (
        existingEntity.metadata.entityTypeIds.includes(
          flowDefinitionEntityTypeId,
        ) &&
        entityHoldsFlowDefinition(existingEntity, flowDefinition)
      ) {
        continue;
      }

      logger.info(`Updating flow definition '${flowDefinition.name}'`);

      await existingEntity.patch(context.graphApi, authentication, {
        entityTypeIds: [flowDefinitionEntityTypeId],
        provenance: context.provenance,
        propertyPatches: [
          {
            op: "replace",
            path: [],
            property: mapFlowDefinitionToEntityProperties(flowDefinition),
          },
        ],
      });

      continue;
    }

    logger.info(`Seeding flow definition '${flowDefinition.name}'`);

    await createEntity<FlowDefinitionEntity>(context, authentication, {
      webId: hashOrg.webId,
      entityUuid: flowDefinitionId,
      entityTypeIds: [
        flowDefinitionEntityTypeId,
      ] as FlowDefinitionEntity["entityTypeIds"],
      properties: mapFlowDefinitionToEntityProperties(flowDefinition),
    });
  }
};
