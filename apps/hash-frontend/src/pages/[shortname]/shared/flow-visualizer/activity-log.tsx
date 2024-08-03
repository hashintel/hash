import type { VersionedUrl } from "@blockprotocol/type-system";
import { CaretDownSolidIcon, IconButton } from "@hashintel/design-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-graph-types/entity";
import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { Theme } from "@mui/material";
import {
  Box,
  Collapse,
  Stack,
  Switch,
  TableCell,
  Tooltip,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import type { ReactElement } from "react";
import { useEffect, memo, useMemo, useState } from "react";

import { CircleInfoIcon } from "../../../../shared/icons/circle-info-icon";
import { Link } from "../../../../shared/ui/link";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableSort,
} from "../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../shared/virtualized-table";
import { SectionLabel } from "./section-label";
import type {
  LocalProgressLog,
  LogDisplay,
  LogThread as LogThreadType,
} from "./shared/types";
import { formatTimeTaken } from "./shared/format-time-taken";

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
      return "Created research plan";
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
          Created research plan
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
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={ellipsisOverflow}>
            Inferred <strong>{log.output.claimCount} claims</strong> and{" "}
            <strong>{log.output.entityCount} entities</strong> from{" "}
            <Link
              href={log.output.resource.url}
              sx={{ textDecoration: "none", ...ellipsisOverflow }}
            >
              {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
              {log.output.resource.title || log.output.resource.url}
            </Link>
          </Box>
        </Stack>
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

const TableRow = memo(({ log }: { log: LocalProgressLog }) => {
  const [showChildren, setShowChildren] = useState(false);

  const todaysDate = format(new Date(), "yyyy-MM-dd");
  const logDate = format(new Date(log.recordedAt), "yyyy-MM-dd");

  const background = ({ palette }: Theme) =>
    log.level === 1
      ? palette.common.white
      : palette.gray[log.level === 2 ? 10 : 20];

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
            // eslint-disable-next-line @typescript-eslint/no-use-before-define -- function will be hoisted
            <LogThread
              log={log}
              showChildren={showChildren}
              setShowChildren={setShowChildren}
            />
          ) : (
            <LogDetail log={log} />
          )}
        </Box>
      </TableCell>

      {"logs" in log && (
        <Collapse in={showChildren}>
          {log.logs.map((childLog, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <TableRow key={index} log={childLog} />
          ))}
        </Collapse>
      )}
    </>
  );
});

// eslint-disable-next-line react/function-component-definition -- needs to be hoisted due to circular references between components
function LogThread({
  log,
  showChildren,
  setShowChildren,
}: {
  log: LogThreadType;
  showChildren: boolean;
  setShowChildren: (show: boolean) => void;
}) {
  const [timeTaken, setTimeTaken] = useState(
    formatTimeTaken(log.threadStartedAt, log.threadClosedAt),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeTaken(formatTimeTaken(log.threadStartedAt, log.threadClosedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [log.threadStartedAt, log.threadClosedAt]);

  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      <Box sx={ellipsisOverflow}>{log.label}</Box>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: ({ palette }) =>
            log.threadClosedAt ? palette.green[80] : palette.blue[70],
        }}
      >
        {timeTaken}
      </Typography>
      <IconButton
        aria-label="Show detailed logs"
        onClick={(event) => {
          event.stopPropagation();
          setShowChildren(!showChildren);
        }}
        size="small"
        unpadded
        rounded
        sx={({ transitions }) => ({
          transform: showChildren ? "none" : "rotate(-90deg)",
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
}

const createRowContent: CreateVirtualizedRowContentFn<LocalProgressLog> = (
  _index,
  row,
) => <TableRow log={row.data} />;

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

    const rows = useMemo(() => {
      return logs
        .sort((a, b) => {
          if (sort.field === "time") {
            if (sort.direction === "asc") {
              return a.recordedAt > b.recordedAt ? 1 : -1;
            }

            return a.recordedAt > b.recordedAt ? 1 : -1;
          }

          if (sort.direction === "asc") {
            return getRawTextFromLog(a) > getRawTextFromLog(b) ? -1 : 1;
          }

          return getRawTextFromLog(b) < getRawTextFromLog(a) ? 1 : -1;
        })
        .map((log, index) => ({
          id: `${index}-${log.recordedAt}`,
          data: log,
        }));
    }, [logs, sort]);

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
