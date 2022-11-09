import "@glideapps/glide-data-grid/dist/index.css";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import {
  GridCellKind,
  GridColumn,
  SizedGridColumn,
} from "@glideapps/glide-data-grid";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Paper, Stack } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { GlideGrid } from "../../../../../components/GlideGlid/glide-grid";
import { GlideGridOverlayPortal } from "../../../../../components/GlideGlid/glide-grid-overlay-portal";
import {
  createHandleHeaderClicked,
  sortRowData,
  TableSort,
} from "../../../../../components/GlideGlid/utils/sorting";
import { useDrawHeader } from "../../../../../components/GlideGlid/utils/use-draw-header";
import { renderDataTypeCell } from "../../../../[account-slug]/entities/[entity-id].page/entity-editor/properties-section/property-table/cells/data-type-cell";
import { EntitySection } from "../../../../[account-slug]/entities/[entity-id].page/entity-editor/shared/entity-section";
import { WhiteChip } from "../../../../[account-slug]/entities/[entity-id].page/entity-editor/shared/white-chip";
import { useEntityTypeEntities } from "../../../../../components/hooks/useEntityTypeEntities";
import { useEntityType } from "../use-entity-type";
import { useRemotePropertyTypes } from "../use-property-types";
import { NextPageWithLayout } from "../../../../../shared/layout";
import { FRONTEND_URL } from "../../../../../lib/config";
import { types } from "@hashintel/hash-shared/types";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import { mustBeVersionedUri } from "../util";
import {
  // generateEntityLabel,
  parseEntityIdentifier,
} from "../../../../../lib/entities";
import { useBlockProtocolGetEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import {
  extractEntityRoot,
  getPropertyTypesByBaseUri,
} from "../../../../../lib/subgraph";
import { useBlockProtocolAggregateEntities } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolAggregateEntities";
import { useEntityTypeEntities2 } from "../../../../../components/hooks/useEntityTypeEntities2";
import { Entity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

const extractNamespace = (baseUri: string) => {
  return baseUri.split(`${FRONTEND_URL}/`)[1]?.split(`/types/`)[0];
};

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

interface User {
  name: string;
  surname: String;
}

// type ColumnKey = keyof User;

const users: User[] = [
  {
    name: "yusuf",
    surname: "kınataş",
  },
  {
    name: "luis",
    surname: "bettencourt",
  },
  {
    name: "bob",
    surname: "bettencourt",
  },
  {
    name: "zoe",
    surname: "bettencourt",
  },
];

const Page: NextPageWithLayout = () => {
  const [showSearch, setShowSearch] = useState(false);

  const [tableSort, setTableSort] = useState<TableSort<string>>({
    key: "entity",
    dir: "desc",
  });

  const [rows, setRows] = useState<any>();

  const propertyTypes = useRemotePropertyTypes();

  const [remoteEntityType] = useEntityType(entityTypeId);

  const { entities } = useEntityTypeEntities(
    "http://localhost:3000/@example/types/entity-type/user/v/1",
  );

  const [gridIds, columns] = useMemo(() => {
    const gridIds = ["entity", "namespace", "slug", "additionalTypes"];

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
        title: "Slug",
        id: "slug",
        width: 200,
      },
      {
        title: "Additional Types",
        id: "additionalTypes",
        width: 200,
      },
      ...(propertyTypes && remoteEntityType
        ? Object.keys(remoteEntityType.properties).reduce<GridColumn[]>(
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
        : []),
    ];

    return [gridIds, columns];
  }, [remoteEntityType, propertyTypes]);

  const resolvePromisesSeq = async (tasks) => {
    const results = [];
    for (const task of tasks) {
      results.push(await task);
    }

    return results;
  };

  const buildRows = async (entities: any) => {
    const rows = entities.map((entity) => ({
      entity: generateEntityLabel(entity, propertyTypes),
      namespace: "",
      slug: "",
      additionalTypes: "",
    }));

    setRows(rows);
  };

  useEffect(() => {
    if (entities) {
      console.log(entities);
      buildRows(entities);
    }
  }, [entities]);

  const drawHeader = useDrawHeader(tableSort, columns);

  const handleHeaderClicked = createHandleHeaderClicked(
    columns,
    tableSort,
    setTableSort,
  );

  const sortedEntities = rows && sortRowData(rows, tableSort);

  if (!entities || !propertyTypes || !remoteEntityType) {
    return null;
  }

  return (
    <Box m={5}>
      <EntitySection
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
            rows={users.length}
            getCellContent={([col, row]) => {
              if (sortedEntities) {
                const entity = sortedEntities[row];
                console.log(entity);

                const objKey = gridIds[col];
                console.log(objKey);
                // const cellValue = entity?.[objKey];
                const cellValue = entity?.[objKey];

                return {
                  kind: GridCellKind.Text,
                  allowOverlay: true,
                  copyData: cellValue,
                  displayData: cellValue,
                  data: cellValue,
                };
              }

              return {
                kind: GridCellKind.Text,
                allowOverlay: true,
                copyData: "test",
                displayData: "test",
                data: "test",
              };
            }}
            customRenderers={[renderDataTypeCell]}
          />
        </Paper>
      </EntitySection>
      <GlideGridOverlayPortal />
    </Box>
  );
};

export default Page;
