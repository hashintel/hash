import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { systemTypeWebShortnames } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountEntityId,
  AccountId,
  EntityRootType,
  extractAccountId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiEntityMetadataToMetadata,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

export type WebMachineActorIdentifier = `system-${OwnedById}`;

const globalMachineActorIdentifiers = [
  ...systemTypeWebShortnames,
  "ai-assistant",
] as const;

export type GlobalMachineActorIdentifier =
  (typeof globalMachineActorIdentifiers)[number];

export type MachineActorIdentifier =
  | GlobalMachineActorIdentifier
  | WebMachineActorIdentifier;

/**
 * Retrieve a machine
 * @param context
 * @param authentication
 * @param identifier
 */

export const getMachineActorId = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  { identifier }: { identifier: MachineActorIdentifier },
): Promise<AccountId> => {
  const [machineEntity, ...unexpectedEntities] = await context.graphApi
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

  return extractAccountId(
    machineEntity.metadata.recordId.entityId as AccountEntityId,
  );
};

export const createMachineActor = async (
  context: { graphApi: GraphApi },
  {
    description,
    identifier,
    machineAccountId,
    ownedById,
    preferredName,
  }: {
    // A description for the machine actor
    description: string;
    // A unique identifier for the machine actor
    identifier: MachineActorIdentifier;
    // An existing accountId for the machine actor, which will also be used to authenticate the request
    machineAccountId: AccountId;
    // The OwnedById of the web the actor's entity will belong to
    ownedById: OwnedById;
    // A display name for the machine actor, to display to users
    preferredName: string;
  },
): Promise<AccountId> => {
  return await context.graphApi
    .createEntity(machineAccountId, {
      draft: false,
      entityTypeId: systemEntityTypes.machine.entityTypeId,
      ownedById,
      properties: {
        [systemPropertyTypes.preferredName.propertyTypeBaseUrl]: preferredName,
        [systemPropertyTypes.machineIdentifier.propertyTypeBaseUrl]: identifier,
        [blockProtocolPropertyTypes.description.propertyTypeBaseUrl]:
          description,
      },
      relationships: [
        {
          relation: "administrator",
          subject: {
            kind: "account",
            subjectId: machineAccountId,
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    })
    .then(({ data }) => {
      const metadata = mapGraphApiEntityMetadataToMetadata(data);

      const accountId = extractAccountId(
        metadata.recordId.entityId as AccountEntityId,
      );

      return accountId;
    });
};

const entityTypeIdsMachinesCanInstantiate = [
  systemEntityTypes.commentNotification.entityTypeId,
  systemEntityTypes.graphChangeNotification.entityTypeId,
  systemEntityTypes.mentionNotification.entityTypeId,
  systemEntityTypes.machine.entityTypeId,
];

export const createWebMachineActor = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  {
    ownedById,
  }: {
    ownedById: OwnedById;
  },
): Promise<AccountId> => {
  const { graphApi } = context;

  const machineAccountId = await graphApi
    .createAccount(authentication.actorId)
    .then((resp) => resp.data);

  await graphApi.modifyWebAuthorizationRelationships(authentication.actorId, [
    {
      operation: "create",
      resource: ownedById,
      relationAndSubject: {
        subject: {
          kind: "account",
          subjectId: machineAccountId,
        },
        relation: "owner",
      },
    },
  ]);

  /** Grant permissions to the web machine actor to create entities that normal users cannot */
  await graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    entityTypeIdsMachinesCanInstantiate.map((entityTypeId) => ({
      operation: "create",
      resource: entityTypeId,
      relationAndSubject: {
        subject: {
          kind: "account",
          subjectId: machineAccountId,
        },
        relation: "instantiator",
      },
    })),
  );

  return await createMachineActor(context, {
    description: `A system bot for the web with id ${ownedById}`,
    identifier: `system-${ownedById}`,
    machineAccountId: machineAccountId as AccountId,
    ownedById,
    preferredName: "system",
  });
};

export const getWebMachineActorId = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  {
    ownedById,
  }: {
    ownedById: OwnedById;
  },
): Promise<AccountId> => {
  const entity = await getMachineActorId(context, authentication, {
    identifier: `system-${ownedById}`,
  });

  return extractAccountId(entity.metadata.recordId.entityId as AccountEntityId);
};
