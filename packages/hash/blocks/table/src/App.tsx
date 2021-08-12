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
  const columns = useMemo(() => makeColumns(data?.[0] ?? {}), [data]);

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

  /** @todo Fix keys in iterators below to not use the index */
  return (
    <table {...getTableProps()}>
      <thead>
        {headerGroups.map((headerGroup, i) => (
          <tr {...headerGroup.getHeaderGroupProps()} key={i}>
            {headerGroup.headers.map((column, i) => (
              <th {...column.getHeaderProps()} key={i}>
                {column.render("Header")}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody {...getTableBodyProps()}>
        {rows.map((row, i) => {
          prepareRow(row);
          return (
            <tr {...row.getRowProps()} key={i}>
              {row.cells.map((cell, i) => {
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
                  <td {...cell.getCellProps()} key={i}>
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
