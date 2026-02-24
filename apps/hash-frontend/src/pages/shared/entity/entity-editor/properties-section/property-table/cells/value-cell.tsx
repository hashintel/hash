import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../components/grid/utils";
import { drawChipWithText } from "../../../../../../../components/grid/utils/draw-chip-with-text";
import { drawTextWithIcon } from "../../../../../../../components/grid/utils/draw-text-with-icon";
import { drawUrlAsLink } from "../../../../../../../components/grid/utils/draw-url-as-link";
import { InteractableManager } from "../../../../../../../components/grid/utils/interactable-manager";
import { drawInteractableTooltipIcons } from "../../../../../../../components/grid/utils/use-grid-tooltip/draw-interactable-tooltip-icons";
import { formatValue } from "../../../../../format-value";
import { SourcesList } from "../../../../../sources-popover";
import { isValueEmpty } from "../../is-value-empty";
import { ArrayEditor } from "./value-cell/array-editor";
import { ReadonlyValueCellPopup } from "./value-cell/readonly-popup";
import { SingleValueEditor } from "./value-cell/single-value-editor";
import type { ValueCell } from "./value-cell/types";

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme, col, row } = args;

    const { readonly, showTooltip } = cell.data;

    const {
      value,
      valueMetadata,
      permittedDataTypesIncludingChildren,
      isArray,
      isSingleUrl,
      validationError,
    } = cell.data.propertyRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    if (isValueEmpty(value)) {
      // draw empty value
      ctx.fillStyle = customColors.gray[50];
      ctx.font = "italic 14px Inter";
      const emptyText = isArray ? "No values" : "No value";
      ctx.fillText(emptyText, left, yCenter);
    } else if (!isArray && typeof value === "object") {
      drawChipWithText({
        args,
        left,
        text: !value ? "null" : JSON.stringify(value),
      });
    } else if (typeof value === "boolean") {
      // draw boolean
      drawTextWithIcon({
        args,
        text: value.toString(),
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: customColors.gray[50],
        iconSize: 16,
      });
    } else if (readonly && isSingleUrl) {
      drawUrlAsLink({ args, url: value as string, left });
    } else {
      if (!valueMetadata) {
        throw new Error(
          `Expected value metadata to be set when value '${value}' is not empty`,
        );
      }

      try {
        const valueParts = formatValue(
          value,
          valueMetadata,
          permittedDataTypesIncludingChildren,
        );

        let textOffset = left;
        for (const [index, part] of valueParts.entries()) {
          ctx.fillStyle = part.color;
          ctx.fillText(part.text, textOffset, yCenter);

          const additionalRightPadding =
            part.type === "leftLabel"
              ? 0.5
              : part.type === "value" &&
                  valueParts[index + 1]?.type === "rightLabel"
                ? 0.5
                : 0;

          textOffset +=
            ctx.measureText(part.text).width + additionalRightPadding;
        }
      } catch {
        /**
         * Fall back to string representation – formatValue will fail if dataTypeId is not present,
         * which is true for ProposedEntitys from a Flow.
         * @todo H-3359 always ensure dataTypeId is present on all values.
         */
        ctx.fillText((value as number).toString(), left, yCenter);
      }
    }

    const cellInteractables = drawInteractableTooltipIcons(args);

    const sources = valueMetadata?.metadata?.provenance?.sources;

    if (sources?.length) {
      const sourcesTooltipContent = <SourcesList sources={sources} />;

      const posRelativeToGrid = {
        left: rect.x,
        right: rect.x + rect.width - 80,
        top: rect.y,
        bottom: rect.y + rect.height,
      };

      const interactable = InteractableManager.createCellInteractable(args, {
        id: `cell-sources-tooltip-${row}`,
        posRelativeToVisibleGridArea: posRelativeToGrid,
        onMouseEnter: () => {
          showTooltip({
            content: sourcesTooltipContent,
            horizontalAlign: "left",
            interactablePosRelativeToCell: {
              left: 0,
              top: 0,
            },
            interactableSize: {
              width: rect.width - 80,
              height: rect.height,
            },
            colIndex: col,
            rowIndex: row,
          });
        },
      });

      cellInteractables.push(interactable);
    }

    InteractableManager.setInteractablesForCell(args, cellInteractables);

    if (validationError) {
      ctx.beginPath();
      ctx.strokeStyle = customColors.red[50];
      ctx.lineWidth = 1;
      ctx.moveTo(rect.x + getCellHorizontalPadding(), rect.y + rect.height - 4);
      ctx.lineTo(
        rect.x + rect.width - getCellHorizontalPadding(),
        rect.y + rect.height - 4,
      );
      ctx.stroke();
    }
  },
  onClick: (args) => {
    if (args.cell.data.readonly && args.cell.data.propertyRow.isSingleUrl) {
      window.open(args.cell.data.propertyRow.value as string, "_blank");
    }
    return undefined;
  },
  provideEditor: ({ data }) => {
    if (data.readonly && !data.propertyRow.isArray) {
      return {
        disableStyling: true,
        disablePadding: true,
        editor: ReadonlyValueCellPopup,
      };
    }

    return {
      disableStyling: true,
      disablePadding: true,
      editor: data.propertyRow.isArray ? ArrayEditor : SingleValueEditor,
    };
  },
};
