import type { VersionedUrl } from "@blockprotocol/type-system";
import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-subgraph";
import { Box, Stack, TableCell } from "@mui/material";
import { format } from "date-fns";
import type { ReactElement } from "react";
import { memo, useMemo, useState } from "react";

import { Link } from "../../../../../shared/ui/link";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableSort,
} from "../../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../../shared/virtualized-table";
import { SectionLabel } from "./section-label";
import type { LocalProgressLog } from "./shared/types";

const getEntityLabelFromLog = (log: StepProgressLog): string => {
  if (log.type !== "ProposedEntity" && log.type !== "PersistedEntity") {
    throw new Error(`Unexpected log type ${log.type}`);
  }

  const isPersistedEntity = "persistedEntity" in log;

  const entity = isPersistedEntity
    ? log.persistedEntity.entity
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
    ...entity,
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
      return `${viewedPdfFilePrefix}${log.fileUrl}`;
    }
    case "StateChange": {
      return log.message;
    }
    case "CreatedPlan": {
      return "Created research plan";
    }
  }
};

const LogDetail = ({
  log,
}: {
  log: LocalProgressLog;
}): ReactElement | string => {
  switch (log.type) {
    case "VisitedWebPage": {
      return (
        <>
          {visitedWebPagePrefix}
          <Link href={log.webPage.url} sx={{ textDecoration: "none" }}>
            {log.webPage.title}
          </Link>
        </>
      );
    }
    case "ViewedFile": {
      return (
        <>
          {viewedPdfFilePrefix}
          <Link href={log.fileUrl} sx={{ textDecoration: "none" }}>
            {log.fileUrl}
          </Link>
        </>
      );
    }
    case "QueriedWeb": {
      return (
        <>
          {queriedWebPrefix}
          <strong>“{log.query}”</strong>
        </>
      );
    }
    case "ProposedEntity":
    case "PersistedEntity": {
      const isPersistedEntity = "persistedEntity" in log;

      const entityLabel = getEntityLabelFromLog(log);

      return (
        <>
          {isPersistedEntity ? "Persisted" : "Proposed"} entity{" "}
          <strong>{entityLabel}</strong>
        </>
      );
    }
    case "CreatedPlan": {
      return "Created research plan";
    }
    case "StateChange": {
      return log.message;
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
          {format(new Date(log.recordedAt), "yyyy-MM-dd")}
          <br />
          <strong>{format(new Date(log.recordedAt), "h:mm:ss a")}</strong>
        </TableCell>
        <TableCell sx={{ ...defaultCellSx, fontSize: 13, lineHeight: 1.4 }}>
          <LogDetail log={log} />
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
      <Stack alignItems="center" direction="row" mb={0.5} sx={{ height: 24 }}>
        <SectionLabel text="Activity log" />
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
