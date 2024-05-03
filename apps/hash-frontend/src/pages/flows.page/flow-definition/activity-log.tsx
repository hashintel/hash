import type { VersionedUrl } from "@blockprotocol/type-system";
import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-subgraph";
import { TableBody, TableCell, TableRow } from "@mui/material";
import { format } from "date-fns";

import { Link } from "../../../shared/ui/link";
import { OrgTable } from "../../settings/organizations/shared/org-table";

const LogDetail = ({ log }: { log: StepProgressLog }) => {
  switch (log.type) {
    case "VisitedWebPage": {
      return (
        <>
          Visited <Link href={log.webPage.url}>{log.webPage.title}</Link>
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

export const ActivityLog = ({ logs }: { logs: StepProgressLog[] }) => {
  return (
    <OrgTable
      sx={{
        background: "white",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        minWidth: 400,
        display: "block",
        overflow: "auto",
        "th, td": {
          padding: "10px 8px",
          "&:first-of-type": {
            paddingLeft: "12px",
          },
          "&:last-of-type": {
            paddingRight: "12px",
          },
        },
      }}
    >
      <TableBody>
        {logs.map((log, index) => {
          return (
            <TableRow key={`${log.recordedAt}-${index}`}>
              <TableCell sx={{ fontSize: 13 }}>{index + 1}</TableCell>
              <TableCell
                sx={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  width: 100,
                  textAlign: "right",
                }}
              >
                {format(new Date(log.recordedAt), "yyyy-MM-dd")}
                <br />
                {format(new Date(log.recordedAt), "h:mm:ss a")}
              </TableCell>
              <TableCell sx={{ fontSize: 13 }}>
                <LogDetail log={log} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </OrgTable>
  );
};
