import {
  DataEditorRef,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
} from "@glideapps/glide-data-grid";
import _ from "lodash";
import { useCallback, useRef } from "react";
import { GlideGrid } from "../../../../../components/GlideGlid/glide-grid";
import { EntitySection } from "./shared/entity-section";
import { renderTestCellTwo, TestCellTwoProps } from "./test-cell-two";
import { useGridTooltip } from "./use-grid-tooltip";
import { renderTestCell, TestCellProps } from "./test-cell";

const columns: GridColumn[] = [
  {
    title: "Name",
    id: "name",
    width: 200,
  },
  {
    title: "Testing",
    id: "testing",
    width: 400,
  },
];

const rowData = [
  {
    name: "Test 1",
    testing: "Testing this",
  },
  {
    name: "Test 2",
    testing: "Testing this again",
  },
];

const indexes = ["name", "testing"];

export const TestSection = () => {
  const gridRef = useRef<DataEditorRef>(null);
  const { tooltip, showTooltip, hideTooltip } = useGridTooltip(gridRef);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const data = rowData[row];

      const key = indexes[col];

      if (!key || !data) {
        throw new Error();
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const value = data[key];

      if (key === "testing") {
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          copyData: "",
          data: {
            kind: "custom-cell",
            tooltips: [
              "This property requires a value",
              "this field is required",
              "this is the default value",
              "this is kinda funny",
            ],
            showTooltip,
            hideTooltip,
          } as TestCellTwoProps,
        };
      }

      return {
        kind: GridCellKind.Custom,
        allowOverlay: false,
        copyData: "",
        data: {
          kind: "test-cell",
          value: value || "",
          tooltips: [
            "This property requires a value",
            "this field is required",
            "this is the default value",
            "this is kinda funny",
          ],
          showTooltip,
          hideTooltip,
        } as TestCellProps,
      };
    },
    [hideTooltip, showTooltip],
  );

  return (
    <EntitySection title="Testing Tooltips">
      <GlideGrid
        ref={gridRef}
        columns={columns}
        rows={rowData.length}
        getCellContent={getCellContent}
        customRenderers={[renderTestCell, renderTestCellTwo]}
      />
      {tooltip}
    </EntitySection>
  );
};
