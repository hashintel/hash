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
  BlockProtocolAggregateEntitiesPayload,
  BlockProtocolAggregateEntitiesResult,
  BlockProtocolEntity,
  BlockProtocolAggregateOperationInput,
  BlockProtocolSort,
  BlockProtocolUpdateLinkedAggregationActionFragment,
} from "blockprotocol";
import { BlockComponent } from "blockprotocol/react";
import { tw } from "twind";
import { orderBy } from "lodash";
import { produce } from "immer";

import { EditableCell } from "./components/editable-cell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/get-schema-property";
import { identityEntityAndProperty } from "./lib/identify-entity";

import { Pagination } from "./components/pagination";
import { AggregateArgs, Header } from "./components/header";
import { EntityTypeDropdown } from "./components/entity-type-dropdown";
import { omitTypenameDeep } from "./lib/omit-typename-deep";

type TableData = {
  data?: BlockProtocolLinkedAggregation["results"];
  linkedAggregation?: BlockProtocolLinkedAggregation;
};

type AppProps = {
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
  action: BlockProtocolUpdateLinkedAggregationActionFragment & {
    operation: Omit<BlockProtocolAggregateOperationInput, "multiSort"> & {
      __typename?: string;
      pageCount?: number | null;
      multiSort?: (BlockProtocolSort & { __typename?: string })[] | null;
    };
  },
) => {
  return produce(action, (draftAction) => {
    delete draftAction.operation.pageCount;
    delete draftAction.operation.__typename;
    for (const sort of draftAction.operation.multiSort ?? []) {
      delete sort?.__typename;
    }
  });
};

const path = "$.data";

export const Table: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
  aggregateEntityTypes,
  createLinkedAggregations,
  deleteLinkedAggregations,
  entityId,
  entityTypeId,
  entityTypes: schemas,
  entityTypeVersionId,
  initialState,
  linkedAggregations,
  updateEntities,
  updateLinkedAggregations,
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
                ...linkedData.operation,
                ...operation,
              },
            },
          });
        })
        .catch((_) => {
          // @todo properly handle error
        });
    },
    [accountId, aggregateEntities, setTableData, tableData.linkedAggregation],
  );

  const handleUpdate = useCallback(
    ({ operation, multiFilter, multiSort, itemsPerPage }: AggregateArgs) => {
      if (
        !entityId ||
        !updateEntities ||
        !updateLinkedAggregations ||
        !matchingLinkedAggregation ||
        !tableData.linkedAggregation
      ) {
        return;
      }

      const newLinkedData: BlockProtocolAggregateEntitiesPayload =
        omitTypenameDeep(tableData.linkedAggregation);
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
        "pageCount" in newLinkedData.operation ||
        "pageNumber" in newLinkedData.operation
      ) {
        delete (
          newLinkedData.operation as BlockProtocolAggregateEntitiesResult<BlockProtocolEntity>["operation"]
        ).pageCount;
        delete newLinkedData.operation.pageNumber;
      }

      void updateEntities([
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

      void updateLinkedAggregations([
        cleanUpdateLinkedAggregationAction({
          sourceAccountId: matchingLinkedAggregation.sourceAccountId,
          aggregationId: matchingLinkedAggregation.aggregationId,
          operation: newLinkedData.operation,
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
      updateLinkedAggregations,
      tableData.linkedAggregation,
    ],
  );

  const updateRemoteColumns = (properties: {
    hiddenColumns?: string[];
    columns?: { Header: string; accessor: string }[];
  }) => {
    if (!entityId || !updateEntities) {
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
      void updateEntities([
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
    updateRemoteColumnsRef.current({ hiddenColumns: newHiddenColumns });
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
      if (
        !accountId ||
        !entityId ||
        !updateLinkedAggregations ||
        !createLinkedAggregations
      ) {
        throw new Error(
          "All of accountId, entityId, createLinkedAggregations and updateLinkedAggregations must be passed to the block to update data linked from it",
        );
      }

      if (updatedEntityTypeId) {
        if (tableData.linkedAggregation) {
          void updateLinkedAggregations([
            cleanUpdateLinkedAggregationAction({
              sourceAccountId: accountId,
              aggregationId: tableData.linkedAggregation.aggregationId,
              operation: {
                entityTypeId: updatedEntityTypeId,
                // There is scope to include other options if entity properties overlap
                itemsPerPage:
                  tableData.linkedAggregation?.operation?.itemsPerPage,
              },
            }),
          ]);
        } else {
          void createLinkedAggregations([
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
      } else if (tableData.linkedAggregation) {
        void deleteLinkedAggregations?.([
          {
            sourceAccountId: accountId,
            aggregationId: tableData.linkedAggregation.aggregationId,
          },
        ]);
      }
    },
    [
      accountId,
      createLinkedAggregations,
      deleteLinkedAggregations,
      entityId,
      tableData.linkedAggregation,
      updateLinkedAggregations,
    ],
  );

  const entityTypeDropdown = entityTypes ? (
    <EntityTypeDropdown
      options={entityTypes}
      value={tableData?.linkedAggregation?.operation?.entityTypeId ?? undefined}
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
                      (schemas ?? []).find(
                        (schema) => schema.title === entity.type,
                      ),
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
