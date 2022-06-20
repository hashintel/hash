import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TableOptions, useSortBy, useTable } from "react-table";

import {
  BlockComponent,
  useGraphBlockService,
  LinkedAggregation,
  EntityType,
  UpdateEntityData,
} from "@blockprotocol/graph";
import { tw } from "twind";
import { orderBy } from "lodash";

import { EditableCell } from "./components/editable-cell";
import { makeColumns } from "./lib/columns";
import { getSchemaPropertyDefinition } from "./lib/get-schema-property";
import { identityEntityAndProperty } from "./lib/identify-entity";

import { Pagination } from "./components/pagination";
import { AggregateArgs, Header } from "./components/header";
import { EntityTypeDropdown } from "./components/entity-type-dropdown";
import { omitTypenameDeep } from "./lib/omit-typename-deep";

type TableData = {
  data?: LinkedAggregation["results"];
  linkedAggregation?: LinkedAggregation;
};

type BlockEntityProperties = {
  initialState?: TableOptions<{}>["initialState"] & {
    columns?: { Header: string; accessor: string }[];
  };
};

const useTableData = (linkedAggregation: LinkedAggregation | undefined) => {
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
  linkedAggregations: LinkedAggregation[];
  path: string;
  sourceEntityId: string;
}): LinkedAggregation | undefined => {
  const { linkedAggregations, path, sourceEntityId } = params;

  return linkedAggregations.find(
    (aggregation) =>
      aggregation.path === path &&
      aggregation.sourceEntityId === sourceEntityId,
  );
};

const path = "$.data";

export const Table: BlockComponent<BlockEntityProperties> = ({
  graph: { blockEntity, linkedAggregations, entityTypes: remoteEntityTypes },
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);
  const {
    entityId,
    properties: { initialState },
  } = blockEntity;
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
      updateEntity: ({ data }: { data: UpdateEntityData }) => {
        void graphService?.updateEntity({ data });
      }, // this is passed into EditableCell
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
        !graphService?.aggregateEntities ||
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

      void graphService
        ?.aggregateEntities({
          data: {
            operation: linkedData.operation,
          },
        })
        .then(({ data, errors }) => {
          if (errors || !data) {
            // @todo properly handle error
            // eslint-disable-next-line
            console.log({ errors });
            return;
          }
          const { operation, results } = data;

          setTableData({
            data: results,
            linkedAggregation: {
              ...linkedData,
              operation: {
                ...linkedData.operation,
                ...operation,
              },
            },
          });
        });
    },
    [graphService, setTableData, tableData.linkedAggregation],
  );

  const handleUpdate = useCallback(
    ({ operation, multiFilter, multiSort, itemsPerPage }: AggregateArgs) => {
      if (
        !entityId ||
        !graphService ||
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
        "pageCount" in newLinkedData.operation ||
        "pageNumber" in newLinkedData.operation
      ) {
        delete newLinkedData.operation.pageCount;
        // This gives an error because we are trying to delete a property (pageNumber) which has a required
        // type.
        // @todo update AggregateEntitiesResult type, so that pageNumber is not marked as required
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        delete newLinkedData.operation.pageNumber;
      }

      void graphService?.updateEntity({
        data: {
          entityId,
          properties: { initialState: newState },
        },
      });

      void graphService?.updateLinkedAggregation({
        data: {
          aggregationId: matchingLinkedAggregation.aggregationId,
          operation: omitTypenameDeep(newLinkedData.operation),
        },
      });
    },
    [
      entityId,
      matchingLinkedAggregation,
      tableData.linkedAggregation,
      initialState,
      graphService,
    ],
  );

  const updateRemoteColumns = (properties: {
    hiddenColumns?: string[];
    columns?: { Header: string; accessor: string }[];
  }) => {
    if (!entityId || !graphService?.updateEntity) {
      return;
    }

    const newState = {
      ...initialState,
      ...(properties.hiddenColumns && {
        hiddenColumns: properties.hiddenColumns,
      }),
      ...(properties.columns && { columns: properties.columns }),
    };

    void graphService?.updateEntity({
      data: {
        entityId,
        properties: { initialState: newState },
      },
    });
  };

  const updateRemoteColumnsRef = useRef(updateRemoteColumns);

  useEffect(() => {
    updateRemoteColumnsRef.current = updateRemoteColumns;
  });

  const doesNotNeedInitialColumns =
    initialState?.columns || !tableData.data?.length;

  const defaultColumnData = tableData?.data?.[0]?.properties;

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

  const setPageSize = useCallback(
    (size: number) => {
      const tableDataEntityTypeId =
        tableData?.linkedAggregation?.operation.entityTypeId;
      if (!tableDataEntityTypeId) {
        return;
      }

      handleUpdate({
        operation: "changePageSize",
        itemsPerPage: size,
        entityTypeId: tableDataEntityTypeId,
      });
    },
    [handleUpdate, tableData?.linkedAggregation],
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

  const [entityTypes, setEntityTypes] = useState<EntityType[]>();

  useEffect(() => {
    void graphService
      ?.aggregateEntityTypes({
        data: {
          includeOtherTypesInUse: true,
        },
      })
      .then(({ data, errors }) => {
        if (errors || !data) {
          // @todo handle errors
          return;
        }
        setEntityTypes(
          orderBy(data.results, (entityType) => entityType.schema?.title),
        );
      });
  }, [graphService]);

  const handleEntityTypeChange = useCallback(
    (updatedEntityTypeId: string | undefined) => {
      if (!entityId || !graphService) {
        throw new Error("Graph service is not initialized");
      }

      if (updatedEntityTypeId) {
        if (tableData.linkedAggregation) {
          void graphService?.updateLinkedAggregation({
            data: {
              aggregationId: tableData.linkedAggregation.aggregationId,
              operation: {
                entityTypeId: updatedEntityTypeId,
                // There is scope to include other options if entity properties overlap
                itemsPerPage:
                  tableData.linkedAggregation?.operation?.itemsPerPage,
              },
            },
          });
        } else {
          void graphService?.createLinkedAggregation({
            data: {
              sourceEntityId: entityId,
              path,
              operation: {
                entityTypeId: updatedEntityTypeId,
              },
            },
          });
        }
      } else if (tableData.linkedAggregation) {
        void graphService?.deleteLinkedAggregation({
          data: {
            aggregationId: tableData.linkedAggregation.aggregationId,
          },
        });
      }
    },
    [entityId, graphService, tableData.linkedAggregation],
  );

  const entityTypeDropdown = entityTypes ? (
    <EntityTypeDropdown
      options={entityTypes}
      value={tableData?.linkedAggregation?.operation?.entityTypeId ?? undefined}
      onChange={handleEntityTypeChange}
    />
  ) : null;

  /** @todo Fix keys in iterators below to not use the index */
  return (
    <div ref={blockRef} className={tw`overflow-x-auto`}>
      {/* If there's no linked data operation, only render the entity type selector */}
      {!tableData.linkedAggregation?.operation?.entityTypeId ? (
        <div>{entityTypeDropdown}</div>
      ) : (
        <>
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
                        const { key, ...restHeaderProps } =
                          column.getHeaderProps();
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
                          (remoteEntityTypes ?? []).find(
                            (entityType) =>
                              entityType.schema?.title === entity.type,
                          )?.schema,
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
        </>
      )}
    </div>
  );
};
