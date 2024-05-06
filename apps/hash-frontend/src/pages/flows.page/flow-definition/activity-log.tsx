import type { VersionedUrl } from "@blockprotocol/type-system";
import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-subgraph";
import { TableCell } from "@mui/material";
import { format } from "date-fns";

import { Link } from "../../../shared/ui/link";
import {
  CreateVirtualizedRowContentFn,
  VirtualizedTable,
  VirtualizedTableColumn,
} from "./shared/virtualized-table";
import { memo, useMemo } from "react";

const LogDetail = ({ log }: { log: StepProgressLog }) => {
  switch (log.type) {
    case "VisitedWebPage": {
      return (
        <>
          Visited{" "}
          <Link href={log.webPage.url} sx={{ textDecoration: "none" }}>
            {log.webPage.title}
          </Link>
        </>
      );
    }
    case "QueriedWeb": {
      return (
        <>
          Searched web for <strong>“{log.query}”</strong>
        </>
      );
    }
    case "ProposedEntity":
    case "PersistedEntity": {
      const entity =
        "persistedEntity" in log
          ? log.persistedEntity.entity
          : log.proposedEntity;

      if (!entity) {
        return <></>;
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

      return (
        <>
          Proposed entity <strong>{entityLabel}</strong>
        </>
      );
    }
  }
};

const createColumns = (rowCount: number): VirtualizedTableColumn[] => [
  {
    id: "number",
    label: "#",
    width: Math.max(50, rowCount.toString().length * 15),
  },
  {
    id: "time",
    label: "Time",
    width: 100,
  },
  {
    id: "detail",
    label: "Detail",
    width: "100%",
  },
];

const TableRow = memo(
  ({ index, log }: { index: number; log: StepProgressLog }) => {
    return (
      <>
        <TableCell sx={{ fontSize: 13, width: 100 }}>{index + 1}</TableCell>
        <TableCell
          sx={{
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {format(new Date(log.recordedAt), "yyyy-MM-dd")}
          <br />
          <strong>{format(new Date(log.recordedAt), "h:mm:ss a")}</strong>
        </TableCell>
        <TableCell sx={{ fontSize: 13, width: "100%", lineHeight: 1.4 }}>
          <LogDetail log={log} />
        </TableCell>
      </>
    );
  },
);

const createRowContent: CreateVirtualizedRowContentFn<StepProgressLog> = (
  index,
  row,
) => <TableRow index={index} log={row.data} />;

export const ActivityLog = ({ logs }: { logs: StepProgressLog[] }) => {
  const rows = useMemo(
    () =>
      logs.map((log, index) => ({
        id: `${index}-${log.recordedAt}`,
        data: log,
      })),
    [logs],
  );

  const columns = useMemo(() => createColumns(rows.length), [rows]);

  return (
    <VirtualizedTable
      columns={columns}
      createRowContent={createRowContent}
      height="100%"
      rows={rows}
    />
  );
};
