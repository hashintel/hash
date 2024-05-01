import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  CustomCell,
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
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

// import { Grid } from "../../../components/grid/grid";
import { Cell } from "../../settings/organizations/shared/cell";
import { OrgTable } from "../../settings/organizations/shared/org-table";
import { flowSectionBorderRadius } from "./shared/styles";
// import { renderChipCell } from "../../shared/chip-cell";

const columns: SizedGridColumn[] = [
  {
    title: "Status",
    id: "status",
    width: 150,
    grow: 0,
  },
  {
    title: "Type",
    id: "type",
    width: 200,
    grow: 1,
  },
  {
    title: "Name",
    id: "name",
    width: 200,
    grow: 2,
  },
];

type EntityResultRow = {
  rowId: string;
  entityId: EntityId;
  entityLabel: string;
  entityTypeTitle: string;
  status: "Proposed" | "New" | "Updated";
};

const _createGetCellContent =
  (entityRows: EntityResultRow[]) =>
  ([colIndex, rowIndex]: Item): TextCell | CustomCell => {
    const columnId = columns[colIndex]?.id;

    if (columnId) {
      const row = entityRows[rowIndex];

      if (!row) {
        throw new Error(`Row not found for index ${rowIndex}`);
      }

      if (columnId === "status") {
        return {
          kind: GridCellKind.Text,
          allowOverlay: false,
          data: row.status,
          displayData: row.status,
          readonly: true,
        };
      }

      if (columnId === "type") {
        return {
          kind: GridCellKind.Custom,
          readonly: true,
          allowOverlay: false,
          copyData: row.entityTypeTitle,
          data: {
            kind: "chip-cell",
            chips: [
              {
                text: row.entityTypeTitle,
                icon: "bpAsteriskCircle",
              },
            ],
            color: "white",
            variant: "filled",
          },
        };
      }

      return {
        kind: GridCellKind.Text,
        allowOverlay: false,
        data: row.entityLabel,
        displayData: row.entityLabel,
        readonly: true,
      };
    }

    throw new Error("Column not found");
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
        height: "100%",
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
  // @todo figure out why this Grid is not rendering and replace the table above with it
  // const rows: EntityResultRow[] = [
  //   {
  //     rowId: "1",
  //     entityId: "1" as EntityId,
  //     entityLabel: "Entity 1",
  //     entityTypeTitle: "Type 1",
  //     status: "Proposed",
  //   },
  // ];
  //
  // return (
  //   <Grid<EntityResultRow>
  //     columns={columns}
  //     createGetCellContent={createGetCellContent}
  //     dataLoading={false}
  //     rows={rows}
  //     height="100%"
  //     customRenderers={[renderChipCell]}
  //   />
  // );
};
