import React, { useEffect, useMemo } from "react";
import { TableOptions, useSortBy, useTable } from "react-table";
import { EditableCell } from "./components/EditableCell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";
import { BlockComponent } from "@hashintel/block-protocol/react";

import "./styles.scss";

type AppProps = {
  data?: { data: Record<string, any>[] };

  initialState?: TableOptions<{}>["initialState"];
};

export const App: BlockComponent<AppProps> = ({
  data,
  initialState,
  schemas,
  update,
}) => {
  data = data ?? { data: [] };
  // data = data ?? [];
  // const columns = useMemo(() => makeColumns(data?.data?.[0] || {},'',['__linkedData']), [data]);
  const columns = useMemo(
    () => makeColumns(data?.data?.[0] || {}, "", ["__linkedData"]),
    [data]
  );
  
  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    setHiddenColumns,
  } = useTable(
    {
      columns,
      initialState,
      data: data.data,
      // data: data,
      defaultColumn: {
        Cell: EditableCell,
      },
      updateData: update,
      manualSortBy: true
    },
    useSortBy
  );

  // useEffect(() => {
  //   if (initialState?.hiddenColumns) {
  //     setHiddenColumns(initialState?.hiddenColumns);
  //   }
  // }, [initialState]);

  console.log("headerGroups ==> ", headerGroups);

  console.log("columns ==> ", columns);

  const handleSort = () => {
    if (!update) return



    // update([
    //   {
    //     data: data,
    //     entityId: ''
    //   }
    // ])
  }

  /** @todo Fix keys in iterators below to not use the index */
  return (
    <>
      <div>
        <select>
          <option>Select Field to sort</option>
          {columns
            .filter((x) => !x.columns)
            .map((z) => (
              <option>{z.accessor}</option>
            ))}
        </select>
      </div>

      <table {...getTableProps()}>
        <thead>
          {headerGroups.map((headerGroup, i) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={i}>
              {headerGroup.headers.map((column, i) => (
                <th {...column.getHeaderProps()} key={i}>
                  {column.render("Header")}
                  <span>
                    {column.isSorted
                      ? column.isSortedDesc
                        ? " 🔽"
                        : " 🔼"
                      : ""}
                  </span>
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
    </>
  );
};
