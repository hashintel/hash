import type { VersionedUrl } from "@blockprotocol/type-system";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  Entity,
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-subgraph";
import {
  Box,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { Cell } from "../../../settings/organizations/shared/cell";
import { OrgTable } from "../../../settings/organizations/shared/org-table";
import { flowSectionBorderRadius } from "../shared/styles";

const columns = [
  {
    title: "Status",
    id: "status",
    width: 150,
  },
  {
    title: "Type",
    id: "type",
    width: 200,
  },
  {
    title: "Name",
    id: "name",
    width: 200,
  },
];

type EntityResultRow = {
  rowId: string;
  entityId: EntityId;
  entityLabel: string;
  entityTypeTitle: string;
  status: "Proposed" | "New" | "Updated";
};

type EntityResultTableProps = {
  persistedEntities: Entity[];
  proposedEntities: ProposedEntity[];
};

export const EntityResultTable = ({
  persistedEntities,
  proposedEntities,
}: EntityResultTableProps) => {
  const hasData = persistedEntities.length || proposedEntities.length;

  return (
    <Box
      sx={{
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: flowSectionBorderRadius,
        textAlign: "center",
        width: "50%",
      }}
    >
      {hasData ? (
        <OrgTable
          sx={{
            maxWidth: "100%",
            maxHeight: "100%",
            display: "block",
            overflow: "auto",
          }}
        >
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <Cell key={column.id}>{column.title}</Cell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {(persistedEntities.length
              ? persistedEntities
              : proposedEntities
            ).map((entity) => {
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
                <TableRow key={entityId}>
                  <TableCell sx={{ fontSize: 13 }}>
                    {"localEntityId" in entity ? "Proposed" : "New"}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>
                    {entityTypeId.split("/").at(-3)}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{entityLabel}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </OrgTable>
      ) : (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{ height: "100%", p: 4 }}
        >
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Entities inferred from the Flow will appear here
          </Typography>
        </Stack>
      )}
    </Box>
  );
};
