/** How far above its card the loop runs. */
const clearance = 24;

/**
 * How far past a pin the loop swings before it turns: a share of its rise,
 * and no less than the least, so that it clears the card's corner.
 */
const swingShare = 0.5;
const leastSwing = 40;

/**
 * The link of a fusion whose two ends are pins of one card: out of the
 * right-hand pin, over the card and back into the left-hand pin, so that no
 * stretch of it runs under the card. Returns the path and the point at its
 * top, where the knot sits, in the order `getBezierPath` returns them.
 */
export const fusionLoopPath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  cardTop,
}: {
  /** The right-hand pin. */
  sourceX: number;
  sourceY: number;
  /** The left-hand pin. */
  targetX: number;
  targetY: number;
  cardTop: number;
}): [path: string, labelX: number, labelY: number] => {
  const top = cardTop - clearance;
  const middleX = (sourceX + targetX) / 2;
  const swing = (pinY: number) =>
    Math.max(leastSwing, (pinY - top) * swingShare);
  const right = sourceX + swing(sourceY);
  const left = targetX - swing(targetY);

  return [
    [
      `M ${sourceX},${sourceY}`,
      `C ${right},${sourceY} ${right},${top} ${middleX},${top}`,
      `C ${left},${top} ${left},${targetY} ${targetX},${targetY}`,
    ].join(" "),
    middleX,
    top,
  ];
};
