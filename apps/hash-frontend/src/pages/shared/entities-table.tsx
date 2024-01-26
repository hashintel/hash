import { useLazyQuery } from "@apollo/client";
import {
  Entity as BpEntity,
  EntityRootType as BpEntityRootType,
  EntityType,
  PropertyType,
  Subgraph as BpSubgraph,
} from "@blockprotocol/graph";
import {
  CustomCell,
  GridCellKind,
  Item,
  TextCell,
} from "@glideapps/glide-data-grid";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import { ListRegularIcon } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  EntityRootType,
  EntityTypeWithMetadata,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getRightEntityForLinkEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import {
  Box,
  ToggleButton,
  toggleButtonClasses,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  gridRowHeight,
} from "../../components/grid/grid";
import { BlankCell, blankCell } from "../../components/grid/utils";
import { ColumnFilter } from "../../components/grid/utils/filtering";
import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { MinimalUser } from "../../lib/user-and-org";
import { useEntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import {
  FilterState,
  TableHeader,
  tableHeaderHeight,
} from "../../shared/table-header";
import { useEntityTypeEntities } from "../../shared/use-entity-type-entities";
import { useAuthenticatedUser } from "./auth-info-context";
import { renderChipCell } from "./chip-cell";
import {
  createRenderTextIconCell,
  TextIconCell,
} from "./entities-table/text-icon-cell";
import {
  TypeEntitiesRow,
  useEntitiesTable,
} from "./entities-table/use-entities-table";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";

export const EntitiesTable: FunctionComponent<{
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
}> = ({ hideEntityTypeVersionColumn, hidePropertiesColumns }) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();

  const [filterState, setFilterState] = useState<FilterState>({
    includeGlobal: false,
  });
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [view, setView] = useState<"table" | "graph">("table");

  const {
    entityTypeBaseUrl,
    entityTypeId,
    entities: lastLoadedEntities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    subgraph: subgraphWithoutLinkedEntities,
  } = useEntityTypeEntitiesContext();

  const { subgraph: subgraphWithLinkedEntities } = useEntityTypeEntities({
    entityTypeBaseUrl,
    entityTypeId,
    graphResolveDepths: {
      constrainsLinksOn: { outgoing: 255 },
      constrainsLinkDestinationsOn: { outgoing: 255 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsValuesOn: { outgoing: 255 },
      inheritsFrom: { outgoing: 255 },
      isOfType: { outgoing: 1 },
      hasLeftEntity: { outgoing: 1, incoming: 1 },
      hasRightEntity: { outgoing: 1, incoming: 1 },
    },
  });

  const subgraph = subgraphWithLinkedEntities ?? subgraphWithoutLinkedEntities;

  const entities = useMemo(
    /**
     * If a network request is in process and there is no cached content for the request, return undefined.
     * There may be stale data in the context related to an earlier request with different variables.
     */
    () => (loading && !hadCachedContent ? undefined : lastLoadedEntities),
    [hadCachedContent, loading, lastLoadedEntities],
  );

  const isViewingPages = useMemo(
    () =>
      entities?.every(({ metadata }) =>
        isPageEntityTypeId(metadata.entityTypeId),
      ),
    [entities],
  );

  useEffect(() => {
    if (isViewingPages && filterState.includeArchived === undefined) {
      setFilterState((prev) => ({ ...prev, includeArchived: false }));
    }
  }, [isViewingPages, filterState]);

  const internalWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
    ];
  }, [authenticatedUser]);

  const filteredEntities = useMemo(
    () =>
      entities?.filter(
        (entity) =>
          (filterState.includeGlobal
            ? true
            : internalWebIds.includes(
                extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
              )) &&
          (filterState.includeArchived === undefined ||
          filterState.includeArchived ||
          !isPageEntityTypeId(entity.metadata.entityTypeId)
            ? true
            : simplifyProperties(entity.properties as PageProperties)
                .archived !== true),
      ),
    [entities, filterState, internalWebIds],
  );

  const { columns, rows } = useEntitiesTable({
    entities: filteredEntities,
    entityTypes,
    propertyTypes,
    subgraph,
    hideEntityTypeVersionColumn,
    hidePropertiesColumns,
    isViewingPages,
  });

  const [selectedRows, setSelectedRows] = useState<TypeEntitiesRow[]>([]);

  const createGetCellContent = useCallback(
    (entityRows: TypeEntitiesRow[]) =>
      ([colIndex, rowIndex]: Item):
        | TextIconCell
        | TextCell
        | BlankCell
        | CustomCell => {
        const columnId = columns[colIndex]?.id;
        if (columnId) {
          const row = entityRows[rowIndex];

          if (!row) {
            /**
             * This can occur when `createGetCellContent` is called
             * for a row that has just been filtered out, so we handle
             * this by briefly not displaying anything in the cell.
             */
            return {
              kind: GridCellKind.Text,
              allowOverlay: false,
              readonly: true,
              displayData: String("Not Found"),
              data: "Not Found",
            };
          }

          if (columnId === "entityLabel") {
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: row.entityLabel,
              cursor: "pointer",
              data: {
                kind: "text-icon-cell",
                icon: "bpAsterisk",
                value: row.entityLabel,
                onClick: () =>
                  router.push(
                    isViewingPages
                      ? `/${row.namespace}/${extractEntityUuidFromEntityId(
                          row.entityId,
                        )}`
                      : `/${
                          row.namespace
                        }/entities/${extractEntityUuidFromEntityId(
                          row.entityId,
                        )}`,
                  ),
              },
            };
          } else if (["namespace", "entityTypeVersion"].includes(columnId)) {
            const cellValue = row[columnId];
            return {
              kind: GridCellKind.Text,
              allowOverlay: true,
              readonly: true,
              displayData: String(cellValue),
              data: cellValue,
            };
          } else if (columnId === "archived") {
            const value = row.archived ? "Yes" : "No";
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          } else if (columnId === "lastEdited") {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.lastEdited),
              data: row.lastEdited,
            };
          } else if (columnId === "lastEditedBy") {
            const lastEditedBy = row.lastEditedBy?.preferredName;
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(lastEditedBy),
              data: {
                kind: "chip-cell",
                chips: lastEditedBy ? [{ text: lastEditedBy }] : [],
                color: "gray",
                variant: "filled",
              },
            };
          }

          const propertyCellValue =
            columnId && row.properties && row.properties[columnId];

          if (propertyCellValue) {
            return {
              kind: GridCellKind.Text,
              allowOverlay: true,
              readonly: true,
              displayData: String(propertyCellValue),
              data: propertyCellValue,
            };
          }
        }

        return blankCell;
      },
    [columns, router, isViewingPages],
  );

  const theme = useTheme();

  const getOwnerForEntity = useGetOwnerForEntity();

  const handleEntityClick = useCallback(
    (entity: BpEntity) => {
      const { shortname: entityNamespace } = getOwnerForEntity(
        entity as Entity,
      );

      if (entityNamespace === "") {
        return;
      }

      void router.push(
        `/@${entityNamespace}/entities/${extractEntityUuidFromEntityId(
          entity.metadata.recordId.entityId as EntityId,
        )}`,
      );
    },
    [router, getOwnerForEntity],
  );

  const namespaces = useMemo(
    () =>
      rows
        ?.map(({ namespace }) => namespace)
        .filter((namespace, index, all) => all.indexOf(namespace) === index) ??
      [],
    [rows],
  );

  const [selectedNamespaces, setSelectedNamespaces] =
    useState<string[]>(namespaces);

  useEffect(() => {
    setSelectedNamespaces(namespaces);
  }, [namespaces]);

  const entityTypeVersions = useMemo(
    () =>
      rows
        ?.map(({ entityTypeVersion }) => entityTypeVersion)
        .filter(
          (entityTypeVersion, index, all) =>
            all.indexOf(entityTypeVersion) === index,
        ) ?? [],
    [rows],
  );

  const [selectedEntityTypeVersions, setSelectedEntityTypeVersions] =
    useState<string[]>(entityTypeVersions);

  useEffect(() => {
    setSelectedEntityTypeVersions(entityTypeVersions);
  }, [entityTypeVersions]);

  const [selectedArchivedStatus, setSelectedArchivedStatus] = useState<
    ("archived" | "not-archived")[]
  >(["archived", "not-archived"]);

  const lastEditedByUsers = useMemo(
    () =>
      rows
        ?.map(({ lastEditedBy }) => lastEditedBy ?? [])
        .flat()
        .filter(
          (user, index, all) =>
            all.findIndex(({ accountId }) => accountId === user.accountId) ===
            index,
        ) ?? [],
    [rows],
  );

  const [selectedLastEditedByAccountIds, setSelectedLastEditedByAccountIds] =
    useState<string[]>(lastEditedByUsers.map(({ accountId }) => accountId));

  useEffect(() => {
    setSelectedLastEditedByAccountIds(
      lastEditedByUsers.map(({ accountId }) => accountId),
    );
  }, [lastEditedByUsers]);

  const columnFilters = useMemo<ColumnFilter<string, TypeEntitiesRow>[]>(
    () => [
      {
        columnKey: "namespace",
        filterItems: namespaces.map((namespace) => ({
          id: namespace,
          label: namespace,
        })),
        selectedFilterItemIds: selectedNamespaces,
        setSelectedFilterItemIds: setSelectedNamespaces,
        isRowFiltered: (row) => !selectedNamespaces.includes(row.namespace),
      },
      {
        columnKey: "entityTypeVersion",
        filterItems: entityTypeVersions.map((entityTypeVersion) => ({
          id: entityTypeVersion,
          label: entityTypeVersion,
        })),
        selectedFilterItemIds: selectedEntityTypeVersions,
        setSelectedFilterItemIds: setSelectedEntityTypeVersions,
        isRowFiltered: (row) =>
          !selectedEntityTypeVersions.includes(row.entityTypeVersion),
      },
      {
        columnKey: "archived",
        filterItems: [
          {
            id: "archived",
            label: "Archived",
          },
          {
            id: "not-archived",
            label: "Not Archived",
          },
        ],
        selectedFilterItemIds: selectedArchivedStatus,
        setSelectedFilterItemIds: (filterItemIds) =>
          setSelectedArchivedStatus(
            filterItemIds as ("archived" | "not-archived")[],
          ),
        isRowFiltered: (row) =>
          row.archived
            ? !selectedArchivedStatus.includes("archived")
            : !selectedArchivedStatus.includes("not-archived"),
      },
      {
        columnKey: "lastEditedBy",
        filterItems: lastEditedByUsers.map(({ accountId, preferredName }) => ({
          id: accountId,
          label: preferredName ?? "Unknown User",
        })),
        selectedFilterItemIds: selectedLastEditedByAccountIds,
        setSelectedFilterItemIds: setSelectedLastEditedByAccountIds,
        isRowFiltered: (row) =>
          row.lastEditedBy
            ? !selectedLastEditedByAccountIds.includes(
                row.lastEditedBy.accountId,
              )
            : false,
      },
    ],
    [
      namespaces,
      selectedNamespaces,
      entityTypeVersions,
      selectedEntityTypeVersions,
      lastEditedByUsers,
      selectedLastEditedByAccountIds,
      selectedArchivedStatus,
    ],
  );

  const [structuralQueryEntities] = useLazyQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery);

  const fetchOutgoingLinksOfEntities = useCallback(
    async (params: {
      leftEntities: Entity[];
    }): Promise<
      {
        linkEntity: LinkEntity;
        rightEntity: Entity;
        rightEntityLabel: string;
        linkEntityType: EntityTypeWithMetadata;
      }[]
    > => {
      const { leftEntities } = params;

      const { data } = await structuralQueryEntities({
        variables: {
          query: {
            filter: {
              any: leftEntities.map((entity) => ({
                equal: [
                  { path: ["leftEntity", "uuid"] },
                  {
                    parameter: extractEntityUuidFromEntityId(
                      entity.metadata.recordId.entityId,
                    ),
                  },
                ],
              })),
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            graphResolveDepths: {
              ...zeroedGraphResolveDepths,
              inheritsFrom: { outgoing: 255 },
              isOfType: { outgoing: 2 },
              hasRightEntity: { outgoing: 1, incoming: 0 },
            },
            includeDrafts: false,
          },
          includePermissions: false,
        },
      });

      const outgoingLinksSubgraph = data
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            data.structuralQueryEntities.subgraph,
          )
        : undefined;

      if (!outgoingLinksSubgraph) {
        throw new Error("Could not fetch outgoing links of entities");
      }

      const outgoingLinkEntities = getRoots(
        outgoingLinksSubgraph,
      ) as LinkEntity[];

      return outgoingLinkEntities.map((linkEntity) => {
        const rightEntityRevisions = getRightEntityForLinkEntity(
          outgoingLinksSubgraph,
          linkEntity.metadata.recordId.entityId,
        )!;

        const rightEntity = rightEntityRevisions[0]!;

        const rightEntityLabel = generateEntityLabel(
          outgoingLinksSubgraph,
          rightEntity,
        );

        const linkEntityType = getEntityTypeById(
          outgoingLinksSubgraph,
          linkEntity.metadata.entityTypeId,
        )!;

        return {
          linkEntity,
          rightEntity,
          rightEntityLabel,
          linkEntityType,
        };
      });
    },
    [structuralQueryEntities],
  );

  const currentlyDisplayedRowsRef = useRef<TypeEntitiesRow[] | null>(null);

  const generateCsvFile = useCallback(async () => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
    if (!currentlyDisplayedRows) {
      return null;
    }

    // Table contents

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const columnRowKeys = columns.map(({ id }) => id ?? []).flat();

    const tableContentColumnTitles = columns.map(({ title }) => title);

    // Entity Properties

    const propertyColumns = currentlyDisplayedRows.reduce<PropertyType[]>(
      (prev, row) => {
        const { entity } = row;

        const propertyTypesUsedInEntity = Object.keys(entity.properties).map(
          (baseUrl) => {
            const propertyType = propertyTypes?.find(
              ({ $id }) => extractBaseUrl($id) === baseUrl,
            );

            if (!propertyType) {
              throw new Error(`Could not find property type for ${baseUrl}`);
            }

            return propertyType;
          },
        );

        const newPropertyTypes = propertyTypesUsedInEntity.filter(
          (propertyType) =>
            !prev.some(
              (previouslyAddedPropertyType) =>
                previouslyAddedPropertyType.$id === propertyType.$id,
            ),
        );

        return [...prev, ...newPropertyTypes];
      },
      [],
    );

    // Outgoing links

    const outgoingLinksWithRightEntities = await fetchOutgoingLinksOfEntities({
      leftEntities: currentlyDisplayedRows.map(({ entity }) => entity),
    });

    const outgoingLinkColumns = outgoingLinksWithRightEntities.reduce<
      EntityType[]
    >((prev, { linkEntityType }) => {
      if (
        !prev.some(
          (previousLinkEntity) =>
            previousLinkEntity.$id === linkEntityType.schema.$id,
        )
      ) {
        return [...prev, linkEntityType.schema];
      }

      return prev;
    }, []);

    const content: string[][] = [
      [
        "Entity ID",
        ...propertyColumns.map(({ title }) => title),
        ...outgoingLinkColumns.map(({ title }) => title),
        ...tableContentColumnTitles,
      ],
      ...currentlyDisplayedRows.map((row) => {
        const { entity } = row;

        const propertyValues = propertyColumns.map((propertyType) => {
          /** @todo: stringify this better */
          const propertyValue =
            entity.properties[extractBaseUrl(propertyType.$id)];

          if (typeof propertyValue === "string") {
            return propertyValue;
          } else if (typeof propertyValue === "object") {
            return JSON.stringify(propertyValue);
          } else if (propertyValue !== undefined) {
            return String(propertyValue);
          }

          return "";
        });

        const outgoingLinks = outgoingLinksWithRightEntities.filter(
          ({ linkEntity }) =>
            linkEntity.linkData.leftEntityId ===
            entity.metadata.recordId.entityId,
        );

        const outgoingLinkValues = outgoingLinkColumns.map((linkEntityType) => {
          const outgoingLinksOfType = outgoingLinks.filter(
            ({ linkEntityType: outgoingLinkEntityType }) =>
              outgoingLinkEntityType.schema.$id === linkEntityType.$id,
          );

          if (outgoingLinksOfType.length > 0) {
            return outgoingLinksOfType
              .map(({ rightEntityLabel }) => rightEntityLabel)
              .join(", ");
          }

          return "";
        });

        const tableContent = columnRowKeys.map((key) => {
          const value = row[key];

          if (typeof value === "string") {
            return value;
          } else if (key === "lastEditedBy") {
            const user: MinimalUser | undefined = value;

            return user?.preferredName ?? "";
          }

          return "";
        });

        return [
          row.entityId,
          ...propertyValues,
          ...outgoingLinkValues,
          ...tableContent,
        ];
      }),
    ];

    return {
      title: "Entities",
      content,
    };
  }, [
    currentlyDisplayedRowsRef,
    columns,
    propertyTypes,
    fetchOutgoingLinksOfEntities,
  ]);

  return (
    <Box>
      <TableHeader
        internalWebIds={internalWebIds}
        itemLabelPlural={isViewingPages ? "pages" : "entities"}
        items={entities}
        selectedItems={
          entities?.filter((entity) =>
            selectedRows.some(
              ({ entityId }) => entity.metadata.recordId.entityId === entityId,
            ),
          ) ?? []
        }
        generateCsvFile={generateCsvFile}
        endAdornment={
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, updatedView) => {
              if (updatedView) {
                setView(updatedView);
              }
            }}
            aria-label="view"
            size="small"
            sx={{
              [`.${toggleButtonClasses.root}`]: {
                backgroundColor: ({ palette }) => palette.common.white,
                "&:not(:last-of-type)": {
                  borderRightColor: ({ palette }) => palette.gray[20],
                  borderRightStyle: "solid",
                  borderRightWidth: 2,
                },
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.common.white,
                  svg: {
                    color: ({ palette }) => palette.gray[80],
                  },
                },
                [`&.${toggleButtonClasses.selected}`]: {
                  backgroundColor: ({ palette }) => palette.common.white,
                  svg: {
                    color: ({ palette }) => palette.gray[90],
                  },
                },
                svg: {
                  transition: ({ transitions }) => transitions.create("color"),
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 18,
                },
              },
            }}
          >
            <ToggleButton disableRipple value="table" aria-label="table">
              <Tooltip title="Table view" placement="top">
                <Box sx={{ lineHeight: 0 }}>
                  <ListRegularIcon />
                </Box>
              </Tooltip>
            </ToggleButton>
            <ToggleButton disableRipple value="graph" aria-label="graph">
              <Tooltip title="Graph view" placement="top">
                <Box sx={{ lineHeight: 0 }}>
                  <ChartNetworkRegularIcon />
                </Box>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        }
        filterState={filterState}
        setFilterState={setFilterState}
        toggleSearch={view === "table" ? () => setShowSearch(true) : undefined}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      {view === "graph" ? (
        <EntitiesGraphChart
          isPrimaryEntity={(entity) =>
            entityTypeBaseUrl
              ? extractBaseUrl(entity.metadata.entityTypeId) ===
                entityTypeBaseUrl
              : entityTypeId
                ? entityTypeId === entity.metadata.entityTypeId
                : true
          }
          filterEntity={(entity) =>
            filterState.includeGlobal
              ? true
              : internalWebIds.includes(
                  extractOwnedByIdFromEntityId(
                    entity.metadata.recordId.entityId as EntityId,
                  ),
                )
          }
          onEntityClick={handleEntityClick}
          sx={{
            background: ({ palette }) => palette.common.white,
            height: `calc(100vh - (${
              HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 179 + tableHeaderHeight
            }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`,
            borderBottomRightRadius: 6,
            borderBottomLeftRadius: 6,
          }}
          subgraph={subgraph as unknown as BpSubgraph<BpEntityRootType>}
        />
      ) : (
        <Grid
          showSearch={showSearch}
          onSearchClose={() => setShowSearch(false)}
          columns={columns}
          columnFilters={columnFilters}
          rows={rows}
          enableCheckboxSelection
          selectedRows={selectedRows}
          onSelectedRowsChange={(updatedSelectedRows) =>
            setSelectedRows(updatedSelectedRows)
          }
          firstColumnLeftPadding={16}
          height={`
               min(
                 calc(100vh - (${
                   HEADER_HEIGHT +
                   TOP_CONTEXT_BAR_HEIGHT +
                   179 +
                   tableHeaderHeight
                 }px + ${theme.spacing(5)} + ${theme.spacing(5)})),
                calc(
                 ${gridHeaderHeightWithBorder}px +
                 (${rows ? rows.length : 1} * ${gridRowHeight}px) +
                 ${gridHorizontalScrollbarHeight}px)
               )`}
          createGetCellContent={createGetCellContent}
          customRenderers={[
            createRenderTextIconCell({ firstColumnLeftPadding: 16 }),
            renderChipCell,
          ]}
          freezeColumns={1}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        />
      )}
    </Box>
  );
};
