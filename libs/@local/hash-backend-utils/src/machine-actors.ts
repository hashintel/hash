import type {
  ActorEntityUuid,
  ActorId,
  AiId,
  Entity,
  MachineId,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  getAiByIdentifier,
  getMachineByIdentifier,
} from "@local/hash-graph-sdk/principal/actor";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Machine } from "@local/hash-isomorphic-utils/system-types/machine";
import { backOff } from "exponential-backoff";

import type { Logger } from "./logger.js";

export type WebMachineActorIdentifier = `system-${WebId}`;

export type GlobalMachineActorIdentifier = SystemTypeWebShortname;

export type MachineActorIdentifier =
  | GlobalMachineActorIdentifier
  | WebMachineActorIdentifier;

export type AiActorIdentifier = "hash-ai";

export const getMachineIdByIdentifier = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  { identifier }: { identifier: MachineActorIdentifier },
): Promise<MachineId | null> =>
  getMachineByIdentifier(context.graphApi, authentication, identifier).then(
    (machineEntity) => machineEntity?.id ?? null,
  );

export const getAiIdByIdentifier = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  { identifier }: { identifier: AiActorIdentifier },
): Promise<AiId | null> =>
  getAiByIdentifier(context.graphApi, authentication, identifier).then(
    (aiEntity) => aiEntity?.id ?? null,
  );

export const getWebMachineId = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  { webId }: { webId: WebId },
): Promise<MachineId | null> =>
  getMachineIdByIdentifier(context, authentication, {
    identifier: `system-${webId}`,
  });

export const getMachineEntityByIdentifier = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  { identifier }: { identifier: MachineActorIdentifier | AiActorIdentifier },
): Promise<Entity<Machine> | null> => {
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
            mapGraphApiEntityToEntity<Machine>(entity, authentication.actorId),
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

  return machineEntity ?? null;
};

export const getWebMachineEntity = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
  { webId }: { webId: WebId },
): Promise<Entity<Machine> | null> =>
  getMachineEntityByIdentifier(context, authentication, {
    identifier: `system-${webId}`,
  });

/**
 * Creates a Machine entity for an existing machine account that already has permissions in the specified web.
 */
export const createMachineActorEntity = async (
  context: { graphApi: GraphApi },
  {
    identifier,
    logger,
    actor,
    webId,
    displayName,
    machineEntityTypeId,
  }: {
    // A unique identifier for the machine actor
    identifier: MachineActorIdentifier | AiActorIdentifier;
    // A logger instance
    logger: Logger;
    // An existing accountId for the machine actor, which will also be used to authenticate the request
    actor: ActorId;
    // The WebId of the web the actor's entity will belong to
    webId: WebId;
    // A display name for the machine actor, to display to users
    displayName: string;
    machineEntityTypeId?: VersionedUrl;
  },
): Promise<void> => {
  // TODO: Move Machine-Entity creation to Graph
  //   see https://linear.app/hash/issue/H-4558/move-machine-entity-creation-to-graph

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "api",
    },
  };

  await HashEntity.create<Machine>(
    context.graphApi,
    { actorId: actor.id },
    {
      draft: false,
      entityUuid: actor.id,
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
            subjectId: actor.id,
          },
        },
        // {
        //   relation: "viewer",
        //   subject: {
        //     kind: "public",
        //   },
        // },
      ],
    },
  );

  logger.info(
    `Created machine actor entity with identifier '${identifier}' with accountId: ${actor.id}, in web ${webId}`,
  );
};

export const createWebMachineActorEntity = async (
  context: { graphApi: GraphApi },
  {
    webId,
    machineId,
    machineEntityTypeId,
    logger,
  }: {
    webId: WebId;
    machineId: MachineId;
    machineEntityTypeId?: VersionedUrl;
    logger: Logger;
  },
): Promise<void> =>
  createMachineActorEntity(context, {
    identifier: `system-${webId}`,
    displayName: "HASH",
    webId,
    actor: { actorType: "machine", id: machineId },
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

  const { webId, machineId } = await graphApi
    .getWebByShortname(authentication.actorId, shortname)
    .then(({ data }) => ({
      webId: data.webId as WebId,
      machineId: data.machineId as MachineId,
    }));

  await createWebMachineActorEntity(context, {
    webId,
    machineId,
    machineEntityTypeId,
    logger,
  });

  return machineId;
};
