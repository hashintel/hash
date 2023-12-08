import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  MachineActorIdentifier,
  machineActorIdentifiers,
} from "@local/hash-isomorphic-utils/machine-actors";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountGroupId,
  AccountId,
  Entity,
  EntityRootType,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/src/stdlib/subgraph/roots";

import { ImpureGraphContext, ImpureGraphFunction } from "../../context-types";

export const getMachineEntity: ImpureGraphFunction<
  { identifier: MachineActorIdentifier },
  Promise<Entity>
> = async ({ graphApi }, authentication, { identifier }) => {
  const [machineEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.machine.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(
                    systemPropertyTypes.machineIdentifier.propertyTypeId,
                  ),
                ],
              },
              { parameter: identifier },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one machine entity with identifier ${identifier} found in the graph.`,
    );
  }

  if (!machineEntity) {
    throw new Error(
      `Critical: No machine entity with identifier ${identifier} found in the graph.`,
    );
  }

  return machineEntity;
};

export const createMachineEntity = async (
  context: ImpureGraphContext,
  {
    identifier,
    machineAccountId,
    owningWebAccountGroupId,
  }: {
    // A unique identifier for the machine actor
    identifier: MachineActorIdentifier;
    // An existing accountId for the machine actor, which will also be used to authenticate the request
    machineAccountId: AccountId;
    // The accountGroupId (ownedById) of the web the actor's entity will belong to
    owningWebAccountGroupId: AccountGroupId;
  },
) => {
  if (!machineActorIdentifiers.includes(identifier)) {
    throw new Error(`Invalid machine identifier: ${identifier}`);
  }

  return await context.graphApi.createEntity(machineAccountId, {
    draft: false,
    entityTypeId: systemEntityTypes.machine.entityTypeId,
    ownedById: owningWebAccountGroupId,
    properties: {
      [systemPropertyTypes.machineIdentifier.propertyTypeId]: identifier,
    },
    relationships: [
      {
        relation: "viewer",
        subject: {
          kind: "public",
        },
      },
    ],
  });
};
