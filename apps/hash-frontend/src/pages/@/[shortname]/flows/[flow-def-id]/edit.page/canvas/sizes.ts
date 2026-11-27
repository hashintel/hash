export const stepCardSize = { width: 200, height: 59 };
export const stepGap = 64;
export const forEachBoxPadding = { header: 40, side: 16 };
export const collapsedForEachSize = { width: 240, height: stepCardSize.height };
/** A box with no steps inside: room for one card, where its "+" sits. */
export const emptyForEachSize = {
  width: stepCardSize.width + forEachBoxPadding.side * 2,
  height:
    forEachBoxPadding.header + stepCardSize.height + forEachBoxPadding.side,
};

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

/** A box big enough for the cards inside it, at their places in it, with its padding to their right and below. */
export const getForEachBoxSize = (
  cards: {
    position: { x: number; y: number };
    width: number;
    height: number;
  }[],
) => ({
  width: Math.max(
    emptyForEachSize.width,
    ...cards.map(
      ({ position, width }) => position.x + width + forEachBoxPadding.side,
    ),
  ),
  height: Math.max(
    emptyForEachSize.height,
    ...cards.map(
      ({ position, height }) => position.y + height + forEachBoxPadding.side,
    ),
  ),
});
