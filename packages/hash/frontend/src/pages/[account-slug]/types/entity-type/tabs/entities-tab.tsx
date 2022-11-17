import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Paper, Stack } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { GlideGrid } from "../../../../../components/GlideGlid/glide-grid";
import { GlideGridOverlayPortal } from "../../../../../components/GlideGlid/glide-grid-overlay-portal";
import {
  createHandleHeaderClicked,
  sortRowData,
  TableSort,
} from "../../../../../components/GlideGlid/utils/sorting";
import { useDrawHeader } from "../../../../../components/GlideGlid/utils/use-draw-header";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteChip } from "../../../shared/white-chip";
import { blankCell } from "../../../../../components/GlideGlid/utils";
import { HomeIcon } from "../../../../../shared/icons/home-icon";
import { EarthIcon } from "../../../../../shared/icons/earth-icon";
import { renderTextIconCell } from "../text-icon-cell";
import { useRouteNamespace } from "../use-route-namespace";
import { useEntitiesTable } from "../use-entities-table";
import { useEntityTypeEntities } from "../use-entity-type-entities";
import { useEntityType } from "../use-entity-type";

export const EntitiesTab: FunctionComponent = () => {
  const entityType = useEntityType();
  const { entities, entityTypes, propertyTypes, subgraph } =
    useEntityTypeEntities() ?? {};

  const [showSearch, setShowSearch] = useState(false);
  const [tableSort, setTableSort] = useState<TableSort<string>>({
    key: "entity",
    dir: "desc",
  });

  const namespace = useRouteNamespace();

  const { columns, rows } =
    useEntitiesTable(entities, entityTypes, propertyTypes, subgraph) ?? {};

  const entitiesCount = useMemo(() => {
    const namespaceEntities =
      entities?.filter((entity) => entity.ownedById === namespace?.id) ?? [];

    return {
      namespace: namespaceEntities.length,
      public: (entities?.length ?? 0) - namespaceEntities.length,
    };
  }, [entities, namespace]);

  const drawHeader = useDrawHeader(tableSort, columns ?? []);

  const sortedRows = sortRowData(rows ?? [], tableSort);

  const getCellContent = useCallback(
    ([colIndex, rowIndex]: Item): GridCell => {
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
                kind: "text-icon-cell",
                icon: "bpAsterisk",
                value: cellValue,
              },
            };
          }

          return {
            kind: GridCellKind.Text,
            allowOverlay: true,
            readonly: true,
            displayData: String(cellValue),
            data: cellValue,
          };
        }
      }

      return blankCell;
    },
    [sortedRows, columns],
  );

  if (!columns || !sortedRows) {
    return null;
  }

  const handleHeaderClicked = createHandleHeaderClicked(
    columns,
    tableSort,
    setTableSort,
  );

  return (
    <Box>
      <SectionWrapper
        title="Entities"
        titleTooltip={`This table lists all entities with the ‘${entityType?.title}’ type that are accessible to you`}
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

            <IconButton
              rounded
              onClick={() => setShowSearch(true)}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </IconButton>
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
            getCellContent={getCellContent}
            customRenderers={[renderTextIconCell]}
          />
        </Paper>
      </SectionWrapper>
      <GlideGridOverlayPortal />
    </Box>
  );
};
