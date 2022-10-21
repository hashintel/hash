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
import { renderTestCell, TestCellProps } from "./test-cell";
import { useGridTooltip } from "../../../../../components/GlideGlid/use-grid-tooltip";
import { CustomGridIcon } from "../../../../../components/GlideGlid/custom-grid-icons";

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
    name: "this is test 1 cell",
    testing: "Testing this",
  },
  {
    name: "this is test 2 cell",
    testing: "Testing this again",
  },
];

const indexes = ["name", "testing"];

export const TestSection = () => {
  const gridRef = useRef<DataEditorRef>(null);
  const { tooltipElement, showTooltip, hideTooltip, withTooltips } =
    useGridTooltip(gridRef);

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
              {
                icon: CustomGridIcon.LABEL,
                text: "This property represents label of the entity",
              },
              {
                icon: CustomGridIcon.ASTERIKS,
                text: "This property requires a value",
              },
              {
                icon: CustomGridIcon.ERROR,
                text: "This property has an error",
              },
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
          tooltips: [{ icon: CustomGridIcon.LABEL, text: "Test" }],
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
        customRenderers={[
          withTooltips(renderTestCell),
          withTooltips(renderTestCellTwo),
        ]}
      />
      {tooltipElement}
    </EntitySection>
  );
};
