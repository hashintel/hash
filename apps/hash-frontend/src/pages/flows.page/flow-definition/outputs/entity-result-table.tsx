import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
} from "@local/hash-subgraph";
import { TableCell } from "@mui/material";
import { memo, useMemo, useState } from "react";

import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  VirtualizedTableSort,
} from "../shared/virtualized-table";
import { VirtualizedTable } from "../shared/virtualized-table";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

type FieldId = "status" | "entityTypeTitle" | "entityLabel";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Status",
    id: "status",
    sortable: true,
    width: 100,
  },
  {
    label: "Type",
    id: "entityTypeTitle",
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
  entityTypeTitle: string;
  status: "Proposed" | "New" | "Updated";
};

type EntityResultTableProps = {
  persistedEntities: PersistedEntity[];
  proposedEntities: ProposedEntity[];
};

const TableRow = memo(({ row }: { row: EntityResultRow }) => {
  return (
    <>
      <TableCell sx={{ fontSize: 13 }}>{row.status}</TableCell>
      <TableCell sx={{ fontSize: 13 }}>{row.entityTypeTitle}</TableCell>
      <TableCell sx={{ fontSize: 13 }}>{row.entityLabel}</TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<EntityResultRow> = (
  _index,
  row,
) => <TableRow row={row.data} />;

export const EntityResultTable = ({
  persistedEntities,
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
      const entity = "operation" in record ? record.entity : record;

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

      const entityTitle = entityTypeId.split("/").at(-3) ?? "";
      const capitalizedTitle =
        entityTitle.charAt(0).toUpperCase() + entityTitle.slice(1);

      rowData.push({
        id: entityId,
        data: {
          entityLabel,
          entityTypeTitle: capitalizedTitle,
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

      if (a.data[field] < b.data[field]) {
        return 1 * direction;
      }

      if (a.data[field] > b.data[field]) {
        return -1 * direction;
      }

      return 0;
    });
  }, [persistedEntities, proposedEntities, sort]);

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
