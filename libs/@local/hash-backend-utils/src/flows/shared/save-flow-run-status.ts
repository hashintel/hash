import {
  systemDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type {
  ActorEntityUuid,
  BaseUrl,
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

export const getFlowRunStatusFieldsFromRecordHeader = ({
  status,
  startedAt,
  firstRunStartedAt,
  closedAt,
}: FlowRunRecordHeader): FlowRunStatusFields => ({
  status,
  startedAt: firstRunStartedAt ?? startedAt,
  ...(closedAt ? { closedAt } : {}),
});

/** The status fields a run's entity holds. A run that hasn't saved its status yet has none. */
export const getFlowRunStatusFieldsFromEntity = ({
  properties,
}: Pick<FlowRunEntity, "properties">): FlowRunStatusFields | null => {
  const status = properties["https://hash.ai/@h/types/property-type/status/"];
  const startedAt =
    properties["https://hash.ai/@h/types/property-type/started-at/"];
  const closedAt =
    properties["https://hash.ai/@h/types/property-type/closed-at/"];

  if (!status || !startedAt) {
    return null;
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

/** A run's status fields, as the properties of its entity that hold them. */
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
 * The patches that make a run's entity hold `fields`, which are none if it already does. Its times are only replaced
 * when its status changes, as the run's workflow and its record can each take a slightly different moment for them.
 */
export const getFlowRunStatusPatches = (
  { properties }: Pick<FlowRunEntity, "properties">,
  { status, startedAt, closedAt }: FlowRunStatusFields,
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
    ...(properties["https://hash.ai/@h/types/property-type/started-at/"] ===
    undefined
      ? [
          {
            op: "add" as const,
            path: [systemPropertyTypes.startedAt.propertyTypeBaseUrl],
            property: dateTimeProperty(startedAt),
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

const stepPropertyBaseUrl =
  "https://hash.ai/@h/types/property-type/step/" as BaseUrl;

/** Makes a run's entity hold `fields`, if it doesn't already. */
export const saveFlowRunStatus = async ({
  fields,
  flowRunEntity,
  graphApiClient,
  userAuthentication,
}: {
  fields: FlowRunStatusFields;
  flowRunEntity: HashEntity<FlowRunEntity>;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<void> => {
  const propertyPatches = getFlowRunStatusPatches(flowRunEntity, fields);

  if (propertyPatches.length === 0) {
    return;
  }

  const flowRunEntityTypeId = systemEntityTypes.flowRun.entityTypeId;
  const isOfCurrentType =
    flowRunEntity.metadata.entityTypeIds.includes(flowRunEntityTypeId);

  await flowRunEntity.patch(graphApiClient, userAuthentication, {
    /* An entity of the previous `Flow Run` type can't hold a status, and holds a `Step` that the current type doesn't. */
    ...(isOfCurrentType ? {} : { entityTypeIds: [flowRunEntityTypeId] }),
    propertyPatches: [
      ...(!isOfCurrentType &&
      (flowRunEntity.properties as Record<BaseUrl, unknown>)[
        stepPropertyBaseUrl
      ] !== undefined
        ? [{ op: "remove" as const, path: [stepPropertyBaseUrl] }]
        : []),
      ...propertyPatches,
    ],
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
): FlowRunStatusFields | null => {
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
