import { useMutation } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  CaretDownSolidIcon,
  IconButton,
  RotateIconRegular,
} from "@hashintel/design-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-graph-types/entity";
import type {
  CheckpointLog,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
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
  ResetFlowMutation,
  ResetFlowMutationVariables,
} from "../../../../graphql/api-types.gen";
import { resetFlowMutation } from "../../../../graphql/queries/knowledge/flow.queries";
import { CircleInfoIcon } from "../../../../shared/icons/circle-info-icon";
import { Link } from "../../../../shared/ui/link";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  VirtualizedTableSort,
} from "../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../shared/virtualized-table";
import { SectionLabel } from "./section-label";
import { formatTimeTaken } from "./shared/format-time-taken";
import type { LocalProgressLog, LogDisplay } from "./shared/types";

const getEntityLabelFromLog = (log: StepProgressLog): string => {
  if (log.type !== "ProposedEntity" && log.type !== "PersistedEntity") {
    throw new Error(`Unexpected log type ${log.type}`);
  }

  const isPersistedEntity = "persistedEntity" in log;

  const entity = isPersistedEntity
    ? log.persistedEntity.entity
      ? new Entity(log.persistedEntity.entity)
      : undefined
    : log.proposedEntity;

  if (!entity) {
    return "Entity persistence failed";
  }

  const entityId =
    "localEntityId" in entity
      ? entity.localEntityId
      : entity.metadata.recordId.entityId;

  const entityTypeId =
    "entityTypeId" in entity
      ? entity.entityTypeId
      : entity.metadata.entityTypeId;

  const entityLabel = generateEntityLabel(null, {
    properties: entity.properties,
    metadata: {
      recordId: {
        editionId: "irrelevant-here",
        entityId: `ownedBy~${entityId}` as EntityId,
      } satisfies EntityRecordId,
      entityTypeId: entityTypeId satisfies VersionedUrl,
    } as EntityMetadata,
  });

  return entityLabel;
};

const getEntityPrefixFromLog = (log: StepProgressLog): string => {
  if (log.type !== "ProposedEntity" && log.type !== "PersistedEntity") {
    throw new Error(`Unexpected log type ${log.type}`);
  }

  const isPersistedEntity = "persistedEntity" in log;

  return isPersistedEntity ? "Persisted entity" : "Proposed entity";
};

const visitedWebPagePrefix = "Visited ";
const viewedPdfFilePrefix = "Viewed PDF file at ";
const queriedWebPrefix = "Searched web for ";
const startedCoordinatorPrefix = "Started research coordinator with goal ";
const closedCoordinatorPrefix = "Finished research coordinator with ";
const startedSubTaskPrefix = "Started sub-task with goal ";
const closedSubTaskPrefix = "Finished sub-task with ";
const startedLinkExplorerTaskPrefix = "Started link explorer task with goal ";
const closedLinkExplorerTaskPrefix = "Finished link explorer task with ";
const activityFailedPrefix = "Activity failed: ";
const checkpointPrefix = "Checkpoint recorded";
const checkpointResetMessage = "Flow resumed from checkpoint";
const createdPlanMessage = "Created research plan";
const updatedPlanMessage = "Updated research plan";

const getRawTextFromLog = (log: LocalProgressLog): string => {
  switch (log.type) {
    case "VisitedWebPage": {
      return `${visitedWebPagePrefix}${log.webPage.title}`;
    }
    case "QueriedWeb": {
      return `${queriedWebPrefix}“${log.query}”`;
    }
    case "ProposedEntity":
    case "PersistedEntity": {
      const prefix = getEntityPrefixFromLog(log);

      const entityLabel = getEntityLabelFromLog(log);

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
    case "StartedSubTask": {
      return `${startedSubTaskPrefix}“${log.input.goal}”`;
    }
    case "ClosedSubTask": {
      return `${closedSubTaskPrefix} ${log.output.claimCount} claims and ${log.output.entityCount} entities discovered`;
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
          <RotateIconRegular sx={{ width: 13, height: 13 }} />
        </IconButton>
      )}
    </Stack>
  );
};

const LogDetail = ({
  log,
}: {
  log: LocalProgressLog;
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
    case "PersistedEntity": {
      const isPersistedEntity = "persistedEntity" in log;

      const entityLabel = getEntityLabelFromLog(log);

      return (
        <Stack direction="row" alignItems="center" gap={0.5}>
          {isPersistedEntity ? "Persisted" : "Proposed"} entity{" "}
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
    case "StartedSubTask": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {startedSubTaskPrefix}
            <strong>“{log.input.goal}”</strong>
          </Box>
          <ModelTooltip text={log.explanation} />
        </Stack>
      );
    }
    case "ClosedSubTask": {
      return (
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            {closedSubTaskPrefix}
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

const TableRow = memo(({ log }: { log: LogWithThreadSettings }) => {
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
            <LogDetail log={log} />
          )}
        </Box>
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<LogWithThreadSettings> = (
  _index,
  row,
) => <TableRow log={row.data} />;

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
) => {
  if (sort.field === "time") {
    if (a.recordedAt === b.recordedAt) {
      return 0;
    }
    if (sort.direction === "asc") {
      return a.recordedAt > b.recordedAt ? 1 : -1;
    }

    return a.recordedAt > b.recordedAt ? -1 : 1;
  }

  const aText = getRawTextFromLog(a);
  const bText = getRawTextFromLog(b);

  if (sort.direction === "asc") {
    return aText.localeCompare(bText);
  }

  return bText.localeCompare(aText);
};

export const ActivityLog = memo(
  ({
    logs,
    logDisplay,
    setLogDisplay,
  }: {
    logs: LocalProgressLog[];
    logDisplay: LogDisplay;
    setLogDisplay: (display: LogDisplay) => void;
  }) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      field: "time",
      direction: "asc",
    });

    const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());

    const rows = useMemo<VirtualizedTableRow<LogWithThreadSettings>[]>(() => {
      /**
       * Sort the parents first, because we want to keep the children as appearing directly after their parent in all
       * cases.
       */
      const sortedParents = logs.sort((a, b) => sortLogs(a, b, sort));

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
              .sort((a, b) => sortLogs(a, b, sort))
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
    }, [logs, openThreads, sort]);

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
            createRowContent={createRowContent}
            rows={rows}
            sort={sort}
            setSort={setSort}
          />
        </Box>
      </>
    );
  },
);
