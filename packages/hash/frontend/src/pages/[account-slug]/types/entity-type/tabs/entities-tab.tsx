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
import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteChip } from "../../../shared/white-chip";
import { blankCell } from "../../../../../components/grid/utils";
import { HomeIcon } from "../../../../../shared/icons/home-icon";
import { EarthIcon } from "../../../../../shared/icons/earth-icon";
import { renderTextIconCell } from "../text-icon-cell";
import { useRouteNamespace } from "../use-route-namespace";
import { TypeEntitiesRow, useEntitiesTable } from "../use-entities-table";
import { useEntityTypeEntities } from "../use-entity-type-entities";
import { useEntityType } from "../use-entity-type";
import { Grid } from "../../../../../components/grid/grid";

export const EntitiesTab: FunctionComponent = () => {
  const entityType = useEntityType();
  const { entities, entityTypes, propertyTypes, subgraph } =
    useEntityTypeEntities();

  const [showSearch, setShowSearch] = useState(false);

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

  const createGetCellContent = useCallback(
    (rowData: TypeEntitiesRow[]) =>
      ([colIndex, rowIndex]: Item): GridCell => {
        if (rowData && columns) {
          const row = rowData[rowIndex];
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
    [columns],
  );

  if (!columns || !rows) {
    return null;
  }

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
          <Grid
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            columns={columns}
            rowData={rows}
            createGetCellContent={createGetCellContent}
            customRenderers={[renderTextIconCell]}
          />
        </Paper>
      </SectionWrapper>
    </Box>
  );
};
