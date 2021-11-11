import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TableOptions, useSortBy, useTable } from "react-table";
import {
  BlockProtocolEntityType,
  BlockProtocolLinkedDataDefinition,
} from "@hashintel/block-protocol";
import { BlockComponent } from "@hashintel/block-protocol/react";
import { tw } from "twind";
import { omit, orderBy } from "lodash";
import { EditableCell } from "./components/EditableCell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";

import { Pagination } from "./components/Pagination";
import { Header, AggregateArgs } from "./components/Header";
import { EntityTypeDropdown } from "./components/EntityTypeDropdown";
import { omitTypenameDeep } from "./lib/omitTypenameDeep";

type AppProps = {
  data: {
    data?: Record<string, any>[];
    __linkedData?: BlockProtocolLinkedDataDefinition;
  };
  initialState?: TableOptions<{}>["initialState"] & {
    columns?: { Header: string; accessor: string }[];
  };
  entityId: string;
};

const defaultData: AppProps["data"] = { data: [] };

export const App: BlockComponent<AppProps> = ({
  data = defaultData,
  initialState,
  schemas,
  update,
  entityId,
  aggregate: aggregateFn,
  aggregateEntityTypes,
}) => {
  const [tableData, setTableData] = useState<AppProps["data"]>(data);

  useEffect(() => {
    setTableData(data);
  }, [data]);

  const columns = useMemo(
    () => initialState?.columns ?? makeColumns(tableData.data?.[0] || {}),
    [tableData.data, initialState],
  );

  const [pageOptions, aggregateOptions] = useMemo(() => {
    const aggregate = tableData.__linkedData?.aggregate;
    return [
      {
        pageCount: aggregate?.pageCount || 1,
        pageNumber: aggregate?.pageNumber || 1,
        pageSize: aggregate?.itemsPerPage || 1,
      },
      {
        multiFilter: aggregate?.multiFilter,
        multiSort: aggregate?.multiSort,
      },
    ];
  }, [tableData]);

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
      data: tableData.data || [],
      defaultColumn: {
        Cell: EditableCell,
      },
      updateData: update,
      manualSortBy: true,
    },
    useSortBy,
  );

  /**
   * At the moment we only call this for page changes
   */
  const handleAggregate = useCallback(
    ({
      pageNumber,
      itemsPerPage,
    }: {
      pageNumber: number;
      itemsPerPage?: number;
    }) => {
      const linkedData = omitTypenameDeep(tableData.__linkedData);

      if (!aggregateFn || !linkedData?.aggregate || !linkedData.entityTypeId) {
        return;
      }

      const { itemsPerPage: prevPerPage, pageNumber: prevPage } =
        linkedData.aggregate;
      linkedData.aggregate.itemsPerPage = itemsPerPage || prevPerPage;
      linkedData.aggregate.pageNumber = pageNumber || prevPage;

      /** remove pageCount since it's not required in aggregate resolver */
      if (linkedData.aggregate.pageCount) {
        delete linkedData.aggregate.pageCount;
      }

      aggregateFn({
        entityTypeId: linkedData.entityTypeId,
        operation: omit(linkedData.aggregate, "entityTypeId"),
      })
        .then(({ operation, results }) => {
          setTableData({
            data: results as AppProps["data"]["data"],
            __linkedData: {
              ...tableData.__linkedData,
              aggregate: operation,
            },
          });
        })
        .catch((_) => {
          // @todo properly handle error
        });
    },
    [aggregateFn, tableData.__linkedData],
  );

  const handleUpdate = useCallback(
    ({ operation, multiFilter, multiSort, itemsPerPage }: AggregateArgs) => {
      if (!update || !tableData.__linkedData) return;

      const newLinkedData = omitTypenameDeep(tableData.__linkedData);
      const newState = {
        hiddenColumns: initialState?.hiddenColumns,
        columns: initialState?.columns,
      };

      if (!newLinkedData.aggregate) {
        return;
      }

      if (operation === "sort" && multiSort) {
        newLinkedData.aggregate.multiSort = multiSort;
      }

      if (operation === "filter" && multiFilter) {
        newLinkedData.aggregate.multiFilter = multiFilter;
      }

      if (operation === "changePageSize" && itemsPerPage) {
        const { itemsPerPage: prevItemsPerPage } = newLinkedData.aggregate;
        newLinkedData.aggregate.itemsPerPage = itemsPerPage || prevItemsPerPage;
      }

      if (
        newLinkedData.aggregate.pageCount ||
        newLinkedData.aggregate.pageNumber
      ) {
        delete newLinkedData.aggregate.pageCount;
        delete newLinkedData.aggregate.pageNumber;
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
    [update, tableData.__linkedData, entityId, initialState],
  );

  const updateRemoteColumns = useCallback(
    (properties: {
      hiddenColumns?: string[];
      columns?: { Header: string; accessor: string }[];
    }) => {
      if (!update) return;

      const newState = {
        ...initialState,
        ...(properties.hiddenColumns && {
          hiddenColumns: properties.hiddenColumns,
        }),
        ...(properties.columns && { columns: properties.columns }),
      };
      void update<{
        data: { __linkedData: BlockProtocolLinkedDataDefinition };
        initialState?: Record<string, any>;
      }>([
        {
          data: {
            data: { __linkedData: { ...tableData.__linkedData } },
            initialState: newState,
          },
          entityId,
        },
      ]);
    },
    [entityId, initialState, tableData.__linkedData, update],
  );

  useEffect(() => {
    /** Save the columns in initial state if not present. This helps in retaining
     * the headers when a filter operation returns an empty results set
     */
    if (initialState?.columns || !tableData.data?.length) return;

    const initialColumns = makeColumns(tableData.data[0] || {});
    updateRemoteColumns({ columns: initialColumns });
  }, [initialState, tableData, updateRemoteColumns]);

  const setPageIndex = useCallback(
    (index: number) => {
      handleAggregate({ pageNumber: index });
    },
    [handleAggregate],
  );

  const setPageSize = useCallback(
    (size: number) => {
      handleUpdate({ operation: "changePageSize", itemsPerPage: size });
    },
    [handleUpdate],
  );

  /**
   * handles which columns should be visible in the table
   */
  const handleToggleColumn = (columnId: string, showColumn?: boolean) => {
    if (!state.hiddenColumns) return;
    let newHiddenColumns: string[] = [];

    if (state.hiddenColumns.includes(columnId) || !showColumn) {
      newHiddenColumns = state.hiddenColumns.filter((id) => id !== columnId);
    } else {
      newHiddenColumns = state.hiddenColumns.concat(columnId);
    }

    setHiddenColumns(newHiddenColumns);

    // @todo throttle this call
    updateRemoteColumns({ hiddenColumns: newHiddenColumns });
  };

  const [entityTypes, setEntityTypes] = useState<BlockProtocolEntityType[]>();

  useEffect(() => {
    void aggregateEntityTypes?.({
      includeOtherTypesInUse: true,
    }).then(({ results }) => {
      setEntityTypes(orderBy(results, (entityType) => entityType.title));
    });
  }, [aggregateEntityTypes]);

  const handleEntityTypeChange = useCallback(
    (entityTypeId: string | undefined) => {
      void update?.([
        {
          data: {
            data: {
              __linkedData: entityTypeId
                ? {
                    entityTypeId,
                    aggregate: {
                      // There is scope to include other options if entity properties overlap
                      itemsPerPage: data.__linkedData?.aggregate?.itemsPerPage,
                    },
                  }
                : undefined,
            },
          },
          entityId,
        },
      ]);
    },
    [update, data.__linkedData?.aggregate?.itemsPerPage, entityId],
  );

  const entityTypeDropdown = entityTypes ? (
    <EntityTypeDropdown
      options={entityTypes}
      value={data?.__linkedData?.entityTypeId}
      onChange={handleEntityTypeChange}
    />
  ) : null;

  if (!data.__linkedData?.entityTypeId) {
    if (!aggregateEntityTypes) {
      return (
        <div>
          Table cannot be shown because entity type is not selected and the list
          of entity types is unavailable
        </div>
      );
    }

    return <div>{entityTypeDropdown}</div>;
  }

  /** @todo Fix keys in iterators below to not use the index */
  return (
    <div>
      <Header
        columns={allColumns}
        toggleHideColumn={handleToggleColumn}
        onAggregate={handleUpdate}
        aggregateOptions={aggregateOptions}
        entityTypeDropdown={entityTypeDropdown}
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
                        className={tw`first:rounded-tl-2xl last:rounded-tr-2xl px-4 py-4 whitespace-nowrap capitalize w-36`}
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
                      cell.column.id,
                    );
                    const propertyDef = getSchemaPropertyDefinition(
                      (schemas ?? {})[entity.type],
                      property,
                    );
                    const readOnly = propertyDef?.readOnly;
                    const { key, ...restCellProps } = cell.getCellProps();
                    return (
                      <td
                        key={key}
                        className={tw`px-4 py-4`}
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
