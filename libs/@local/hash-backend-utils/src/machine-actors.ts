import type {
  ActorEntityUuid,
  AiId,
  MachineId,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { getWebById } from "@local/hash-graph-sdk/principal/web";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Machine } from "@local/hash-isomorphic-utils/system-types/machine";
import { backOff } from "exponential-backoff";

import { NotFoundError } from "./error.js";
import type { Logger } from "./logger.js";

export type WebMachineActorIdentifier = `system-${WebId}`;

export type GlobalMachineActorIdentifier = SystemTypeWebShortname | "hash-ai";

export type MachineActorIdentifier =
  | GlobalMachineActorIdentifier
  | WebMachineActorIdentifier;

export const getWebMachineId = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  {
    webId,
  }: {
    webId: WebId;
  },
): Promise<MachineId> =>
  getWebById(context.graphApi, authentication, webId).then((web) => {
    if (!web) {
      throw new NotFoundError(`Failed to get web for shortname: ${webId}`);
    }
    return web.machineId;
  });

/**
 * Retrieve a machine actor's accountId by its unique identifier
 */
export const getMachineIdByIdentifier = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  { identifier }: { identifier: MachineActorIdentifier },
): Promise<ActorEntityUuid> => {
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
    logger,
    machineId,
    webId,
    displayName,
    systemAccountId,
    machineEntityTypeId,
  }: {
    // A unique identifier for the machine actor
    identifier: MachineActorIdentifier;
    // A logger instance
    logger: Logger;
    // An existing accountId for the machine actor, which will also be used to authenticate the request
    machineId: MachineId | AiId;
    // The WebId of the web the actor's entity will belong to
    webId: WebId;
    // A display name for the machine actor, to display to users
    displayName: string;
    // The accountId of the system account, used to grant the machine actor permissions to instantiate system types
    systemAccountId: MachineId;
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
            subjectId: machineId,
          },
          relation: "instantiator",
        },
      },
    ],
  );

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "api",
    },
  };

  await HashEntity.create<Machine>(
    context.graphApi,
    { actorId: machineId },
    {
      draft: false,
      entityUuid: machineId,
      entityTypeIds: machineEntityTypeId
        ? ([machineEntityTypeId] as Machine["entityTypeIds"])
        : [systemEntityTypes.machine.entityTypeId],
      webId,
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
          "https://hash.ai/@h/types/property-type/machine-identifier/": {
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
            subjectId: machineId,
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

  logger.info(
    `Created machine actor entity with identifier '${identifier}' with accountId: ${machineId}, in web ${webId}`,
  );

  await context.graphApi.modifyEntityTypeAuthorizationRelationships(
    systemAccountId,
    [
      {
        operation: "delete",
        resource: machineEntityTypeId ?? systemEntityTypes.machine.entityTypeId,
        relationAndSubject: {
          subject: {
            kind: "account",
            subjectId: machineId,
          },
          relation: "instantiator",
        },
      },
    ],
  );
};

export const createWebMachineActorEntity = async (
  context: { graphApi: GraphApi },
  {
    systemAccountId,
    webId,
    machineId,
    machineEntityTypeId,
    logger,
  }: {
    systemAccountId: MachineId;
    webId: WebId;
    machineId: MachineId;
    machineEntityTypeId?: VersionedUrl;
    logger: Logger;
  },
): Promise<void> =>
  createMachineActorEntity(context, {
    identifier: `system-${webId}`,
    displayName: "HASH",
    systemAccountId,
    webId,
    machineId,
    machineEntityTypeId,
    logger,
  });

/**
 * 1. Creates an account for a machine and grants it ownership permissions for the specified web
 * 2. Grants it the permissions to create some special system types
 * 3. Creates an entity associated with the machine
 */
export const createWebMachineActor = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  {
    shortname,
    logger,
    machineEntityTypeId,
  }: {
    shortname: string;
    logger: Logger;
    machineEntityTypeId?: VersionedUrl;
  },
): Promise<ActorEntityUuid> => {
  const { graphApi } = context;

  const systemAccountId = await graphApi
    .getOrCreateSystemActor("h")
    .then(({ data }) => data as MachineId);

  const { webId, machineId } = await graphApi
    .getWebByShortname(authentication.actorId, shortname)
    .then(({ data }) => ({
      webId: data.webId as WebId,
      machineId: data.machineId as MachineId,
    }));

  await createWebMachineActorEntity(context, {
    systemAccountId,
    webId,
    machineId,
    machineEntityTypeId,
    logger,
  });

  return machineId;
};
