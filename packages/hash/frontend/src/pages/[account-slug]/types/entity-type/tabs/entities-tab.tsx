import "@glideapps/glide-data-grid/dist/index.css";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Container, Paper, Stack } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import { GlideGrid } from "../../../../../components/GlideGlid/glide-grid";
import { GlideGridOverlayPortal } from "../../../../../components/GlideGlid/glide-grid-overlay-portal";
import {
  createHandleHeaderClicked,
  sortRowData,
  TableSort,
} from "../../../../../components/GlideGlid/utils/sorting";
import { useDrawHeader } from "../../../../../components/GlideGlid/utils/use-draw-header";
import { useEntityTypeEntities } from "../../../../../components/hooks/useEntityTypeEntities";
import { useEntityType } from "../use-entity-type";
import {
  usePropertyTypes,
  usePropertyTypesContextValue,
} from "../use-property-types";
import { NextPageWithLayout } from "../../../../../shared/layout";
import { mustBeVersionedUri } from "../util";
import { parseEntityIdentifier } from "../../../../../lib/entities";
import { Entity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { useAccounts } from "../../../../../components/hooks/useAccounts";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteChip } from "../../../shared/white-chip";

export const generateEntityLabel = (
  entity: Entity,
  propertyTypes: PropertyType[],
  schema?: { labelProperty?: unknown; title?: unknown },
): string => {
  // if the schema has a labelProperty set, prefer that
  const labelProperty = schema?.labelProperty;
  if (
    typeof labelProperty === "string" &&
    typeof entity.properties[labelProperty] === "string" &&
    entity.properties[labelProperty]
  ) {
    return entity.properties[labelProperty] as string;
  }

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferred name",
    "display name",
    "title",
    "shortname",
  ];

  const propertyTypes2: { title?: string; propertyTypeBaseUri: string }[] =
    Object.keys(entity.properties).map((propertyTypeBaseUri) => {
      /** @todo - pick the latest version rather than first element? */

      const propertyType = Object.values(propertyTypes).find(
        (prop) =>
          extractBaseUri(mustBeVersionedUri(prop.$id)) === propertyTypeBaseUri,
      );
      // const [propertyType] = getPropertyTypesByBaseUri(
      //   rootEntityAndSubgraph.subgraph,
      //   propertyTypeBaseUri,
      // );

      return propertyType
        ? {
            title: propertyType.title.toLowerCase(),
            propertyTypeBaseUri,
          }
        : {
            title: undefined,
            propertyTypeBaseUri,
          };
    });

  for (const option of options) {
    const found = propertyTypes2.find(({ title }) => title === option);

    if (found) {
      return entity.properties[found.propertyTypeBaseUri];
    }
  }

  // fallback to the entity type and a few characters of the entityId
  let entityId = entity.entityId;
  try {
    // in case this entityId is a stringified JSON object, extract the real entityId from it
    ({ entityId } = parseEntityIdentifier(entityId));
  } catch {
    // entityId was not a stringified object, it was already the real entityId
  }

  const entityTypeName = schema?.title ?? "Entity";

  return `${entityTypeName}-${entityId.slice(0, 5)}`;
};

const entityTypeId = "http://localhost:3000/@example/types/entity-type/user/";

export type EntitiesTabProps = {
  entities: Entity[];
  entityType: EntityType;
};

export const EntitiesTab: FunctionComponent<EntitiesTabProps> = ({
  entities,
  entityType,
}) => {
  const [showSearch, setShowSearch] = useState(false);

  const [tableSort, setTableSort] = useState<TableSort<string>>({
    key: "entity",
    dir: "desc",
  });

  const { accounts } = useAccounts();

  const propertyTypes = usePropertyTypes();

  const generateNameSpace = useCallback(
    (ownedById: string) =>
      accounts?.find(({ entityId }) => entityId === ownedById)?.shortname,
    [accounts],
  );

  const [columns, rows] = useMemo(() => {
    const propertyColumns =
      propertyTypes && entityType
        ? Object.keys(entityType.properties).reduce<GridColumn[]>(
            (columns, propertyId) => {
              const propertyType = Object.values(propertyTypes).find(
                (prop) =>
                  extractBaseUri(mustBeVersionedUri(prop.$id)) === propertyId,
              );

              if (propertyType) {
                return [
                  ...columns,
                  {
                    title: propertyType.title,
                    id: propertyId,
                    width: 200,
                  },
                ];
              }

              return columns;
            },
            [],
          )
        : [];

    const columns: GridColumn[] = [
      {
        title: "Entity",
        id: "entity",
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

    const rows: { [k: string]: string }[] =
      (propertyTypes &&
        entities?.map((entity) => {
          const entityLabel = generateEntityLabel(entity, propertyTypes);
          const namespace = generateNameSpace(entity.ownedById);

          return {
            entity: entityLabel,
            namespace: namespace ? `@${namespace}` : "",
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
        })) ??
      [];

    return [columns, rows];
  }, [entityType, propertyTypes, entities, generateNameSpace]);

  const drawHeader = useDrawHeader(tableSort, columns);

  const handleHeaderClicked = createHandleHeaderClicked(
    columns,
    tableSort,
    setTableSort,
  );

  const sortedRows = rows && sortRowData(rows, tableSort);

  console.log(propertyTypes);
  // if (!entities || !propertyTypes || !entityType) {
  //   return null;
  // }

  return (
    <Container>
      <SectionWrapper
        title="Entities"
        titleTooltip="This table lists all entities with the ‘Company’ type that are accessible to you"
        titleStartContent={
          <Stack direction="row" spacing={1.5}>
            <Chip size="xs" label="3 values" />
            <WhiteChip size="xs" label="$3 empty" />
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
                const objKey = columns[colIndex]?.id;
                const cellValue = row?.[objKey];

                if (cellValue) {
                  return {
                    kind: GridCellKind.Text,
                    allowOverlay: true,
                    copyData: cellValue,
                    displayData: cellValue,
                    data: cellValue,
                  };
                }
              }

              return {
                kind: GridCellKind.Text,
                allowOverlay: true,
                copyData: "test",
                displayData: "test",
                data: "test",
              };
            }}
            customRenderers={[]}
          />
        </Paper>
      </SectionWrapper>
      <GlideGridOverlayPortal />
    </Container>
  );
};
