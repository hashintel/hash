import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { OwnedById } from "@local/hash-graph-types/web";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { systemTypeWebShortnames } from "@local/hash-isomorphic-utils/ontology-types";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Machine } from "@local/hash-isomorphic-utils/system-types/machine";
import { backOff } from "exponential-backoff";

import { NotFoundError } from "./error.js";

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
 * Retrieve a machine actor's accountId by its unique identifier
 */
export const getMachineActorId = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  { identifier }: { identifier: MachineActorIdentifier },
): Promise<AccountId> => {
  const [machineEntity, ...unexpectedEntities] = await backOff(
    () =>
      context.graphApi
        .getEntities(authentication.actorId, {
          filter: {
            all: [
              {
                equal: [
                  {
                    path: ["type(inheritanceDepth = 0)", "baseUrl"],
                  },
                  {
                    parameter: systemEntityTypes.machine.entityTypeBaseUrl,
                  },
                ],
              },
              {
                equal: [
                  {
                    path: [
                      "properties",
                      systemPropertyTypes.machineIdentifier.propertyTypeBaseUrl,
                    ],
                  },
                  { parameter: identifier },
                ],
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
        })
        .then(({ data: response }) =>
          response.entities.map((entity) =>
            mapGraphApiEntityToEntity(entity, authentication.actorId),
          ),
        ),
    {
      numOfAttempts: 3,
      startingDelay: 1000,
      jitter: "full",
    },
  );

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

  return machineEntity.metadata.provenance.createdById;
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
    machineEntityTypeId,
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
    machineEntityTypeId?: VersionedUrl;
  },
): Promise<void> => {
  // Give the machine actor permissions to instantiate its own entity (entities of type Machine)
  await context.graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    [
      {
        operation: "touch",
        resource: machineEntityTypeId ?? systemEntityTypes.machine.entityTypeId,
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

  const provenance: EnforcedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "api",
    },
  };

  await Entity.create<Machine>(
    context.graphApi,
    { actorId: machineAccountId },
    {
      draft: false,
      entityTypeIds: machineEntityTypeId
        ? ([machineEntityTypeId] as Machine["entityTypeIds"])
        : [systemEntityTypes.machine.entityTypeId],
      ownedById,
      properties: {
        value: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
            {
              value: displayName,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          "https://hash.ai/@hash/types/property-type/machine-identifier/": {
            value: identifier,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      },
      provenance,
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
    },
  );

  if (!shouldBeAbleToCreateMoreMachineEntities) {
    await context.graphApi.modifyEntityTypeAuthorizationRelationships(
      systemAccountId,
      [
        {
          operation: "delete",
          resource:
            machineEntityTypeId ?? systemEntityTypes.machine.entityTypeId,
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
};

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
    machineEntityTypeId,
  }: {
    ownedById: OwnedById;
    machineEntityTypeId?: VersionedUrl;
  },
): Promise<AccountId> => {
  const { graphApi } = context;

  const machineAccountId = await graphApi
    .createAccount(authentication.actorId, {})
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

  await createMachineActorEntity(context, {
    identifier: `system-${ownedById}`,
    machineAccountId: machineAccountId as AccountId,
    ownedById,
    displayName: "HASH",
    shouldBeAbleToCreateMoreMachineEntities: true,
    systemAccountId,
    machineEntityTypeId,
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
