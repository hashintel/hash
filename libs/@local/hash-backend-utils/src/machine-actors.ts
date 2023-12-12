import { NotFoundError } from "@local/hash-backend-utils/error";
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
  AccountId,
  EntityMetadata,
  EntityRootType,
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
  "hash-ai",
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
    throw new NotFoundError(
      `Critical: No machine entity with identifier ${identifier} found in the graph.`,
    );
  }

  return machineEntity.metadata.provenance.recordCreatedById;
};

/**
 * Creates a Machine entity for an existing machine account that already has permissions in the specified web.
 */
export const createMachineActorEntity = async (
  context: { graphApi: GraphApi },
  {
    identifier,
    machineAccountId,
    ownedById,
    displayName,
    shouldBeAbleToCreateMoreMachineEntities,
    systemAccountId,
  }: {
    // A unique identifier for the machine actor
    identifier: MachineActorIdentifier;
    // An existing accountId for the machine actor, which will also be used to authenticate the request
    machineAccountId: AccountId;
    // The OwnedById of the web the actor's entity will belong to
    ownedById: OwnedById;
    // A display name for the machine actor, to display to users
    displayName: string;
    // Whether or not this machine should be able to create more machine entities after creating itself
    shouldBeAbleToCreateMoreMachineEntities: boolean;
    // The accountId of the system account, used to grant the machine actor permissions to instantiate system types
    systemAccountId: AccountId;
  },
): Promise<EntityMetadata> => {
  // Give the machine actor permissions to generate graph change notifications
  await context.graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    [
      {
        operation: "touch",
        resource: systemEntityTypes.graphChangeNotification.entityTypeId,
        relationAndSubject: {
          subject: {
            kind: "account",
            subjectId: machineAccountId,
          },
          relation: "instantiator",
        },
      },
    ],
  );

  // Give the machine actor permissions to instantiate its own entity (entities of type Machine)
  await context.graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    [
      {
        operation: "touch",
        resource: systemEntityTypes.machine.entityTypeId,
        relationAndSubject: {
          subject: {
            kind: "account",
            subjectId: machineAccountId,
          },
          relation: "instantiator",
        },
      },
    ],
  );

  const metadata = await context.graphApi
    .createEntity(machineAccountId, {
      draft: false,
      entityTypeId: systemEntityTypes.machine.entityTypeId,
      ownedById,
      properties: {
        [blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl]:
          displayName,
        [systemPropertyTypes.machineIdentifier.propertyTypeBaseUrl]: identifier,
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
    .then((resp) => mapGraphApiEntityMetadataToMetadata(resp.data));

  if (!shouldBeAbleToCreateMoreMachineEntities) {
    await context.graphApi.modifyEntityTypeAuthorizationRelationships(
      systemAccountId,
      [
        {
          operation: "delete",
          resource: systemEntityTypes.machine.entityTypeId,
          relationAndSubject: {
            subject: {
              kind: "account",
              subjectId: machineAccountId,
            },
            relation: "instantiator",
          },
        },
      ],
    );
  }

  return metadata;
};

const entityTypeIdsWebMachinesCanInstantiate = [
  systemEntityTypes.commentNotification.entityTypeId,
  systemEntityTypes.mentionNotification.entityTypeId,
];

/**
 * 1. Creates an account for a machine and grants it ownership permissions for the specified web
 * 2. Grants it the permissions to create some special system types
 * 3. Creates an entity associated with the machine
 */
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

  const systemAccountId = await getMachineActorId(context, authentication, {
    identifier: "hash",
  });

  /** Grant permissions to the web machine actor to create entities that normal users cannot */
  await graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    entityTypeIdsWebMachinesCanInstantiate.map((entityTypeId) => ({
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

  await createMachineActorEntity(context, {
    identifier: `system-${ownedById}`,
    machineAccountId: machineAccountId as AccountId,
    ownedById,
    displayName: "HASH",
    shouldBeAbleToCreateMoreMachineEntities: true,
    systemAccountId,
  });

  return machineAccountId as AccountId;
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
  return getMachineActorId(context, authentication, {
    identifier: `system-${ownedById}`,
  });
};
