import { useMutation, useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  EntityEditionId,
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import {
  CaretDownSolidIcon,
  IconButton,
  RotateRegularIcon,
} from "@hashintel/design-system";
import type { Filter } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import type {
  CheckpointLog,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import type { Theme } from "@mui/material";
import {
  Box,
  Stack,
  Switch,
  TableCell,
  Tooltip,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import type { ReactElement } from "react";
import { memo, useEffect, useMemo, useState } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  ResetFlowMutation,
  ResetFlowMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { resetFlowMutation } from "../../../../../graphql/queries/knowledge/flow.queries";
import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import { Link } from "../../../../../shared/ui/link";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../../shared/virtualized-table";
import type { VirtualizedTableSort } from "../../../../shared/virtualized-table/header/sort";
import { SectionLabel } from "./section-label";
import { formatTimeTaken } from "./shared/format-time-taken";
import type { LocalProgressLog, LogDisplay } from "./shared/types";

const getEntityLabelFromLog = (
  log: StepProgressLog,
  persistedEntities: HashEntity[],
): string => {
  if (log.type !== "ProposedEntity" && log.type !== "PersistedEntityMetadata") {
    throw new Error(`Unexpected log type ${log.type}`);
  }

  if (log.type === "PersistedEntityMetadata") {
    const { entityId } = log.persistedEntityMetadata;
    if (!entityId) {
      return "Entity persistence failed";
    }

    const entity = persistedEntities.find(
      (persisted) => persisted.entityId === entityId,
    );

    if (!entity) {
      // Entity not yet loaded - return a placeholder
      return "Loading entity...";
    }

    return generateEntityLabel(null, entity, true);
  }

  // ProposedEntity - we have the full entity in the log
  const { proposedEntity } = log;

  const entityLabel = generateEntityLabel(
    null,
    {
      properties: proposedEntity.properties,
      metadata: {
        recordId: {
          editionId: "irrelevant-here" as EntityEditionId,
          entityId: proposedEntity.localEntityId,
        } satisfies EntityRecordId,
        entityTypeIds: proposedEntity.entityTypeIds,
      } as EntityMetadata,
    },
    true,
  );

  return entityLabel;
};

const getEntityPrefixFromLog = (log: StepProgressLog): string => {
  if (log.type !== "ProposedEntity" && log.type !== "PersistedEntityMetadata") {
    throw new Error(`Unexpected log type ${log.type}`);
  }

  return log.type === "PersistedEntityMetadata"
    ? "Persisted entity"
    : log.isUpdateToExistingProposal
      ? "Updated proposed entity"
      : "Proposed entity";
};

const viewedPdfFilePrefix = "Viewed PDF file at ";
const visitedWebPagePrefix = "Visited ";
const queriedWebPrefix = "Searched web for ";
const startedCoordinatorPrefix = "Started research coordinator with goal ";
const closedCoordinatorPrefix = "Finished research coordinator with ";
const coordinatorWaitsPrefix =
  "Coordinator is waiting for outstanding tasks to finish.";
const startedSubCoordinatorPrefix = "Started sub-coordinator with goal ";
const closedSubCoordinatorPrefix = "Finished sub-coordinator with ";
const startedLinkExplorerTaskPrefix = "Exploring webpages with goal ";
const closedLinkExplorerTaskPrefix = "Finished exploring webpages with ";
const workerWasStoppedTaskPrefix = "Worker was stopped";
const activityFailedPrefix = "Activity failed: ";
const checkpointPrefix = "Checkpoint recorded";
const checkpointResetMessage = "Flow resumed from checkpoint";
const createdPlanMessage = "Created research plan";
const updatedPlanMessage = "Updated research plan";

const getRawTextFromLog = (
  log: LocalProgressLog,
  persistedEntities: HashEntity[],
): string => {
  switch (log.type) {
    case "VisitedWebPage": {
      return `${visitedWebPagePrefix}${log.webPage.title}`;
    }
    case "QueriedWeb": {
      return `${queriedWebPrefix}"${log.query}"`;
    }
    case "ProposedEntity":
    case "PersistedEntityMetadata": {
      const prefix = getEntityPrefixFromLog(log);

      const entityLabel = getEntityLabelFromLog(log, persistedEntities);

      return `${prefix} ${entityLabel}`;
    }
    case "ViewedFile": {
      return `${viewedPdfFilePrefix}${log.file.title}`;
    }
    case "StateChange": {
      return log.message;
    }
    case "CreatedPlan": {
      return createdPlanMessage;
    }
    case "UpdatedPlan": {
      return updatedPlanMessage;
    }
    case "Thread": {
      return log.label;
    }
    case "StartedCoordinator": {
      return `${startedCoordinatorPrefix}“${log.input.goal}”`;
    }
    case "ClosedCoordinator": {
      return `${closedCoordinatorPrefix} ${log.output.entityCount} entities discovered`;
    }
    case "CoordinatorWaitsForTasks": {
      return coordinatorWaitsPrefix;
    }
    case "StartedSubCoordinator": {
      return `${startedSubCoordinatorPrefix}“${log.input.goal}”`;
    }
    case "ClosedSubCoordinator": {
      return `${closedSubCoordinatorPrefix} ${log.output.claimCount} claims and ${log.output.entityCount} entities discovered`;
    }
    case "StartedLinkExplorerTask": {
      return `${startedLinkExplorerTaskPrefix}“${log.input.goal}”`;
    }
    case "ClosedLinkExplorerTask": {
      return `${closedLinkExplorerTaskPrefix} ${log.output.claimCount} claims and ${log.output.entityCount} entities discovered`;
    }
    case "InferredClaimsFromText": {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      return `Inferred ${log.output.claimCount} claims and ${log.output.entityCount} entities from ${log.output.resource.title || log.output.resource.url}`;
    }
    case "WorkerWasStopped": {
      return workerWasStoppedTaskPrefix;
    }
    case "ActivityFailed": {
      return `${activityFailedPrefix}${log.message}`;
    }
    case "ResearchActionCheckpoint": {
      return checkpointPrefix;
    }
    case "ResetToCheckpoint": {
      return checkpointResetMessage;
    }
  }
};

const ModelTooltip = ({ text }: { text: string }) => (
  <Tooltip title={text}>
    <Box sx={{ position: "absolute", top: "calc(50% - 6px)", right: 0 }}>
      <CircleInfoIcon
        sx={{ fontSize: 12, fill: ({ palette }) => palette.gray[40], ml: 1 }}
      />
    </Box>
  </Tooltip>
);

const ellipsisOverflow = {
  display: "block",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const Checkpoint = ({ log }: { log: CheckpointLog }) => {
  const { selectedFlowRun } = useFlowRunsContext();

  const [resetFlow] = useMutation<
    ResetFlowMutation,
    ResetFlowMutationVariables
  >(resetFlowMutation);

  const [isResetting, setIsResetting] = useState(false);

  if (!selectedFlowRun) {
    throw new Error(
      "Expected Checkpoint log to be rendered with a Flow Run selected",
    );
  }

  const triggerReset = () => {
    setIsResetting(true);

    void resetFlow({
      variables: {
        flowUuid: selectedFlowRun.flowRunId,
        checkpointId: log.checkpointId,
        eventId: log.eventId,
      },
    }).finally(() => setIsResetting(false));
  };

  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      {checkpointPrefix}
      {!selectedFlowRun.closedAt && (
        <IconButton
          disabled={isResetting}
          onClick={triggerReset}
          sx={{ p: 0.6, borderRadius: "50%" }}
        >
          <RotateRegularIcon sx={{ width: 13, height: 13 }} />
        </IconButton>
      )}
    </Stack>
  );
};

const LogDetail = ({
  log,
  persistedEntities,
}: {
  log: LocalProgressLog;
  persistedEntities: HashEntity[];
}): ReactElement | string => {
  switch (log.type) {
    case "Thread": {
      throw new Error("Expected a log, but got a thread of logs");
    }
    case "VisitedWebPage": {
      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {visitedWebPagePrefix}
          <Link
            href={log.webPage.url}
            sx={{ textDecoration: "none", ...ellipsisOverflow }}
          >
            {log.webPage.title}
          </Link>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "ViewedFile": {
      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {viewedPdfFilePrefix}
          <Link
            href={log.file.url}
            sx={{ textDecoration: "none", ...ellipsisOverflow }}
          >
            {log.file.title}
          </Link>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "QueriedWeb": {
      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {queriedWebPrefix}
          <strong style={ellipsisOverflow}>“{log.query}”</strong>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "ProposedEntity":
    case "PersistedEntityMetadata": {
      const isPersistedEntity = log.type === "PersistedEntityMetadata";

      const entityLabel = getEntityLabelFromLog(log, persistedEntities);

      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {`${
            isPersistedEntity
              ? "Persisted"
              : log.isUpdateToExistingProposal
                ? "Updated proposed"
                : "Proposed"
          } entity `}
          <strong style={ellipsisOverflow}>{entityLabel}</strong>
        </Stack>
      );
    }
    case "CreatedPlan": {
      return (
        <>
          {createdPlanMessage}
          <ModelTooltip text={log.plan} />
        </>
      );
    }
    case "UpdatedPlan": {
      return (
        <>
          {updatedPlanMessage}
          <ModelTooltip text={log.plan} />
        </>
      );
    }
    case "StateChange": {
      return log.message;
    }
    case "StartedCoordinator": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {log.attempt > 1 ? `[${log.attempt}] ` : ""}
            {startedCoordinatorPrefix}
            <strong>“{log.input.goal}”</strong>
          </Box>
        </Stack>
      );
    }
    case "ClosedCoordinator": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {closedCoordinatorPrefix}
            <strong>{log.output.entityCount}</strong> entities discovered
          </Box>
        </Stack>
      );
    }
    case "CoordinatorWaitsForTasks": {
      return <Box>{coordinatorWaitsPrefix}</Box>;
    }
    case "StartedSubCoordinator": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {startedSubCoordinatorPrefix}
            <strong>“{log.input.goal}”</strong>
          </Box>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "ClosedSubCoordinator": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {closedSubCoordinatorPrefix}
            <strong>{log.output.claimCount} claims</strong> and{" "}
            <strong>{log.output.entityCount}</strong> entities discovered
          </Box>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "StartedLinkExplorerTask": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {startedLinkExplorerTaskPrefix}
            <strong>“{log.input.goal}”</strong>
          </Box>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "ClosedLinkExplorerTask": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {closedLinkExplorerTaskPrefix}
            <strong>{log.output.claimCount} claims</strong> and{" "}
            <strong>{log.output.entityCount}</strong> entities discovered
          </Box>
        </Stack>
      );
    }
    case "WorkerWasStopped": {
      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {workerWasStoppedTaskPrefix}
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "InferredClaimsFromText": {
      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Box sx={ellipsisOverflow}>
            Inferred <strong>{log.output.claimCount} claims</strong> and{" "}
            <strong>{log.output.entityCount} entities</strong> from
          </Box>
          <Link
            href={log.output.resource.url}
            sx={{ textDecoration: "none", ...ellipsisOverflow }}
          >
            {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
            {log.output.resource.title || log.output.resource.url}
          </Link>
        </Stack>
      );
    }
    case "ActivityFailed": {
      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {activityFailedPrefix}
          <Box
            component="span"
            sx={{
              ...ellipsisOverflow,
              color: ({ palette }) => palette.red[80],
              fontWeight: 600,
            }}
          >
            {log.message}
          </Box>
        </Stack>
      );
    }
    case "ResearchActionCheckpoint": {
      return <Checkpoint log={log} />;
    }
    case "ResetToCheckpoint": {
      return (
        <Box
          component="span"
          sx={{
            color: ({ palette }) => palette.orange[60],
          }}
        >
          {checkpointResetMessage}
        </Box>
      );
    }
  }
};

type FieldId = "number" | "time" | "detail";

const createColumns = (rowCount: number): VirtualizedTableColumn<FieldId>[] => [
  {
    id: "number",
    label: "#",
    sortable: false,
    width: Math.max(50, rowCount.toString().length * 15),
  },
  {
    id: "time",
    label: "Time",
    sortable: true,
    width: 110,
  },
  {
    id: "detail",
    label: "Detail",
    sortable: true,
    width: "100%",
  },
];

const LogThread = ({
  log,
}: {
  log: LogWithThreadSettings & { type: "Thread" };
}) => {
  const [timeTaken, setTimeTaken] = useState(
    formatTimeTaken(log.threadStartedAt, log.threadClosedAt),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeTaken(formatTimeTaken(log.threadStartedAt, log.threadClosedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [log.threadStartedAt, log.threadClosedAt]);

  const { isOpen, setIsOpen } = log;

  if (!setIsOpen) {
    throw new Error("Expected setIsOpen to be defined for Thread");
  }

  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      <Box sx={ellipsisOverflow}>{log.label}</Box>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: ({ palette }) =>
            log.closedDueToFlowClosure
              ? palette.red[80]
              : log.threadClosedAt
                ? palette.green[80]
                : palette.blue[70],
        }}
      >
        {timeTaken}
      </Typography>
      <IconButton
        aria-label="Show detailed logs"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(!isOpen);
        }}
        size="small"
        unpadded
        rounded
        sx={({ transitions }) => ({
          transform: isOpen ? "none" : "rotate(-90deg)",
          transition: transitions.create("transform", {
            duration: 300,
          }),
        })}
      >
        <CaretDownSolidIcon
          sx={{
            color: ({ palette }) => palette.gray[50],
          }}
        />
      </IconButton>
    </Stack>
  );
};

const TableRow = memo(
  ({
    log,
    persistedEntities,
  }: {
    log: LogWithThreadSettings;
    persistedEntities: HashEntity[];
  }) => {
    const todaysDate = format(new Date(), "yyyy-MM-dd");
    const logDate = format(new Date(log.recordedAt), "yyyy-MM-dd");

    const background = ({ palette }: Theme) =>
      log.level === 1
        ? palette.common.white
        : palette.gray[log.level === 2 ? 15 : 20];

    return (
      <>
        <TableCell sx={{ ...defaultCellSx, background, fontSize: 13 }}>
          {log.number}
        </TableCell>
        <TableCell
          sx={{
            ...defaultCellSx,
            background,
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {todaysDate !== logDate && (
            <>
              {format(new Date(log.recordedAt), "yyyy-MM-dd")}
              <br />
            </>
          )}
          <Tooltip
            title={
              todaysDate === logDate
                ? format(new Date(log.recordedAt), "yyyy-MM-dd h:mm:ss a")
                : ""
            }
          >
            <strong>{format(new Date(log.recordedAt), "h:mm:ss a")}</strong>
          </Tooltip>
        </TableCell>
        <TableCell
          sx={{ ...defaultCellSx, background, fontSize: 13, lineHeight: 1.4 }}
        >
          <Box sx={{ position: "relative", pr: 3, maxWidth: "auto" }}>
            {log.type === "Thread" ? (
              <LogThread log={log} />
            ) : (
              <LogDetail log={log} persistedEntities={persistedEntities} />
            )}
          </Box>
        </TableCell>
      </>
    );
  },
);

const createRowContent =
  (
    persistedEntities: HashEntity[],
  ): CreateVirtualizedRowContentFn<LogWithThreadSettings> =>
  (_index, { data }) => (
    <TableRow log={data} persistedEntities={persistedEntities} />
  );

type LogWithThreadSettings = LocalProgressLog & {
  number: string;
  parentNumber?: string;
  isOpen?: boolean;
  setIsOpen?: (isOpen: boolean) => void;
  owningThreadId?: string;
};

const sortLogs = (
  a: LocalProgressLog,
  b: LocalProgressLog,
  sort: VirtualizedTableSort<FieldId>,
  persistedEntities: HashEntity[],
) => {
  if (sort.fieldId === "time") {
    if (a.recordedAt === b.recordedAt) {
      return 0;
    }
    if (sort.direction === "asc") {
      return a.recordedAt > b.recordedAt ? 1 : -1;
    }

    return a.recordedAt > b.recordedAt ? -1 : 1;
  }

  const aText = getRawTextFromLog(a, persistedEntities);
  const bText = getRawTextFromLog(b, persistedEntities);

  if (sort.direction === "asc") {
    return aText.localeCompare(bText);
  }

  return bText.localeCompare(aText);
};

/**
 * Recursively extracts entity IDs from PersistedEntityMetadata logs.
 * This is used to identify entities that appear in progress logs but may not yet
 * be included in the main batch of persisted entities.
 */
const extractEntityIdsFromLogs = (logs: LocalProgressLog[]): Set<EntityId> => {
  const entityIds = new Set<EntityId>();

  for (const log of logs) {
    if (
      log.type === "PersistedEntityMetadata" &&
      log.persistedEntityMetadata.entityId
    ) {
      entityIds.add(log.persistedEntityMetadata.entityId);
    } else if (log.type === "Thread") {
      for (const entityId of extractEntityIdsFromLogs(log.logs)) {
        entityIds.add(entityId);
      }
    }
  }

  return entityIds;
};

export const ActivityLog = memo(
  ({
    logs,
    logDisplay,
    persistedEntities,
    setLogDisplay,
  }: {
    logs: LocalProgressLog[];
    logDisplay: LogDisplay;
    persistedEntities: HashEntity[];
    setLogDisplay: (display: LogDisplay) => void;
  }) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "time",
      direction: "asc",
    });

    const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());

    /**
     * Find entity IDs from logs reporting persisted entities that haven't yet appeared in step outputs.
     * These need to be fetched separately as a fallback, as they can be reported before the step is finished.
     */
    const missingEntityIds = useMemo(() => {
      const idsFromLogs = extractEntityIdsFromLogs(logs);
      const loadedEntityIds = new Set(
        persistedEntities.map((entity) => entity.entityId),
      );

      return Array.from(idsFromLogs.difference(loadedEntityIds));
    }, [logs, persistedEntities]);

    const missingEntitiesFilter = useMemo<Filter>(
      () => ({
        any: missingEntityIds.map((entityId) => ({
          equal: [
            { path: ["uuid"] },
            { parameter: extractEntityUuidFromEntityId(entityId) },
          ],
        })),
      }),
      [missingEntityIds],
    );

    const { data: missingEntitiesData } = useQuery<
      QueryEntitySubgraphQuery,
      QueryEntitySubgraphQueryVariables
    >(queryEntitySubgraphQuery, {
      variables: {
        request: {
          filter: missingEntitiesFilter,
          graphResolveDepths: {
            constrainsValuesOn: 0,
            constrainsPropertiesOn: 0,
            constrainsLinksOn: 0,
            constrainsLinkDestinationsOn: 0,
            inheritsFrom: 0,
            isOfType: false,
          },
          traversalPaths: [],
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: true,
          includePermissions: false,
        },
      },
      skip: missingEntityIds.length === 0,
      /**
       * Use cache-first with a poll interval to avoid refetching on every render
       * as new logs come in, but still pick up any new entities in the background.
       */
      fetchPolicy: "cache-first",
      pollInterval: 10_000,
    });

    /**
     * Merge the main batch of persisted entities with any missing ones we fetched.
     */
    const allPersistedEntities = useMemo(() => {
      if (!missingEntitiesData) {
        return persistedEntities;
      }

      const subgraph = deserializeSubgraph<EntityRootType<HashEntity>>(
        missingEntitiesData.queryEntitySubgraph.subgraph,
      );

      const fetchedEntities = getRoots(subgraph);

      // Merge, avoiding duplicates
      const entityMap = new Map(
        persistedEntities.map((entity) => [entity.entityId, entity]),
      );
      for (const entity of fetchedEntities) {
        if (!entityMap.has(entity.entityId)) {
          entityMap.set(entity.entityId, entity);
        }
      }

      return [...entityMap.values()];
    }, [missingEntitiesData, persistedEntities]);

    const rows = useMemo<VirtualizedTableRow<LogWithThreadSettings>[]>(() => {
      /**
       * Sort the parents first, because we want to keep the children as appearing directly after their parent in all
       * cases.
       */
      const sortedParents = logs.sort((a, b) =>
        sortLogs(a, b, sort, allPersistedEntities),
      );

      const logsWithThreadSettings: VirtualizedTableRow<LogWithThreadSettings>[] =
        [];

      /**
       * Child logs may themselves have children, so we need to declare a function we can call recursively.
       */
      const addPossibleThread = ({
        log,
        number,
        parentNumber,
      }: {
        log: LocalProgressLog;
        number: string;
        parentNumber?: string;
      }) => {
        if (log.type === "Thread") {
          const isOpen = openThreads.has(log.threadWorkerId);

          logsWithThreadSettings.push({
            id: number,
            data: {
              ...log,
              number,
              parentNumber,
              isOpen,
              setIsOpen: (shouldBeOpen) =>
                setOpenThreads((prevSet) => {
                  const newSet = new Set(prevSet);
                  if (shouldBeOpen) {
                    newSet.add(log.threadWorkerId);
                  } else {
                    newSet.delete(log.threadWorkerId);
                  }
                  return newSet;
                }),
            },
          });

          if (isOpen) {
            for (const [childIndex, childLog] of log.logs
              /**
               * Children will be sorted as an individual group, e.g. so that if 'time / ascending' sort is selected,
               * the child logs will appear latest first, after their parent.
               */
              .sort((a, b) => sortLogs(a, b, sort, allPersistedEntities))
              .entries()) {
              addPossibleThread({
                log: childLog,
                number: `${number}.${childIndex + 1}`,
                parentNumber: number,
              });
            }
            if (log.closedDueToFlowClosure) {
              const childNumber = `${number}.${log.logs.length}`;
              logsWithThreadSettings.push({
                id: childNumber,
                data: {
                  number: childNumber,
                  level: log.level + 1,
                  message: "Flow ended while task was processing",
                  recordedAt: log.threadClosedAt ?? new Date().toISOString(),
                  stepId: "closure",
                  type: "StateChange",
                },
              });
            }
          }
        } else {
          logsWithThreadSettings.push({
            id: number,
            data: {
              ...log,
              number,
              parentNumber,
            },
          });
        }
      };

      for (const [index, log] of sortedParents.entries()) {
        addPossibleThread({
          log,
          number: `${index + 1}`,
        });
      }

      return logsWithThreadSettings;
    }, [logs, openThreads, allPersistedEntities, sort]);

    const columns = useMemo(() => createColumns(rows.length), [rows.length]);

    return (
      <>
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          mb={0.5}
          sx={{ height: 24 }}
        >
          <SectionLabel text="Activity log" />
          <Stack direction="row" alignItems="center" spacing={1} mb={0.4}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: logDisplay === "stream" ? 500 : 400,

                color: ({ palette }) =>
                  logDisplay === "stream"
                    ? palette.common.black
                    : palette.gray[60],
              }}
            >
              Stream
            </Typography>
            <Switch
              checked={logDisplay === "grouped"}
              onChange={() =>
                setLogDisplay(logDisplay === "grouped" ? "stream" : "grouped")
              }
              inputProps={{ "aria-label": "controlled" }}
              size="small"
            />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: logDisplay === "grouped" ? 500 : 400,
                color: ({ palette }) =>
                  logDisplay === "grouped"
                    ? palette.common.black
                    : palette.gray[60],
              }}
            >
              Grouped
            </Typography>
          </Stack>
        </Stack>
        <Box flex={1}>
          <VirtualizedTable
            columns={columns}
            createRowContent={createRowContent(allPersistedEntities)}
            rows={rows}
            sort={sort}
            setSort={setSort}
          />
        </Box>
      </>
    );
  },
);
