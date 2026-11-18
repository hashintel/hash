import {
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type {
  ActorEntityUuid,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowRunRecordHeader } from "@local/hash-isomorphic-utils/flows/run-record";
import type { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

/** What a run's entity holds about where the run is, so that lists of runs don't read the run's record. */
export type FlowRunStatusFields = {
  status: FlowRunStatus;
  startedAt: string;
  closedAt?: string;
};

/** The status fields a run saves as it goes on. Its start time is saved once, as its entity is created. */
export type FlowRunStatusUpdate = Omit<FlowRunStatusFields, "startedAt">;

export const getFlowRunStatusFieldsFromRecordHeader = ({
  status,
  closedAt,
}: FlowRunRecordHeader): FlowRunStatusUpdate => ({
  status,
  ...(closedAt ? { closedAt } : {}),
});

/** The status fields a run's entity holds, which it's created with. */
export const getFlowRunStatusFieldsFromEntity = ({
  metadata,
  properties,
}: HashEntity<FlowRunEntity>): FlowRunStatusFields => {
  const status = properties["https://hash.ai/@h/types/property-type/status/"];
  const startedAt =
    properties["https://hash.ai/@h/types/property-type/started-at/"];
  const closedAt =
    properties["https://hash.ai/@h/types/property-type/closed-at/"];

  if (!status || !startedAt) {
    throw new Error(
      `Flow run ${metadata.recordId.entityId} has no status or start time`,
    );
  }

  return {
    status: status as FlowRunStatus,
    startedAt,
    ...(closedAt ? { closedAt } : {}),
  };
};

const statusProperty = (status: FlowRunStatus) => ({
  value: status,
  metadata: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as const,
  },
});

const dateTimeProperty = (value: string) => ({
  value,
  metadata: { dataTypeId: systemDataTypes.datetime.dataTypeId },
});

export const mapFlowRunStatusToEntityProperties = ({
  status,
  startedAt,
  closedAt,
}: FlowRunStatusFields) => {
  const properties: Pick<
    FlowRunEntity["propertiesWithMetadata"]["value"],
    | "https://hash.ai/@h/types/property-type/status/"
    | "https://hash.ai/@h/types/property-type/started-at/"
    | "https://hash.ai/@h/types/property-type/closed-at/"
  > = {
    "https://hash.ai/@h/types/property-type/status/": statusProperty(status),
    "https://hash.ai/@h/types/property-type/started-at/":
      dateTimeProperty(startedAt),
    ...(closedAt
      ? {
          "https://hash.ai/@h/types/property-type/closed-at/":
            dateTimeProperty(closedAt),
        }
      : {}),
  };

  return properties;
};

/**
 * The patches that make a run's entity hold the given status fields, which are none if it already does. Its close
 * time is only replaced when its status changes, as the run's workflow and its record can each take a slightly
 * different moment for it.
 */
export const getFlowRunStatusPatches = (
  { properties }: Pick<FlowRunEntity, "properties">,
  { status, closedAt }: FlowRunStatusUpdate,
): PropertyPatchOperation[] => {
  const statusChanged =
    properties["https://hash.ai/@h/types/property-type/status/"] !== status;
  const hasClosedAt =
    properties["https://hash.ai/@h/types/property-type/closed-at/"] !==
    undefined;

  return [
    ...(statusChanged
      ? [
          {
            op: "add" as const,
            path: [systemPropertyTypes.status.propertyTypeBaseUrl],
            property: statusProperty(status),
          },
        ]
      : []),
    ...(closedAt && (statusChanged || !hasClosedAt)
      ? [
          {
            op: "add" as const,
            path: [systemPropertyTypes.closedAt.propertyTypeBaseUrl],
            property: dateTimeProperty(closedAt),
          },
        ]
      : []),
    ...(!closedAt && hasClosedAt
      ? [
          {
            op: "remove" as const,
            path: [systemPropertyTypes.closedAt.propertyTypeBaseUrl],
          },
        ]
      : []),
  ];
};

export const saveFlowRunStatus = async ({
  fields,
  flowRunEntity,
  graphApiClient,
  userAuthentication,
}: {
  fields: FlowRunStatusUpdate;
  flowRunEntity: HashEntity<FlowRunEntity>;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<void> => {
  const propertyPatches = getFlowRunStatusPatches(flowRunEntity, fields);

  if (propertyPatches.length === 0) {
    return;
  }

  await flowRunEntity.patch(graphApiClient, userAuthentication, {
    propertyPatches,
    provenance: {
      actorType: "machine",
      origin: {
        type: "flow",
        id: flowRunEntity.metadata.recordId.entityId,
      },
    },
  });
};

/**
 * The status fields a run's record says its entity should hold, or `null` if it can't say. The record of a run that
 * hasn't closed may be read after the run saved how it ended, but before it closed, so it only reopens an entity that
 * ended before the run last started: i.e. before it was reset.
 */
export const getFlowRunStatusFieldsToCorrect = (
  { properties }: Pick<FlowRunEntity, "properties">,
  header: FlowRunRecordHeader,
): FlowRunStatusUpdate | null => {
  const entityClosedAt =
    properties["https://hash.ai/@h/types/property-type/closed-at/"];

  if (!header.closedAt && entityClosedAt && header.startedAt < entityClosedAt) {
    return null;
  }

  return getFlowRunStatusFieldsFromRecordHeader(header);
};

/**
 * Makes a run's entity hold the status its record gives, which it may not: e.g. when the run was terminated outside
 * the app, and so couldn't save how it ended. Whoever reads the record may not be able to edit the entity, so failing
 * to only warns.
 */
export const correctFlowRunStatusFromRecord = async ({
  flowRunEntity,
  graphApiClient,
  header,
  userAuthentication,
}: {
  flowRunEntity: HashEntity<FlowRunEntity>;
  graphApiClient: GraphApi;
  header: FlowRunRecordHeader;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<void> => {
  const fields = getFlowRunStatusFieldsToCorrect(flowRunEntity, header);

  if (!fields) {
    return;
  }

  try {
    await saveFlowRunStatus({
      fields,
      flowRunEntity,
      graphApiClient,
      userAuthentication,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `Could not correct the status of flow run ${header.workflowId}: ${(error as Error).message}`,
    );
  }
};
