import { VerticalIndentationLineDir } from "../../../../../../../components/grid/utils/draw-vertical-indentation-line";
import { PropertyRow } from "./types";

const markUpperHalvesOfIndentationLines = (rows: PropertyRow[]) => {
  // for each row, starting from the first row
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] as PropertyRow;
    const arr: VerticalIndentationLineDir[] = [];

    const { children, indent } = row;

    const prevRow = rows[rowIndex - 1];
    const iHaveChild = children.length > 0;

    // for each indentation level
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
        if (prevRow) {
          const isPrevIndentNotSmallerThanMe = prevRow.indent >= indent;

          hasUp = !iHaveChild && isPrevIndentNotSmallerThanMe;
        }
      }
      if (hasUp) {
        arr[i] = "up";
      }
    }

    row.verticalLinesForEachIndent = arr;
  }
};

/**
 * this **SHOULD** be runned after `markUpperHalvesOfIndentationLines`
 * because it uses the previously calculated/marked "up" halves of indentation lines
 * to calculate the down halves
 */
const markBottomHalvesOfIndentationLines = (rows: PropertyRow[]) => {
  /**
   * For each row, starting from the last row and going backwards.
   * Previous function called `markUpperHalvesOfIndentationLines` already calculated & marked all "up" parts of the lines.
   * So instead of a complex logic to calculate "down" parts,
   * for each row, we look at the row below to see if there are lines that needs to continue upwards.
   * Reason for going backwars is, each row needs to check if the row below has a line which should continue upwards.
   * So we start from bottom, and keep drawing each line until they end
   */
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--) {
    const row = rows[rowIndex] as PropertyRow;

    const { verticalLinesForEachIndent } = row;

    const { indent } = row;

    const nextRow = rows[rowIndex + 1];
    const prevRow = rows[rowIndex - 1];

    /**
     * If there is no nextRow (means this is the last row),
     * or newRow has no depth, no need to check if we should have "down" half of the line for this row.
     * Because it's impossible in this case
     */
    if (nextRow && nextRow.depth > 0) {
      // for each indentation level
      for (let i = 0; i <= indent; i++) {
        let hasDown = false;

        // if there are lines that needs to continue upwards at the row below
        if (
          nextRow.verticalLinesForEachIndent[i] === "up" ||
          nextRow.verticalLinesForEachIndent[i] === "full"
        ) {
          hasDown = true;
        }

        let shouldThisBeAFullLine = false;
        const isDrawingCurrentIndent = i === indent;

        if (!isDrawingCurrentIndent && prevRow?.depth) {
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
};

/**
 * Calculates & fills `verticalLinesForEachIndent` for each property row
 * It uses `indent` and `children` of each property row for these calculations
 * @param rows is the flattened tree of property rows
 */
export const fillRowIndentCalculations = (rows: PropertyRow[]) => {
  markUpperHalvesOfIndentationLines(rows);
  markBottomHalvesOfIndentationLines(rows);
};

/**
 * @todo instead of calculating & storing indentation line statuses for each indivicual cell
 * as an alternative, we can calculate & store the actual lines in n array,
 * and while rendering cells, we can check that array
 * to see if there are lines should be drawn on that cell.
 * The stored line objects should look something line this
 * line = {
 * startsAt:2, // column index of where the line starts
 * endsAt: 5,  // column index of where the line ends
 * indent: 2 // line indentation level
 * }
 */
