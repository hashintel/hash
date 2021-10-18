import React, { useCallback, useMemo } from "react";
import { TableOptions, useSortBy, useTable } from "react-table";
import { BlockProtocolLinkedDataDefinition } from "@hashintel/block-protocol";
import { BlockComponent } from "@hashintel/block-protocol/react";
import { tw } from "twind";
import { EditableCell } from "./components/EditableCell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";

import { Pagination } from "./components/Pagination";
import { Header, AggregateArgs } from "./components/Header";

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
  const aggregateOptions = useMemo(() => {
    const aggregate = data.__linkedData?.aggregate;
    return {
      multiFilter: aggregate?.multiFilter,
      multiSort: aggregate?.multiSort,
    };
  }, [data]);

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    setHiddenColumns,
    state,
    allColumns,
  } = useTable(
    {
      columns,
      initialState: {
        ...initialState,
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
    ({
      operation,
      multiFilter,
      multiSort,
      itemsPerPage,
      pageNumber,
    }: AggregateArgs) => {
      if (!update || !data.__linkedData) return;
      const newLinkedData = { ...data.__linkedData };
      const newState = { hiddenColumns: initialState?.hiddenColumns };

      if (!newLinkedData.aggregate) {
        return;
      }

      if (operation === "sort" && multiSort) {
        newLinkedData.aggregate.multiSort = multiSort;
        // if sort or filter fields changed, reset page to 1
        newLinkedData.aggregate.pageNumber = 1;
      }

      if (operation === "filter" && multiFilter) {
        newLinkedData.aggregate.multiFilter = multiFilter;
        // if sort or filter fields changed, reset page to 1
        newLinkedData.aggregate.pageNumber = 1;
      }

      if (operation === "changePage" && (itemsPerPage || pageNumber)) {
        const { itemsPerPage: previtemsPerPage, pageNumber: prevPage } =
          newLinkedData.aggregate;
        newLinkedData.aggregate.itemsPerPage = itemsPerPage || previtemsPerPage;
        newLinkedData.aggregate.pageNumber = pageNumber || prevPage;
      }

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
            initialState: newState,
          },
          entityId,
        },
      ]);
    },
    [update, data, entityId, initialState]
  );

  const updateRemoteHiddenState = (hiddenColumns: string[]) => {
    if (!update) return;

    const newState = { ...initialState, hiddenColumns };
    void update<{
      data: { __linkedData: BlockProtocolLinkedDataDefinition };
      initialState?: Record<string, any>;
    }>([
      {
        data: {
          data: { __linkedData: { ...data.__linkedData } },
          initialState: newState,
        },
        entityId,
      },
    ]);
  };

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

  const handleToggleColumn = (columnId: string, showColumn?: boolean) => {
    if (!state.hiddenColumns) return;
    let newColumns: string[] = [];

    if (state.hiddenColumns.includes(columnId) || !showColumn) {
      newColumns = state.hiddenColumns.filter((id) => id !== columnId);
    } else {
      newColumns = state.hiddenColumns.concat(columnId);
    }

    setHiddenColumns(newColumns);

    // @todo throttle this call
    updateRemoteHiddenState(newColumns);
  };

  /** @todo Fix keys in iterators below to not use the index */
  return (
    <div>
      <Header
        columns={allColumns}
        toggleHideColumn={handleToggleColumn}
        onAggregate={handleAggregate}
        aggregateOptions={aggregateOptions}
      />
      <div className={tw`max-w-full`}>
        <table
          className={tw`w-full text(sm left) border-1 border-separate border-gray-100 rounded-2xl mb-3 overflow-hidden`}
          style={{ borderSpacing: 0 }}
          {...getTableProps()}
        >
          <thead>
            {headerGroups.map((headerGroup) => {
              const { key: headerGroupKey, ...restHeaderGroupProps } =
                headerGroup.getHeaderGroupProps();
              return (
                <tr key={headerGroupKey} {...restHeaderGroupProps}>
                  {headerGroup.headers.map((column) => {
                    const { key, ...restHeaderProps } = column.getHeaderProps();
                    return (
                      <th
                        className={tw`first:rounded-tl-2xl last:rounded-tr-2xl pl-4 pr-8 py-4 capitalize`}
                        key={key}
                        {...restHeaderProps}
                      >
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
                <tr
                  key={rowKey}
                  className={tw`border border(gray-100) odd:bg-gray-100 even:bg-gray-200`}
                  {...restRowProps}
                >
                  {row.cells.map((cell) => {
                    const { entity, property } = identityEntityAndProperty(
                      cell.row.original,
                      cell.column.id
                    );
                    const propertyDef = getSchemaPropertyDefinition(
                      (schemas ?? {})[entity.type],
                      property
                    );
                    const readOnly = propertyDef?.readOnly;
                    const { key, ...restCellProps } = cell.getCellProps();
                    return (
                      <td
                        key={key}
                        className={tw`pl-4 pr-8 py-4`}
                        {...restCellProps}
                      >
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
    </div>
  );
};
