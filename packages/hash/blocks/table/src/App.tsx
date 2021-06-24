import React, { VoidFunctionComponent } from "react";
import { Column, TableOptions, useTable } from "react-table";
import { EditableCell } from "./components/EditableCell";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";

import "./styles.scss";
import { BlockProtocolUpdateFn, JSONObject } from "./types/blockProtocol";

export type TableColumn = Column<Record<string, any>> & {
  columns?: TableColumn[];
};

type AppProps = {
  columns: TableColumn[];
  data: Record<string, any>[];
  initialState?: TableOptions<{}>["initialState"];
  schemas?: Record<string, JSONObject>;
  update?: BlockProtocolUpdateFn;
};

export const App: VoidFunctionComponent<AppProps> = ({
  columns,
  data,
  initialState,
  schemas,
  update,
}) => {
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({
      columns,
      initialState,
      data,
      defaultColumn: {
        Cell: EditableCell,
      },
      updateData: update,
    });

  // Render the UI for your table
  return (
    <table {...getTableProps()}>
      <thead>
        {headerGroups.map((headerGroup) => (
          <tr {...headerGroup.getHeaderGroupProps()}>
            {headerGroup.headers.map((column) => (
              <th {...column.getHeaderProps()}>{column.render("Header")}</th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody {...getTableBodyProps()}>
        {rows.map((row) => {
          prepareRow(row);
          return (
            <tr {...row.getRowProps()}>
              {row.cells.map((cell) => {
                const { column, row } = cell;
                const { entity, property } = identityEntityAndProperty(
                  row.original,
                  column.id
                );
                const propertyDef = getSchemaPropertyDefinition(
                  (schemas ?? {})[entity.type],
                  property
                );
                const readOnly = propertyDef?.readOnly;
                return (
                  <td {...cell.getCellProps()}>
                    {cell.render("Cell", { readOnly })}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
