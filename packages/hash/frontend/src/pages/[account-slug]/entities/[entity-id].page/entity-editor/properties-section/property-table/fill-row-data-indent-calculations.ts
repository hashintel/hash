import { VerticalLineDir } from "../../../../../../../components/GlideGlid/utils/draw-vertical-line";
import { PropertyRow } from "./types";

export const fillRowDataIndentCalculations = (
  rowData: PropertyRow[],
): PropertyRow[] => {
  // calculate all of the "up" pars
  for (let row = 0; row < rowData.length; row++) {
    const property = rowData[row];
    const arr: VerticalLineDir[] = [];

    if (!property) {
      throw new Error("for loop broken?");
    }

    const { children, indent } = property;

    const prev = rowData[row - 1];
    const iHaveChild = children.length > 0;

    for (let i = 0; i <= indent; i++) {
      let hasUp = false;

      const isDrawingCurrentIndent = i === indent;
      const isDrawingPrevIndent = i === indent - 1;
      const isDrawingToChevronsLeft = iHaveChild && isDrawingPrevIndent;

      // setting hasUp for special cases
      if (isDrawingToChevronsLeft) {
        // on left of chevron icon, always draw "up" line
        hasUp = true;
      } else if (isDrawingCurrentIndent) {
        /**
         * if there is a previous row AND
         * I have no child AND
         * previous row's indent is not smaller then mine,
         * then draw "up" line
         */
        if (prev) {
          const isPrevIndentNotSmallerThanMe = prev.indent >= indent;

          hasUp = Boolean(!iHaveChild && isPrevIndentNotSmallerThanMe);
        }
      }
      if (hasUp) {
        arr[i] = "up";
      }
    }

    property.verticalLinesForEachIndent = arr;
  }

  // calculate "down" parts, based on the "up" parts
  for (let row = rowData.length - 1; row >= 0; row--) {
    const property = rowData[row];

    if (!property) {
      throw new Error("for loop broken?");
    }

    const { verticalLinesForEachIndent } = property;

    const { indent } = property;

    const next = rowData[row + 1];
    const prev = rowData[row - 1];

    if (next && next.depth > 0) {
      for (let i = 0; i <= indent; i++) {
        let hasDown = false;

        const isDrawingCurrentIndent = i === indent;

        if (
          next.verticalLinesForEachIndent[i] === "up" ||
          next.verticalLinesForEachIndent[i] === "full"
        ) {
          hasDown = true;
        }

        let shouldThisBeAFullLine = false;
        if (!isDrawingCurrentIndent && prev?.depth) {
          shouldThisBeAFullLine = true;
        }

        if (hasDown) {
          const wasThisMarkedAsUp = verticalLinesForEachIndent[i] === "up";
          const shouldBeFull = wasThisMarkedAsUp || shouldThisBeAFullLine;
          verticalLinesForEachIndent[i] = shouldBeFull ? "full" : "down";
        }
      }
    }
  }

  return rowData;
};
