import React, { useMemo } from "react";
import { TableOptions, useTable } from "react-table";
import { EditableCell } from "./components/EditableCell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";
import { BlockComponent } from "@hashintel/block-protocol/react";

import "./styles.scss";

type AppProps = {
  data?: Record<string, any>[];
  initialState?: TableOptions<{}>["initialState"];
};

export const App: BlockComponent<AppProps> = ({
  data,
  initialState,
  schemas,
  update,
}) => {
  data = data ?? [];
  const columns = useMemo(() => makeColumns(data?.[0] ?? {}), [data[0]]);

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
