import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { isExternalOntologyElementMetadata } from "@local/hash-subgraph";
import { Box, useTheme } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  type GridProps,
} from "../../../components/grid/grid";
import type { CustomIcon } from "../../../components/grid/utils/custom-grid-icons";
import { useOrgs } from "../../../components/hooks/use-orgs";
import { useUsers } from "../../../components/hooks/use-users";
import { extractOwnedById } from "../../../lib/user-and-org";
import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { isTypeArchived } from "../../../shared/is-archived";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import type { FilterState } from "../../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../../shared/table-header";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../../shared/use-actors";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import type { ChipCell } from "../../shared/chip-cell";
import { renderChipCell } from "../../shared/chip-cell";
import type { TextIconCell } from "../../shared/entities-table/text-icon-cell";
import { createRenderTextIconCell } from "../../shared/entities-table/text-icon-cell";
import { TypeSlideOverStack } from "../../shared/entity-type-page/type-slide-over-stack";
import { TableHeaderToggle } from "../../shared/table-header-toggle";
import type { TableView } from "../../shared/table-views";
import { tableViewIcons } from "../../shared/table-views";
import { TOP_CONTEXT_BAR_HEIGHT } from "../../shared/top-context-bar";
import { TypeGraphVisualizer } from "../../shared/type-graph-visualizer";

const typesTableColumnIds = [
  "title",
  "kind",
  "webShortname",
  "archived",
  "lastEdited",
  "lastEditedBy",
] as const;

type LinkColumnId = (typeof typesTableColumnIds)[number];

type TypesTableColumn = {
  id: LinkColumnId;
} & SizedGridColumn;

export type TypesTableRow = {
  rowId: string;
  kind: "entity-type" | "property-type" | "link-type" | "data-type";
  lastEdited: string;
  lastEditedBy?: MinimalActor;
  typeId: VersionedUrl;
  title: string;
  external: boolean;
  webShortname?: string;
  archived: boolean;
};

const typeNamespaceFromTypeId = (typeId: VersionedUrl): string => {
  const url = new URL(typeId);
  const domain = url.hostname;
  const firstPathSegment = url.pathname.split("/")[1];
  return `${domain}/${firstPathSegment}`;
};

const typeTableKinds = [
  "all",
  "entity-type",
  "link-type",
  "property-type",
  "data-type",
] as const;

type TypeTableKind = (typeof typeTableKinds)[number];

const typesTablesToTitle: Record<TypeTableKind, string> = {
  all: "Types",
  "entity-type": "Entity Types",
  "property-type": "Property Types",
  "link-type": "Link Types",
  "data-type": "Data Types",
};

export const TypesTable: FunctionComponent<{
  types?: (
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  kind: TypeTableKind;
}> = ({ types, kind }) => {
  const router = useRouter();

  const [view, setView] = useState<TableView>("Table");

  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [selectedRows, setSelectedRows] = useState<TypesTableRow[]>([]);

  const [filterState, setFilterState] = useState<FilterState>({
    includeArchived: false,
    includeGlobal: false,
    limitToWebs: false,
  });

  const [selectedEntityTypeId, setSelectedEntityTypeId] =
    useState<VersionedUrl | null>(null);

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const typesTableColumns = useMemo<TypesTableColumn[]>(
    () => [
      {
        id: "title",
        title: "Title",
        width: 252,
        grow: 2,
      },
      ...(kind === "all"
        ? [
            {
              id: "kind",
              title: "Type",
              width: 200,
            } as const,
          ]
        : []),
      {
        id: "webShortname",
        title: "Web",
        width: 280,
      },
      ...(filterState.includeArchived
        ? [
            {
              id: "archived",
              title: "Archived",
              width: 200,
            } as const,
          ]
        : []),
      {
        title: "Last Edited",
        id: "lastEdited",
        width: 200,
      },
      {
        title: "Last Edited By",
        id: "lastEditedBy",
        width: 200,
      },
    ],
    [filterState.includeArchived, kind],
  );

  const { users } = useUsers();
  const { orgs } = useOrgs();

  const editorActorIds = useMemo(
    () =>
      types?.flatMap(({ metadata }) => [
        metadata.provenance.edition.createdById,
      ]),
    [types],
  );

  const { actors } = useActors({ accountIds: editorActorIds });

  const namespaces = useMemo(
    () => (users && orgs ? [...users, ...orgs] : undefined),
    [users, orgs],
  );

  const { authenticatedUser } = useAuthenticatedUser();

  const internalWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
    ];
  }, [authenticatedUser]);

  const filteredTypes = useMemo(() => {
    const filtered: ((
      | EntityTypeWithMetadata
      | PropertyTypeWithMetadata
      | DataTypeWithMetadata
    ) & { isExternal: boolean; webShortname?: string; archived: boolean })[] =
      [];

    for (const type of types ?? []) {
      const isExternal = isExternalOntologyElementMetadata(type.metadata)
        ? true
        : !internalWebIds.includes(type.metadata.ownedById);

      const namespaceOwnedById = isExternalOntologyElementMetadata(
        type.metadata,
      )
        ? undefined
        : type.metadata.ownedById;

      const webShortname = namespaces?.find(
        (workspace) => extractOwnedById(workspace) === namespaceOwnedById,
      )?.shortname;

      const isArchived = isTypeArchived(type);

      if (
        (filterState.includeGlobal ? true : !isExternal) &&
        (filterState.includeArchived ? true : !isArchived) &&
        (filterState.limitToWebs
          ? webShortname && filterState.limitToWebs.includes(webShortname)
          : true)
      ) {
        filtered.push({
          ...type,
          isExternal,
          webShortname,
          archived: isArchived,
        });
      }
    }

    return filtered;
  }, [types, filterState, namespaces, internalWebIds]);

  const filteredRows = useMemo<TypesTableRow[] | undefined>(
    () =>
      filteredTypes.map((type) => {
        const lastEdited = format(
          new Date(
            type.metadata.temporalVersioning.transactionTime.start.limit,
          ),
          "yyyy-MM-dd HH:mm",
        );

        const lastEditedBy = actors?.find(
          ({ accountId }) =>
            accountId === type.metadata.provenance.edition.createdById,
        );

        return {
          rowId: type.schema.$id,
          typeId: type.schema.$id,
          title: type.schema.title,
          lastEdited,
          lastEditedBy,
          kind:
            type.schema.kind === "entityType"
              ? isSpecialEntityTypeLookup?.[type.schema.$id]?.isFile
                ? "link-type"
                : "entity-type"
              : type.schema.kind === "propertyType"
                ? "property-type"
                : "data-type",
          external: type.isExternal,
          webShortname: type.webShortname,
          archived: type.archived,
        } as const;
      }),
    [actors, isSpecialEntityTypeLookup, filteredTypes],
  );

  const sortRows = useCallback<
    NonNullable<GridProps<TypesTableRow>["sortRows"]>
  >((unsortedRows, sort, previousSort) => {
    return unsortedRows.toSorted((a, b) => {
      const isActorSort = (key: string): key is "lastEditedBy" | "createdBy" =>
        ["lastEditedBy", "createdBy"].includes(key);

      const value1: string = isActorSort(sort.columnKey)
        ? (a[sort.columnKey]?.displayName ?? "")
        : String(a[sort.columnKey]);

      const value2: string = isActorSort(sort.columnKey)
        ? (b[sort.columnKey]?.displayName ?? "")
        : String(b[sort.columnKey]);

      const previousValue1: string | undefined = previousSort
        ? isActorSort(previousSort.columnKey)
          ? (a[previousSort.columnKey]?.displayName ?? "")
          : String(a[previousSort.columnKey])
        : undefined;

      const previousValue2: string | undefined = previousSort?.columnKey
        ? isActorSort(previousSort.columnKey)
          ? (b[previousSort.columnKey]?.displayName ?? "")
          : String(b[previousSort.columnKey])
        : undefined;

      let comparison = value1.localeCompare(value2);

      if (comparison === 0 && previousValue1 && previousValue2) {
        // if the two keys are equal, we sort by the previous sort
        comparison = previousValue1.localeCompare(previousValue2);
      }

      if (sort.direction === "desc") {
        // reverse if descending
        comparison = -comparison;
      }

      return comparison;
    });
  }, []);

  const createGetCellContent = useCallback(
    (rows: TypesTableRow[]) =>
      ([colIndex, rowIndex]: Item): TextCell | TextIconCell | ChipCell => {
        const row = rows[rowIndex];

        if (!row) {
          throw new Error("link not found");
        }

        const column = typesTableColumns[colIndex];

        if (!column) {
          throw new Error("column not found");
        }

        switch (column.id) {
          case "title":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: row.title,
              cursor: "pointer",
              data: {
                kind: "text-icon-cell",
                icon: "bpAsterisk",
                value: row.title,
                onClick: () => {
                  if (row.kind === "entity-type") {
                    setSelectedEntityTypeId(row.typeId);
                  } else {
                    void router.push(generateLinkParameters(row.typeId).href);
                  }
                },
              },
            };
          case "kind":
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.kind),
              data: row.kind,
            };
          case "webShortname": {
            const value = row.webShortname
              ? `@${row.webShortname}`
              : typeNamespaceFromTypeId(row.typeId);

            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              cursor: "pointer",
              copyData: value,
              data: {
                kind: "text-icon-cell",
                icon: null,
                value,
                onClick: () => {
                  void router.push(`/${value}`);
                },
              },
            };
          }
          case "archived": {
            const value = row.archived ? "Yes" : "No";
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          }
          case "lastEdited": {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.lastEdited),
              data: row.lastEdited,
            };
          }
          case "lastEditedBy": {
            const actor = row.lastEditedBy;

            const actorName = actor ? actor.displayName : undefined;

            const actorIcon = actor
              ? ((actor.kind === "machine"
                  ? isAiMachineActor(actor)
                    ? "wandMagicSparklesRegular"
                    : "hashSolid"
                  : "userRegular") satisfies CustomIcon)
              : undefined;

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(actorName),
              data: {
                kind: "chip-cell",
                chips: actorName
                  ? [
                      {
                        text: actorName,
                        icon: actorIcon,
                      },
                    ]
                  : [],
                color: "gray",
                variant: "filled",
              },
            };
          }
        }
      },
    [typesTableColumns, router],
  );

  const theme = useTheme();

  const maxTableHeight = `calc(100vh - (${
    HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 170 + tableHeaderHeight
  }px + ${theme.spacing(5)}) - ${theme.spacing(5)})`;

  const currentlyDisplayedRowsRef = useRef<TypesTableRow[] | null>(null);

  return (
    <>
      {selectedEntityTypeId && (
        <TypeSlideOverStack
          rootTypeId={selectedEntityTypeId}
          onClose={() => setSelectedEntityTypeId(null)}
        />
      )}
      <Box>
        <TableHeader
          endAdornment={
            <TableHeaderToggle
              value={view}
              setValue={setView}
              options={(["Table", "Graph"] as const satisfies TableView[]).map(
                (optionValue) => ({
                  icon: tableViewIcons[optionValue],
                  label: `${optionValue} view`,
                  value: optionValue,
                }),
              )}
            />
          }
          internalWebIds={internalWebIds}
          itemLabelPlural="types"
          items={types}
          title={typesTablesToTitle[kind]}
          columns={typesTableColumns}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          filterState={filterState}
          setFilterState={setFilterState}
          selectedItems={types?.filter((type) =>
            selectedRows.some(({ typeId }) => type.schema.$id === typeId),
          )}
          onBulkActionCompleted={() => setSelectedRows([])}
        />
        {view === "Table" ? (
          <Grid
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            columns={typesTableColumns}
            dataLoading={!types}
            rows={filteredRows}
            enableCheckboxSelection
            selectedRows={selectedRows}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            onSelectedRowsChange={(updatedSelectedRows) =>
              setSelectedRows(updatedSelectedRows)
            }
            sortable
            sortRows={sortRows}
            firstColumnLeftPadding={16}
            createGetCellContent={createGetCellContent}
            // define max height if there are lots of rows
            height={`
          min(
            ${maxTableHeight},
            calc(
              ${gridHeaderHeightWithBorder}px +
              (${
                filteredRows?.length ? filteredRows.length : 1
              } * ${gridRowHeight}px) +
              ${gridHorizontalScrollbarHeight}px
            )
          )`}
            customRenderers={[
              createRenderTextIconCell({ firstColumnLeftPadding: 16 }),
              renderChipCell,
            ]}
            freezeColumns={1}
          />
        ) : (
          <Box height={maxTableHeight}>
            <TypeGraphVisualizer
              onTypeClick={setSelectedEntityTypeId}
              types={filteredTypes}
            />
          </Box>
        )}
      </Box>
    </>
  );
};
