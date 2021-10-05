import React, { useCallback, useMemo } from "react";
import { TableOptions, useSortBy, useTable } from "react-table";
import { EditableCell } from "./components/EditableCell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";
import { BlockProtocolLinkedDataDefinition } from "@hashintel/block-protocol";
import { BlockComponent } from "@hashintel/block-protocol/react";
import { tw } from "twind";

import { Pagination } from "./components/Pagination";
import { FilterSort, AggregateArgs } from "./components/FilterSort";
import "./styles.scss";

type AppProps = {
  data: {
    data?: Record<string, any>[];
    __linkedData?: BlockProtocolLinkedDataDefinition;
  };
  initialState?: TableOptions<{}>["initialState"];
  entityId: string;
};

export const App: BlockComponent<AppProps> = ({
  data = { data: [] },
  initialState,
  schemas,
  update,
  entityId,
}) => {
  const columns = useMemo(() => makeColumns(data?.data?.[0] || {}, ""), [data]);
  const pageOptions = useMemo(() => {
    const aggregate = data.__linkedData?.aggregate;

    return {
      pageCount: aggregate?.pageCount || 1,
      pageNumber: aggregate?.pageNumber || 1,
      pageSize: aggregate?.itemsPerPage || 1,
    };
  }, [data]);

  const sortableFields = useMemo(
    () =>
      columns
        .filter((field) => !field.columns && typeof field.accessor === "string")
        .map(({ accessor }) => accessor as string),
    [columns]
  );

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable(
      {
        columns,
        initialState: {
          ...initialState,
          pageIndex: 1,
        },
        data: data.data || [],
        defaultColumn: {
          Cell: EditableCell,
        },
        updateData: update,
        manualSortBy: true,
      },
      useSortBy
    );

  const handleAggregate = useCallback(
    ({ operation, filter, sort, itemsPerPage, pageNumber }: AggregateArgs) => {
      if (!update || !data.__linkedData) return;
      const newLinkedData = Object.assign({}, data.__linkedData);

      if (!newLinkedData.aggregate) {
        return;
      }

      if (operation === "sort" && sort) {
        newLinkedData.aggregate.sort = sort;
      }

      if (operation === "filter" && filter) {
        newLinkedData.aggregate.filter = filter;
      }

      if (operation === "changePage" && (itemsPerPage || pageNumber)) {
        const { itemsPerPage: previtemsPerPage, pageNumber: prevPage } =
          newLinkedData.aggregate;
        newLinkedData.aggregate.itemsPerPage = itemsPerPage || previtemsPerPage;
        newLinkedData.aggregate.pageNumber = pageNumber || prevPage;
      }

      // we shouldn't send page count to backend
      if (newLinkedData.aggregate.pageCount) {
        delete newLinkedData.aggregate.pageCount;
      }

      void update<{
        data: { __linkedData: BlockProtocolLinkedDataDefinition };
        initialState?: Record<string, any>;
      }>([
        {
          data: {
            data: { __linkedData: newLinkedData },
            initialState,
          },
          entityId,
        },
      ]);
    },
    [update, data, entityId, initialState]
  );

  const setPageIndex = useCallback(
    (index: number) => {
      handleAggregate({ operation: "changePage", pageNumber: index });
    },
    [handleAggregate]
  );

  const setPageSize = useCallback(
    (size: number) => {
      handleAggregate({ operation: "changePage", itemsPerPage: size });
    },
    [handleAggregate]
  );

  /** @todo Fix keys in iterators below to not use the index */
  return (
    <>
      <FilterSort
        sortableFields={sortableFields}
        onAggregate={handleAggregate}
      />
      <div className={tw`border-1 w-auto inline-block`}>
        <table className={tw`mb-3`} {...getTableProps()}>
          <thead>
            {headerGroups.map((headerGroup) => {
              const { key: headerGroupKey, ...restHeaderGroupProps } =
                headerGroup.getHeaderGroupProps();
              return (
                <tr key={headerGroupKey} {...restHeaderGroupProps}>
                  {headerGroup.headers.map((column) => {
                    const { key, ...restHeaderProps } = column.getHeaderProps();
                    return (
                      <th key={key} {...restHeaderProps}>
                        {column.render("Header")}
                      </th>
                    );
                  })}
                </tr>
              );
            })}
          </thead>
          <tbody {...getTableBodyProps()}>
            {rows.map((row) => {
              prepareRow(row);
              const { key: rowKey, ...restRowProps } = row.getRowProps();
              return (
                <tr key={rowKey} {...restRowProps}>
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
                    const { key, ...restCellProps } = cell.getCellProps();
                    return (
                      <td key={key} {...restCellProps}>
                        {cell.render("Cell", { readOnly })}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination
          {...pageOptions}
          setPageIndex={setPageIndex}
          setPageSize={setPageSize}
          isFetching={false}
        />
      </div>
    </>
  );
};
