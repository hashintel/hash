export const stepCardSize = { width: 200, height: 59 };
export const stepGap = 64;
export const forEachBoxPadding = { header: 40, side: 16 };
export const collapsedForEachSize = { width: 240, height: stepCardSize.height };

/** A step's paths are rows under its card's header, after a hairline. */
export const pathRows = { rowHeight: 24, paddingY: 4 };

export const getStepCardSize = (pathCount: number) =>
  pathCount === 0
    ? stepCardSize
    : {
        width: stepCardSize.width,
        height:
          stepCardSize.height +
          1 +
          pathRows.paddingY * 2 +
          pathCount * pathRows.rowHeight,
      };
