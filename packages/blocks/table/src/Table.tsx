import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TableOptions, useSortBy, useTable } from "react-table";
import {
  BlockProtocolLinkedAggregation,
  BlockProtocolEntityType,
  BlockProtocolUpdateLinksAction,
  BlockProtocolLinkedDataDefinition,
  BlockProtocolMultiSort,
} from "blockprotocol";
import { BlockComponent } from "blockprotocol/react";
import { tw } from "twind";
import { orderBy } from "lodash";
import { produce } from "immer";

import { EditableCell } from "./components/EditableCell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/getSchemaProperty";
import { identityEntityAndProperty } from "./lib/identifyEntity";

import { Pagination } from "./components/Pagination";
import { AggregateArgs, Header } from "./components/Header";
import { EntityTypeDropdown } from "./components/EntityTypeDropdown";
import { omitTypenameDeep } from "./lib/omitTypenameDeep";

type TableData = {
  data?: Record<string, any>[];
  linkedAggregation?: BlockProtocolLinkedAggregation;
};

type AppProps = {
  data: {
    data?: Record<string, any>[];
    __linkedData?: BlockProtocolLinkedDataDefinition;
  };
  initialState?: TableOptions<{}>["initialState"] & {
    columns?: { Header: string; accessor: string }[];
  };
};

const useTableData = (
  linkedAggregation: BlockProtocolLinkedAggregation | undefined,
) => {
  const defaultTableData: TableData = {
    linkedAggregation,
    data: linkedAggregation?.results,
  };

  const defaultAggregateData = {
    tableData: defaultTableData,
    prevLinkedAggregation: linkedAggregation,
  };

  const [{ prevLinkedAggregation, tableData }, setAggregateTableData] =
    useState(defaultAggregateData);

  const setTableData = useCallback(
    (nextData: TableData) =>
      setAggregateTableData((existing) => ({
        ...existing,
        tableData: nextData,
      })),
    [],
  );

  if (linkedAggregation !== prevLinkedAggregation) {
    setAggregateTableData(defaultAggregateData);
  }

  return [tableData, setTableData] as const;
};

const getLinkedAggregation = (params: {
  linkedAggregations: BlockProtocolLinkedAggregation[];
  path: string;
  sourceEntityId: string;
}): BlockProtocolLinkedAggregation | undefined => {
  const { linkedAggregations, path, sourceEntityId } = params;

  return linkedAggregations.find(
    (aggregation) =>
      aggregation.path === path &&
      aggregation.sourceEntityId === sourceEntityId,
  );
};

const cleanUpdateLinkedAggregationAction = (
  action: BlockProtocolUpdateLinksAction & {
    data: Partial<BlockProtocolLinkedAggregation>;
  },
) => {
  return produce(action, (draftAction) => {
    draftAction.data.multiSort = draftAction.data.multiSort?.map((sort) => {
      const newSort = sort as BlockProtocolMultiSort[number] & {
        __typename?: string;
      };
      delete newSort.__typename;
      return newSort;
    });

    delete draftAction.data.pageCount;
  });
};

const path = "$.data";

export const Table: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
  aggregateEntityTypes,
  createLinks,
  entityId,
  entityTypeId,
  entityTypeVersionId,
  initialState,
  linkedAggregations,
  schemas,
  updateEntities,
  updateLinks,
}) => {
  const matchingLinkedAggregation = useMemo(() => {
    if (!entityId) {
      return undefined;
    }

    return getLinkedAggregation({
      linkedAggregations: linkedAggregations ?? [],
      path,
      sourceEntityId: entityId,
    });
  }, [entityId, linkedAggregations]);

  const [tableData, setTableData] = useTableData(matchingLinkedAggregation);

  const columns = useMemo(
    () => makeColumns(tableData.data?.[0] || {}),
    [tableData.data],
  );

  const [pageOptions, aggregateOptions] = useMemo(() => {
    const aggregate = tableData.linkedAggregation?.operation;

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
      updateEntities,
      data: tableData.data || [],
      defaultColumn: {
        Cell: EditableCell,
      },
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
      const linkedData = omitTypenameDeep(tableData.linkedAggregation);

      if (
        !aggregateEntities ||
        !linkedData?.operation ||
        !linkedData.operation.entityTypeId
      ) {
        return;
      }

      const { itemsPerPage: prevPerPage, pageNumber: prevPage } =
        linkedData.operation;
      linkedData.operation.itemsPerPage = itemsPerPage || prevPerPage;
      linkedData.operation.pageNumber = pageNumber || prevPage;

      /** remove pageCount since it's not required in aggregate resolver */
      if (linkedData.operation.pageCount) {
        delete linkedData.operation.pageCount;
      }

      aggregateEntities({
        accountId,
        entityTypeId,
        entityTypeVersionId,
        operation: linkedData.operation,
      })
        .then(({ operation, results }) => {
          if (!tableData.linkedAggregation?.sourceAccountId) {
            throw new Error("sourceAccountId is required");
          }

          setTableData({
            data: results as TableData["data"],
            linkedAggregation: {
              ...tableData.linkedAggregation,
              operation: {
                ...operation,
                entityTypeId:
                  tableData?.linkedAggregation.operation.entityTypeId,
              },
            },
          });
        })
        .catch((_) => {
          // @todo properly handle error
        });
    },
    [
      accountId,
      aggregateEntities,
      entityTypeId,
      entityTypeVersionId,
      setTableData,
      tableData.linkedAggregation,
    ],
  );

  const handleUpdate = useCallback(
    ({ operation, multiFilter, multiSort, itemsPerPage }: AggregateArgs) => {
      if (
        !entityId ||
        !updateEntities ||
        !updateLinks ||
        !matchingLinkedAggregation ||
        !tableData.linkedAggregation
      ) {
        return;
      }

      const newLinkedData = omitTypenameDeep(tableData.linkedAggregation);
      const newState = {
        hiddenColumns: initialState?.hiddenColumns,
        columns: initialState?.columns,
      };

      if (!newLinkedData.operation) {
        return;
      }

      if (operation === "sort" && multiSort) {
        newLinkedData.operation.multiSort = multiSort;
      }

      if (operation === "filter" && multiFilter) {
        newLinkedData.operation.multiFilter = multiFilter;
      }

      if (operation === "changePageSize" && itemsPerPage) {
        const { itemsPerPage: prevItemsPerPage } = newLinkedData.operation;
        newLinkedData.operation.itemsPerPage = itemsPerPage || prevItemsPerPage;
      }

      if (
        newLinkedData.operation.pageCount ||
        newLinkedData.operation.pageNumber
      ) {
        delete newLinkedData.operation.pageCount;
        delete newLinkedData.operation.pageNumber;
      }

      void updateEntities<{
        initialState?: Record<string, any>;
      }>([
        {
          accountId,
          data: {
            initialState: newState,
          },
          entityId,
          entityTypeId,
          entityTypeVersionId,
        },
      ]);

      void updateLinks([
        cleanUpdateLinkedAggregationAction({
          sourceAccountId: matchingLinkedAggregation.sourceAccountId,
          sourceEntityId: matchingLinkedAggregation.sourceEntityId,
          path,
          data: newLinkedData.operation,
        }),
      ]);
    },
    [
      accountId,
      entityId,
      entityTypeId,
      entityTypeVersionId,
      initialState,
      matchingLinkedAggregation,
      updateEntities,
      updateLinks,
      tableData.linkedAggregation,
    ],
  );

  const updateRemoteColumns = (properties: {
    hiddenColumns?: string[];
    columns?: { Header: string; accessor: string }[];
  }) => {
    if (
      !entityId ||
      !updateLinks ||
      !updateEntities ||
      !matchingLinkedAggregation
    ) {
      return;
    }

    const newState = {
      ...initialState,
      ...(properties.hiddenColumns && {
        hiddenColumns: properties.hiddenColumns,
      }),
      ...(properties.columns && { columns: properties.columns }),
    };

    if (tableData.linkedAggregation?.sourceAccountId) {
      void updateEntities<{
        initialState?: Record<string, any>;
      }>([
        {
          accountId,
          data: {
            initialState: newState,
          },
          entityId,
          entityTypeId,
          entityTypeVersionId,
        },
      ]);

      void updateLinks([
        cleanUpdateLinkedAggregationAction({
          sourceAccountId: matchingLinkedAggregation.sourceAccountId,
          sourceEntityId: matchingLinkedAggregation.sourceEntityId,
          path,
          data: { ...tableData.linkedAggregation.operation },
        }),
      ]);
    }
  };

  const updateRemoteColumnsRef = useRef(updateRemoteColumns);

  useEffect(() => {
    updateRemoteColumnsRef.current = updateRemoteColumns;
  });

  const doesNotNeedInitialColumns =
    initialState?.columns || !tableData.data?.length;
  const defaultColumnData = tableData?.data?.[0];

  const defaultColumnDataRef = useRef(defaultColumnData);

  useEffect(() => {
    defaultColumnDataRef.current = defaultColumnData;
  });

  /**
   * This effect is a bad way of handling this, because it can end up being
   * triggered by multiple clients simultaneously during collab, and it also
   * results in more calls to updateEntity than is necessary.
   *
   * @todo find a better approach
   */
  useEffect(() => {
    /** Save the columns in initial state if not present. This helps in retaining
     * the headers when a filter operation returns an empty results set
     */
    if (doesNotNeedInitialColumns) return;

    const initialColumns = makeColumns(defaultColumnDataRef.current ?? {});
    updateRemoteColumnsRef.current({ columns: initialColumns });
  }, [doesNotNeedInitialColumns]);

  const setPageIndex = useCallback(
    (index: number) => {
      handleAggregate({ pageNumber: index });
    },
    [handleAggregate],
  );

  const tableDataEntityTypeId =
    tableData?.linkedAggregation?.operation.entityTypeId;

  const setPageSize = useCallback(
    (size: number) => {
      if (!tableDataEntityTypeId) {
        return;
      }

      handleUpdate({
        operation: "changePageSize",
        itemsPerPage: size,
        entityTypeId: tableDataEntityTypeId,
      });
    },
    [handleUpdate, tableDataEntityTypeId],
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
      accountId,
      includeOtherTypesInUse: true,
    }).then(({ results }) => {
      setEntityTypes(orderBy(results, (entityType) => entityType.title));
    });
  }, [aggregateEntityTypes, accountId]);

  const handleEntityTypeChange = useCallback(
    (updatedEntityTypeId: string | undefined) => {
      if (!entityId || !updateLinks || !createLinks) {
        throw new Error(
          "All of entityId, createLinks and updateLinks must be passed to the block to update data linke from it",
        );
      }

      if (updatedEntityTypeId) {
        if (tableData?.linkedAggregation) {
          void updateLinks?.([
            cleanUpdateLinkedAggregationAction({
              sourceAccountId: accountId,
              sourceEntityId: entityId,
              path,
              data: {
                entityTypeId: updatedEntityTypeId,
                // There is scope to include other options if entity properties overlap
                itemsPerPage:
                  tableData.linkedAggregation?.operation?.itemsPerPage,
              },
            }),
          ]);
        } else {
          void createLinks?.([
            {
              operation: {
                entityTypeId: updatedEntityTypeId,
              },
              path,
              sourceAccountId: accountId,
              sourceEntityId: entityId,
            },
          ]);
        }
      }
    },
    [
      accountId,
      createLinks,
      entityId,
      tableData.linkedAggregation,
      updateLinks,
    ],
  );

  const entityTypeDropdown = entityTypes ? (
    <EntityTypeDropdown
      options={entityTypes}
      value={tableData?.linkedAggregation?.operation?.entityTypeId}
      onChange={handleEntityTypeChange}
    />
  ) : null;

  if (!tableData.linkedAggregation?.operation?.entityTypeId) {
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
    <div className={tw`overflow-x-auto`}>
      <Header
        columns={allColumns}
        toggleHideColumn={handleToggleColumn}
        onAggregate={handleUpdate}
        aggregateOptions={aggregateOptions}
        entityTypeDropdown={entityTypeDropdown}
        entityTypeId={tableData?.linkedAggregation.operation.entityTypeId}
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
