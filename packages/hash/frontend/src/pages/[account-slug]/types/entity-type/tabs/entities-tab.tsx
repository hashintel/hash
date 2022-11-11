import "@glideapps/glide-data-grid/dist/index.css";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Paper, Stack } from "@mui/material";
import { FunctionComponent, useMemo, useState } from "react";
import { extractBaseUri, extractVersion } from "@blockprotocol/type-system-web";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { types } from "@hashintel/hash-shared/types";
import { GlideGrid } from "../../../../../components/GlideGlid/glide-grid";
import { GlideGridOverlayPortal } from "../../../../../components/GlideGlid/glide-grid-overlay-portal";
import {
  createHandleHeaderClicked,
  sortRowData,
  TableSort,
} from "../../../../../components/GlideGlid/utils/sorting";
import { useDrawHeader } from "../../../../../components/GlideGlid/utils/use-draw-header";
import { generateEntityLabel } from "../../../../../lib/entities";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteChip } from "../../../shared/white-chip";
import { blankCell } from "../../../../../components/GlideGlid/utils";
import { HomeIcon } from "../../../../../shared/icons/home-icon";
import { EarthIcon } from "../../../../../shared/icons/earth-icon";
import { renderValueIconCell } from "./value-icon-cell";
import {
  getEntity,
  getEntityTypesByBaseUri,
  getPersistedPropertyTypes,
  getRootsAsEntities,
  Subgraph,
} from "../../../../../lib/subgraph";
import { mustBeVersionedUri } from "../util";
import { useRouteNamespace } from "../use-route-namespace";

export type EntitiesTabProps = {
  entitiesSubgraph: Subgraph;
  baseEntityTypeUri: string;
};

export const EntitiesTab: FunctionComponent<EntitiesTabProps> = ({
  entitiesSubgraph,
  baseEntityTypeUri,
}) => {
  const [showSearch, setShowSearch] = useState(false);
  const [tableSort, setTableSort] = useState<TableSort<string>>({
    key: "entity",
    dir: "desc",
  });

  const namespace = useRouteNamespace();

  const entities = getRootsAsEntities(entitiesSubgraph);
  const entityTypes = getEntityTypesByBaseUri(
    entitiesSubgraph,
    baseEntityTypeUri,
  ).map((entType) => entType.inner);
  const propertyTypes = getPersistedPropertyTypes(entitiesSubgraph).map(
    (propType) => propType.inner,
  );

  const [columns, rows] = useMemo(() => {
    const propertyColumns: GridColumn[] = [];

    for (const propertyType of propertyTypes) {
      const propertyTypeBaseUri = extractBaseUri(
        mustBeVersionedUri(propertyType.$id),
      );

      if (
        propertyColumns.findIndex((col) => col.id === propertyTypeBaseUri) ===
        -1
      ) {
        propertyColumns.push({
          id: propertyTypeBaseUri,
          title: propertyType.title,
          width: 200,
        });
      }
    }

    const newColumns: GridColumn[] = [
      {
        title: "Entity",
        id: "entity",
        width: 200,
        grow: 1,
      },
      {
        title: "Entity Type Version",
        id: "entityTypeVersion",
        width: 200,
      },
      {
        title: "Namespace",
        id: "namespace",
        width: 200,
      },
      {
        title: "Additional Types",
        id: "additionalTypes",
        width: 200,
      },
      ...propertyColumns,
    ];

    const newRows: { [k: string]: string }[] =
      entities?.map((entity) => {
        const entityLabel = generateEntityLabel({
          root: entity,
          subgraph: entitiesSubgraph,
        });
        const entityNamespace = getEntity(entitiesSubgraph, entity.ownedById)
          ?.properties[
          extractBaseUri(types.propertyType.shortName.propertyTypeId)
        ];
        const entityType = entityTypes.find(
          (type) => type.$id === entity.entityTypeId,
        );

        return {
          entity: entityLabel,
          entityTypeVersion: entityType
            ? `v${extractVersion(mustBeVersionedUri(entityType.$id))} ${
                entityType.title
              }`
            : "",
          namespace: entityNamespace ? `@${entityNamespace}` : "",
          additionalTypes: "",
          ...propertyColumns.reduce((fields, column) => {
            if (column.id) {
              const propertyValue = entity.properties[column.id];

              const value = Array.isArray(propertyValue)
                ? propertyValue.join(", ")
                : propertyValue;
              return { ...fields, [column.id]: value };
            }

            return fields;
          }, {}),
        };
      }) ?? [];

    return [newColumns, newRows];
  }, [entities, entitiesSubgraph, propertyTypes, entityTypes]);

  const entitiesCount = useMemo(() => {
    const namespaceEntities =
      entities?.filter((entity) => entity.ownedById === namespace?.id) ?? [];

    return {
      namespace: namespaceEntities.length,
      public: (entities?.length ?? 0) - namespaceEntities.length,
    };
  }, [entities, namespace]);

  const drawHeader = useDrawHeader(tableSort, columns);

  const handleHeaderClicked = createHandleHeaderClicked(
    columns,
    tableSort,
    setTableSort,
  );

  const sortedRows = rows && sortRowData(rows, tableSort);

  if (!entities) {
    return null;
  }

  return (
    <Box>
      <SectionWrapper
        title="Entities"
        titleTooltip="This table lists all entities with the ‘Company’ type that are accessible to you"
        titleStartContent={
          <Stack direction="row">
            {entitiesCount.namespace || entitiesCount.public ? (
              <Stack direction="row" spacing={1.5} mr={2}>
                {entitiesCount.namespace ? (
                  <Chip
                    size="xs"
                    label={`${entitiesCount.namespace} in @${namespace?.shortname}`}
                    icon={<HomeIcon />}
                    sx={({ palette }) => ({ color: palette.gray[70] })}
                  />
                ) : null}

                {entitiesCount.public ? (
                  <WhiteChip
                    size="xs"
                    label={`${entitiesCount.public} public`}
                    icon={<EarthIcon />}
                  />
                ) : null}
              </Stack>
            ) : null}

            <Stack direction="row" spacing={0.5}>
              <IconButton
                rounded
                onClick={() => setShowSearch(true)}
                sx={{ color: ({ palette }) => palette.gray[60] }}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              </IconButton>
            </Stack>
          </Stack>
        }
        tooltipIcon={
          <FontAwesomeIcon icon={faCircleQuestion} sx={{ fontSize: 14 }} />
        }
      >
        <Paper sx={{ overflow: "hidden" }}>
          <GlideGrid
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            onHeaderClicked={handleHeaderClicked}
            drawHeader={drawHeader}
            columns={columns}
            rows={sortedRows.length}
            getCellContent={([colIndex, rowIndex]) => {
              if (sortedRows && columns) {
                const row = sortedRows[rowIndex];
                const columnId = columns[colIndex]?.id;
                const cellValue = columnId && row?.[columnId];

                if (cellValue) {
                  if (columnId === "entity") {
                    return {
                      kind: GridCellKind.Custom,
                      allowOverlay: false,
                      readonly: true,
                      copyData: cellValue,
                      data: {
                        kind: "value-icon-cell",
                        icon: "bpAsterisk",
                        value: cellValue,
                      },
                    };
                  }

                  return {
                    kind: GridCellKind.Text,
                    allowOverlay: true,
                    readonly: true,
                    copyData: cellValue,
                    displayData: cellValue,
                    data: cellValue,
                  };
                }
              }

              return blankCell;
            }}
            customRenderers={[renderValueIconCell]}
          />
        </Paper>
      </SectionWrapper>
      <GlideGridOverlayPortal />
    </Box>
  );
};
