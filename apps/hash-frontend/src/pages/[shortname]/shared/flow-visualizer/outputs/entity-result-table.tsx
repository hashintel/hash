import type { VersionedUrl } from "@blockprotocol/type-system";
import { Chip } from "@hashintel/design-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-graph-types/entity";
import type {
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, TableCell } from "@mui/material";
import { memo, useMemo, useState } from "react";

import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  VirtualizedTableSort,
} from "../../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../../shared/virtualized-table";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type FieldId = "status" | "entityTypeId" | "entityLabel";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Status",
    id: "status",
    sortable: true,
    width: 100,
  },
  {
    label: "Type",
    id: "entityTypeId",
    sortable: true,
    width: 120,
  },
  {
    label: "Name",
    id: "entityLabel",
    sortable: true,
    width: "100%",
  },
];

type EntityResultRow = {
  entityLabel: string;
  entityTypeId: string;
  onEntityClick: (entity: Entity) => void;
  onEntityTypeClick: (entityTypeId: VersionedUrl) => void;
  persistedEntity?: Entity;
  status: "Proposed" | "New" | "Updated";
};

const cellSx = {
  ...defaultCellSx,
  fontSize: 13,
};

const TableRow = memo(({ row }: { row: EntityResultRow }) => {
  const entityTypeTitle =
    row.entityTypeId.split("/").at(-3)?.replaceAll("-", " ") ?? "";

  return (
    <>
      <TableCell sx={cellSx}>{row.status}</TableCell>
      <TableCell sx={{ ...cellSx, px: 0.5 }}>
        <Box
          component="button"
          onClick={() =>
            row.onEntityTypeClick(row.entityTypeId as VersionedUrl)
          }
          sx={{ background: "none", border: "none", p: 0 }}
        >
          <Chip
            color="blue"
            label={entityTypeTitle}
            sx={{
              cursor: "pointer !important",
              ml: 1,
              "& span": {
                fontSize: 11,
                padding: "2px 10px",
                textTransform: "capitalize",
              },
            }}
          />
        </Box>
      </TableCell>
      <TableCell sx={cellSx}>
        {row.persistedEntity ? (
          <Box
            component="button"
            onClick={() => row.onEntityClick(row.persistedEntity!)}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: ({ palette }) => palette.blue[70],
              p: 0,
              textAlign: "left",
            }}
          >
            {row.entityLabel}
          </Box>
        ) : (
          row.entityLabel
        )}
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<EntityResultRow> = (
  _index,
  row,
) => <TableRow row={row.data} />;

type EntityResultTableProps = {
  onEntityClick: (entity: Entity) => void;
  onEntityTypeClick: (entityTypeId: VersionedUrl) => void;
  persistedEntities: PersistedEntity[];
  persistedEntitiesSubgraph?: Subgraph<EntityRootType>;
  proposedEntities: Omit<ProposedEntity, "provenance">[];
};

export const EntityResultTable = ({
  onEntityClick,
  onEntityTypeClick,
  persistedEntities,
  persistedEntitiesSubgraph,
  proposedEntities,
}: EntityResultTableProps) => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    field: "entityLabel",
    direction: "asc",
  });

  const hasData = persistedEntities.length || proposedEntities.length;

  const rows: VirtualizedTableRow<EntityResultRow>[] = useMemo(() => {
    const rowData: VirtualizedTableRow<EntityResultRow>[] = [];
    for (const record of persistedEntities.length
      ? persistedEntities
      : proposedEntities) {
      const entity =
        "operation" in record
          ? record.entity
            ? new Entity(record.entity)
            : undefined
          : record;

      if (!entity) {
        continue;
      }

      const entityId =
        "localEntityId" in entity
          ? entity.localEntityId
          : entity.metadata.recordId.entityId;

      const entityTypeId =
        "entityTypeId" in entity
          ? entity.entityTypeId
          : entity.metadata.entityTypeId;

      const entityLabel = generateEntityLabel(
        persistedEntitiesSubgraph ?? null,
        {
          properties: entity.properties,
          metadata: {
            recordId: {
              editionId: "irrelevant-here",
              entityId: `ownedBy~${entityId}` as EntityId,
            } satisfies EntityRecordId,
            entityTypeId: entityTypeId satisfies VersionedUrl,
          } as EntityMetadata,
        },
      );

      rowData.push({
        id: entityId,
        data: {
          entityLabel,
          entityTypeId,
          onEntityClick,
          onEntityTypeClick,
          persistedEntity: "metadata" in entity ? entity : undefined,
          status:
            "localEntityId" in record
              ? "Proposed"
              : record.operation === "update"
                ? "Updated"
                : "New",
        },
      });
    }

    return rowData.sort((a, b) => {
      const field = sort.field;
      const direction = sort.direction === "asc" ? 1 : -1;

      return a.data[field].localeCompare(b.data[field]) * direction;
    });
  }, [
    onEntityClick,
    onEntityTypeClick,
    persistedEntities,
    persistedEntitiesSubgraph,
    proposedEntities,
    sort,
  ]);

  return (
    <OutputContainer
      sx={{
        flex: 1,
        minWidth: 400,
      }}
    >
      {hasData ? (
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          rows={rows}
          sort={sort}
          setSort={setSort}
        />
      ) : (
        <EmptyOutputBox
          Icon={outputIcons.table}
          label="Entities proposed and affected by this flow will appear in a table here"
        />
      )}
    </OutputContainer>
  );
};
