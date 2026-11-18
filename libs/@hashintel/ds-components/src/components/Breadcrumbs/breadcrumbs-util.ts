/**
 * Fewest-collapse tolerance in px. Cell widths are sub-pixel (`getBoundingClientRect`)
 * while the available width derives from the integer `clientWidth`;
 * the tolerance keeps cells from collapsing on a fractional rounding difference.
 */
const FIT_TOLERANCE = 1;

type CollapseState = { hiddenCount: number; showFirst: boolean };

const NO_COLLAPSE: CollapseState = { hiddenCount: 0, showFirst: true };

/** The `maxItems`-imposed minimum hidden count, before any width pressure. */
const minHiddenForMaxItems = (count: number, maxItems?: number): number =>
  maxItems != null && count > maxItems ? count - Math.max(maxItems, 1) : 0;

export const initialCollapse = (
  count: number,
  maxItems?: number,
): CollapseState => {
  const hiddenCount = count >= 2 ? minHiddenForMaxItems(count, maxItems) : 0;
  return { hiddenCount, showFirst: hiddenCount <= count - 2 };
};

/**
 * The middle entries (everything but the first and last) that may collapse,
 * front-to-back — the order they join the ellipsis menu under pressure.
 */
const middleHideable = (collapsible: boolean[]): number[] => {
  const indices: number[] = [];
  for (let index = 1; index <= collapsible.length - 2; index++) {
    if (collapsible[index]) {
      indices.push(index);
    }
  }
  return indices;
};

/**
 * The hidden entry indices (ascending) a collapse state denotes, given which
 * entries may collapse at all. Shared by the width math and the rendering so
 * the two can never disagree. Non-collapsible entries stay visible in place;
 * a single ellipsis stands at the position of the first hidden entry.
 */
export const hiddenIndicesFor = (
  collapsible: boolean[],
  state: CollapseState,
): number[] => {
  const middle = middleHideable(collapsible);
  const firstHideable = collapsible.length >= 2 && collapsible[0] === true;
  const maxHideable = middle.length + (firstHideable ? 1 : 0);
  const hiddenCount = Math.min(Math.max(state.hiddenCount, 0), maxHideable);
  if (hiddenCount === 0) {
    return [];
  }
  const showFirst =
    !firstHideable || (state.showFirst && hiddenCount <= middle.length);
  return showFirst
    ? middle.slice(0, hiddenCount)
    : [0, ...middle.slice(0, hiddenCount - 1)];
};

/**
 * Given the measured natural width of every cell (each entry plus its leading
 * separator; cell 0 has none) and which entries may collapse, decide how many
 * to hide. Non-collapsible entries (custom nodes, `noCollapse` crumbs) stay
 * visible in place; the hidden ones share a single ellipsis menu standing at
 * the position of the first hidden entry.
 *
 * Hides the fewest entries possible, trying configurations in order:
 * 1. The whole trail.
 * 2. The root stays visible; hideable middle entries collapse front-to-back.
 * 3. In very tight spaces the root joins the ellipsis too
 *    (`bareEllipsisWidth` is the trigger without a leading separator, since
 *    the ellipsis then heads the trail). At equal hidden counts the
 *    root-visible form wins.
 * 4. Everything hideable hidden — the current page truncates.
 *
 * `maxItems` sets a floor on the hidden count regardless of width, capped by
 * how many entries may collapse at all.
 */
export const computeCollapse = ({
  cellWidths,
  collapsible,
  ellipsisWidth,
  bareEllipsisWidth,
  available,
  maxItems,
}: {
  cellWidths: number[];
  collapsible: boolean[];
  ellipsisWidth: number;
  bareEllipsisWidth: number;
  available: number;
  maxItems?: number;
}): CollapseState => {
  const count = cellWidths.length;
  if (count <= 1) {
    return NO_COLLAPSE;
  }

  const fits = (needed: number) => needed <= available + FIT_TOLERANCE;
  const middle = middleHideable(collapsible);
  const firstHideable = collapsible[0] === true;
  const maxHideable = middle.length + (firstHideable ? 1 : 0);
  const totalWidth = cellWidths.reduce((sum, width) => sum + width, 0);
  // middleWidths[h]: total width of the first h hideable middle cells.
  const middleWidths = [0];
  for (const index of middle) {
    middleWidths.push(middleWidths.at(-1)! + cellWidths[index]!);
  }

  for (
    let hidden = Math.min(minHiddenForMaxItems(count, maxItems), maxHideable);
    hidden <= maxHideable;
    hidden++
  ) {
    if (hidden === 0) {
      if (fits(totalWidth)) {
        return NO_COLLAPSE;
      }
      continue;
    }
    if (hidden <= middle.length) {
      const needed = totalWidth - middleWidths[hidden]! + ellipsisWidth;
      if (fits(needed)) {
        return { hiddenCount: hidden, showFirst: true };
      }
    }
    if (firstHideable && hidden - 1 <= middle.length) {
      const needed =
        totalWidth -
        cellWidths[0]! -
        middleWidths[hidden - 1]! +
        bareEllipsisWidth;
      if (fits(needed)) {
        return { hiddenCount: hidden, showFirst: false };
      }
    }
  }

  // Nothing fits: hide everything hideable and let the current page truncate.
  return { hiddenCount: maxHideable, showFirst: !firstHideable };
};
