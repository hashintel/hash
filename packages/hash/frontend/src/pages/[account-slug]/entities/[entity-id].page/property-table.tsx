import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  DrawCustomCellCallback,
  DrawHeaderCallback,
  Theme,
  EditableGridCell,
} from "@glideapps/glide-data-grid";
import { useCallback, useMemo } from "react";
import "@glideapps/glide-data-grid/dist/index.css";
import { useTheme } from "@mui/material";
import { PropertyType } from "@blockprotocol/type-system-web";
import { pick, capitalize } from "lodash";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { useEntityEditor } from "./entity-editor-context";
import { useSnackbar } from "../../../../components/hooks/useSnackbar";

type Row = {
  title: string;
  value: any;
  dataTypes: string[];
  propertyTypeId: string;
};

const columns: GridColumn[] = [
  {
    title: "Property",
    id: "title",
    width: 250,
  },
  {
    title: "Value",
    id: "value",
    grow: 1,
    width: 300,
  },
  {
    title: "Data type",
    id: "type",
    width: 200,
  },
];

const indexes: Exclude<keyof Row, "propertyTypeId">[] = [
  "title",
  "value",
  "dataTypes",
];

const firstColumnPadding = 36;
const columnPadding = 22;

interface PropertyTableProps {
  showSearch?: boolean;
  onSearchClose?: () => void;
  entity: EntityResponse;
}

type EnrichedPropertyType = PropertyType & {
  value: any;
  propertyTypeId: string;
  dataTypes: string[];
};

const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  entity: EntityResponse,
) => {
  /** @todo check why propertyValue does not have with a proper type  */
  return propertyType.oneOf.map((propertyValue: any) => {
    if (propertyValue?.$ref) {
      const dataTypeId = propertyValue?.$ref;
      return (
        entity.entityTypeRootedSubgraph.referencedDataTypes.find(
          (val) => val.dataTypeId === dataTypeId,
        )?.dataType.title ?? "undefined"
      );
    }

    return capitalize(propertyValue.type);
  });
};

const extractEnrichedPropertyTypesFromEntity = (
  entity: EntityResponse,
): EnrichedPropertyType[] => {
  return Object.keys(entity.properties).map((propertyTypeId) => {
    const { propertyType } =
      entity.entityTypeRootedSubgraph.referencedPropertyTypes.find((val) =>
        val.propertyTypeId.startsWith(propertyTypeId),
      ) ?? {};

    if (!propertyType) {
      throw new Error();
    }

    const dataTypes = getDataTypesOfPropertyType(propertyType, entity);

    return {
      ...propertyType,
      value: entity.properties[propertyTypeId],
      propertyTypeId,
      dataTypes,
    };
  });
};

export const PropertyTable = ({
  showSearch,
  onSearchClose,
  entity,
}: PropertyTableProps) => {
  const snackbar = useSnackbar();
  const { palette } = useTheme();
  const { setEntity } = useEntityEditor();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const rowData = useMemo<Row[]>(() => {
    const enrichedPropertyTypes =
      extractEnrichedPropertyTypesFromEntity(entity);

    return enrichedPropertyTypes.map((type) =>
      pick(type, ["propertyTypeId", "value", "title", "dataTypes"]),
    );
  }, [entity]);

  const theme: Partial<Theme> = {
    bgHeader: "white",
    borderColor: palette.gray[20],
    headerBottomBorderColor: palette.gray[20],
    horizontalBorderColor: "transparent",
    accentColor: palette.blue[70],
    textHeader: palette.gray[80],
    bgHeaderHasFocus: "transparent",
    textBubble: palette.gray[70],
    bgBubble: palette.gray[20],
    accentLight: palette.gray[20],
    bgHeaderHovered: "white",
    cellHorizontalPadding: 22,
    baseFontStyle: "500 14px",
    headerFontStyle: "600 14px",
    editorFontSize: "14px",
  };

  const getContent = useCallback(
    ([col, row]: Item): GridCell => {
      const property = rowData[row];

      if (!property) {
        throw new Error();
      }

      const propertyKey = indexes[col];

      if (!propertyKey) {
        throw new Error();
      }

      const value = property[propertyKey];

      switch (propertyKey) {
        case "title":
          return {
            kind: GridCellKind.Text,
            data: value,
            displayData: value,
            readonly: true,
            allowOverlay: false,
          };

        case "dataTypes":
          return {
            kind: GridCellKind.Bubble,
            data: value,
            allowOverlay: true,
          };

        case "value":
          if (typeof value === "number") {
            return {
              kind: GridCellKind.Number,
              data: value,
              displayData: String(value),
              allowOverlay: true,
              cursor: "pointer",
            };
          }

          if (typeof value === "boolean") {
            return {
              kind: GridCellKind.Boolean,
              data: value,
              allowOverlay: false,
            };
          }

          // everything else renders like Text for now
          return {
            kind: GridCellKind.Text,
            data: value,
            displayData: value,
            allowOverlay: true,
            cursor: "pointer",
          };
      }
    },
    [rowData],
  );

  const onCellEdited = useCallback(
    async ([col, row]: Item, newValue: EditableGridCell) => {
      const key = indexes[col];
      const property = rowData[row];

      if (!key || !property) {
        throw new Error();
      }

      const updatedProperties = {
        ...entity.properties,
        [property.propertyTypeId]: newValue.data,
      };

      /**
       * setting state for optimistic update
       * also storing previous entity, so we can rollback if API call fails
       */
      const prevEntity = { ...entity };
      setEntity({
        ...entity,
        properties: updatedProperties,
      });

      try {
        await updateEntity({
          data: {
            entityId: entity.entityId,
            updatedProperties,
          },
        });
      } catch (error) {
        // rollback the optimistic update
        setEntity(prevEntity);
        snackbar.error(`Failed to update "${property.title}"`);
      }
    },
    [rowData, entity, setEntity, updateEntity, snackbar],
  );

  const drawCell: DrawCustomCellCallback = useCallback(
    (args) => {
      const { cell, rect, ctx, col } = args;
      if (cell.kind !== GridCellKind.Text) {
        return false;
      }

      ctx.save();
      const { x, y, height } = rect;

      const paddingLeft = col === 0 ? firstColumnPadding : columnPadding;
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(cell.displayData, x + paddingLeft, y + height / 2 + 2);
      ctx.restore();

      return true;
    },
    [palette],
  );

  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex } = args;
      const { x, y, height } = rect;

      const paddingLeft =
        columnIndex === 0 ? firstColumnPadding : columnPadding;

      ctx.fillStyle = palette.gray[80];
      ctx.fillText(column.title, x + paddingLeft, y + height / 2 + 2);

      return true;
    },
    [palette],
  );

  return (
    <>
      <DataEditor
        /** functionality */
        columns={columns}
        rows={rowData.length}
        getCellContent={getContent}
        onCellEdited={onCellEdited}
        drawCell={drawCell}
        drawHeader={drawHeader}
        /** behavior */
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        getCellsForSelection
        rangeSelect="cell"
        columnSelect="none"
        smoothScrollX
        smoothScrollY
        /** styling  */
        theme={theme}
        width="100%"
        // define max height if there are lots of rows
        height={rowData.length > 10 ? 500 : undefined}
        headerHeight={42}
        rowHeight={42}
        drawFocusRing={false}
      />
      <div
        id="portal"
        style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }}
      />
    </>
  );
};
