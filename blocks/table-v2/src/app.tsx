import {
  useEntitySubgraph,
  type BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import { useRef, useState } from "react";

import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid";
import styles from "./base.module.scss";
import { Grid } from "./components/grid/grid";
import { LocalColumnDefinition, LocalRowId, Row } from "./types";
import { RootEntity, RootEntityLinkedEntities } from "./types.gen";
import { TableTitle } from "./components/table-title";

const sampleColumnDefinitions: LocalColumnDefinition[] = [
  {
    id: "firstName",
    title: "First Name",
  },
  { id: "lastName", title: "Last Name" },
  { id: "role", title: "Role" },
];

const sampleRows: Row[] = [
  { firstName: "David", lastName: "Wilkinson", role: "CEO" },
  { firstName: "Ciaran", lastName: "Morinan", role: "Head of Engineering" },
  { firstName: "Yusuf", lastName: "Kınataş", role: "Platform Engineer" },
  { firstName: "Alfie", lastName: "Mountfield", role: "Platform Engineer" },
];

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);

  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const titleKey: keyof RootEntity["properties"] =
    "https://alpha.hash.ai/@yusuf/types/property-type/table-title/";

  const {
    metadata: {
      editionId: { baseId: blockEntityId },
      entityTypeId: blockEntityTypeId,
    },
    properties: { [titleKey]: title },
  } = blockEntity;

  const [rows, setRows] = useState(sampleRows);
  const [columns, setColumns] = useState<GridColumn[]>(
    sampleColumnDefinitions.map((col) => ({
      ...col,
      width: 200,
    })),
  );

  const addNewColumn = () => {
    setColumns((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        width: 200,
        title: `Column ${prev.length + 1}`,
      },
    ]);
  };

  const addNewRow = () => {
    setRows((prev) => [...prev, {}]);
  };

  const setTitle = async (val: string) => {
    await graphService?.updateEntity<RootEntity["properties"]>({
      data: {
        entityId: blockEntityId,
        entityTypeId: blockEntityTypeId,
        properties: { [titleKey]: val },
      },
    });
  };

  return (
    <div className={styles.block} ref={blockRootRef}>
      <TableTitle onChange={setTitle} title={title ?? ""} />
      <Grid
        rows={rows.length}
        columns={columns}
        rightElement={
          <div className={styles.addColumnButton} onClick={addNewColumn}>
            Add a Column +
          </div>
        }
        rightElementProps={{ fill: true }}
        trailingRowOptions={{
          hint: "New row...",
          sticky: true,
          tint: true,
        }}
        onRowAppended={addNewRow}
        rowMarkers="both"
        getCellContent={([colIndex, rowIndex]) => {
          const key = columns[colIndex]?.id as LocalRowId;
          const value = rows[rowIndex]?.[key] ?? "";

          return {
            kind: GridCellKind.Text,
            displayData: value,
            data: value,
            allowOverlay: true,
          };
        }}
      />
    </div>
  );
};
