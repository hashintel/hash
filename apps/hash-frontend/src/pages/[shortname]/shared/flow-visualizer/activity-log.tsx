import { format } from "date-fns";
import type { memo, ReactElement , useMemo, useState } from "react";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-graph-types/entity";
import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { Box, Stack, TableCell, Tooltip } from "@mui/material";

import { CircleInfoIcon } from "../../../../shared/icons/circle-info-icon";
import { Link } from "../../../../shared/ui/link";
import type {
  CreateVirtualizedRowContentFn,
  defaultCellSx,
  VirtualizedTable,  VirtualizedTableColumn,
  VirtualizedTableSort} from "../../../shared/virtualized-table";

import { SectionLabel } from "./section-label";
import type { LocalProgressLog } from "./shared/types";

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
    case "StartedSubTask": {
      return `Started sub-task with goal “${log.goal}”`;
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
    case "VisitedWebPage": {
      return (
        <Stack direction={"row"} alignItems={"center"} gap={0.5}>
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
        <Stack direction={"row"} alignItems={"center"} gap={0.5}>
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
        <Stack direction={"row"} alignItems={"center"} gap={0.5}>
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
        <Stack direction={"row"} alignItems={"center"} gap={0.5}>
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
    case "StartedSubTask": {
      return (
        <Stack direction={"row"} alignItems={"center"} gap={1}>
          <Box sx={ellipsisOverflow}>
            Started sub-task with goal <strong>“{log.goal}”</strong>
          </Box>
          <ModelTooltip text={log.explanation} />
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

const TableRow = memo(
  ({ index, log }: { index: number; log: LocalProgressLog }) => {
    const todaysDate = format(new Date(), "yyyy-MM-dd");
    const logDate = format(new Date(log.recordedAt), "yyyy-MM-dd");

    return (
      <>
        <TableCell sx={{ ...defaultCellSx, fontSize: 13 }}>
          {index + 1}
        </TableCell>
        <TableCell
          sx={{
            ...defaultCellSx,
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
        <TableCell sx={{ ...defaultCellSx, fontSize: 13, lineHeight: 1.4 }}>
          <Box sx={{ position: "relative", pr: 3, maxWidth: "auto" }}>
            <LogDetail log={log} />
          </Box>
        </TableCell>
      </>
    );
  },
);

const createRowContent: CreateVirtualizedRowContentFn<LocalProgressLog> = (
  index,
  row,
) => <TableRow index={index} log={row.data} />;

export const ActivityLog = ({ logs }: { logs: LocalProgressLog[] }) => {
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

  const columns = useMemo(() => createColumns(rows.length), [rows]);

  return (
    <>
      <Stack alignItems={"center"} direction={"row"} mb={0.5} sx={{ height: 24 }}>
        <SectionLabel text={"Activity log"} />
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
};
