import type { CanvasNode, CanvasPoint } from "../../../../canvas-scene";

export type OutlineNode = {
  position: CanvasPoint;
  width: number;
  height: number;
  cornerRadius: number;
};

export type OutlineArcPath = [path: string, labelX: number, labelY: number];

export const getOutlineNode = (
  node: Pick<CanvasNode, "kind" | "position" | "width" | "height">,
  compactNodes: boolean,
): OutlineNode | null =>
  node.kind === "componentInstance"
    ? null
    : {
        position: node.position,
        width: node.width,
        height: node.height,
        cornerRadius:
          node.kind === "place"
            ? Math.min(node.width, node.height) / 2
            : compactNodes
              ? 0
              : 12,
      };

export const getOutlineAttachment = (
  node: OutlineNode,
  direction: CanvasPoint,
): { point: CanvasPoint; normal: CanvasPoint } => {
  const length = Math.hypot(direction.x, direction.y);
  const unit =
    length > 0
      ? { x: direction.x / length, y: direction.y / length }
      : { x: 1, y: 0 };
  const halfWidth = Math.max(0, node.width / 2);
  const halfHeight = Math.max(0, node.height / 2);
  const radius = Math.max(
    0,
    Math.min(node.cornerRadius, halfWidth, halfHeight),
  );
  const horizontalDistance =
    unit.x === 0 ? Infinity : halfWidth / Math.abs(unit.x);
  const verticalDistance =
    unit.y === 0 ? Infinity : halfHeight / Math.abs(unit.y);
  let distance = Math.min(horizontalDistance, verticalDistance);
  let normal =
    horizontalDistance < verticalDistance
      ? { x: Math.sign(unit.x), y: 0 }
      : { x: 0, y: Math.sign(unit.y) };

  if (
    radius > 0 &&
    Math.abs(unit.x * distance) > halfWidth - radius &&
    Math.abs(unit.y * distance) > halfHeight - radius
  ) {
    const corner = {
      x: Math.sign(unit.x) * (halfWidth - radius),
      y: Math.sign(unit.y) * (halfHeight - radius),
    };
    const projection = unit.x * corner.x + unit.y * corner.y;
    distance =
      projection +
      Math.sqrt(
        Math.max(
          0,
          projection ** 2 - corner.x ** 2 - corner.y ** 2 + radius ** 2,
        ),
      );
    normal = {
      x: (unit.x * distance - corner.x) / radius,
      y: (unit.y * distance - corner.y) / radius,
    };
  }

  return {
    point: {
      x: node.position.x + unit.x * distance,
      y: node.position.y + unit.y * distance,
    },
    normal,
  };
};

export const getOutlineArcPath = (
  source: OutlineNode,
  target: OutlineNode | CanvasPoint,
  hasReverseArc = false,
): OutlineArcPath => {
  const targetCenter = "position" in target ? target.position : target;
  const direction = {
    x: targetCenter.x - source.position.x,
    y: targetCenter.y - source.position.y,
  };
  if (direction.x === 0 && direction.y === 0) {
    direction.x = 1;
  }
  const lane = hasReverseArc ? 0.3 : 0;
  const sourceAttachment = getOutlineAttachment(source, {
    x: direction.x - direction.y * lane,
    y: direction.y + direction.x * lane,
  });
  const targetAttachment =
    "position" in target
      ? getOutlineAttachment(target, {
          x: -direction.x - direction.y * lane,
          y: -direction.y + direction.x * lane,
        })
      : { point: target, normal: { x: 0, y: 0 } };
  const start = sourceAttachment.point;
  const end = targetAttachment.point;
  const controlDistance = Math.min(
    80,
    Math.hypot(end.x - start.x, end.y - start.y) * 0.35,
  );
  const firstControl = {
    x: start.x + sourceAttachment.normal.x * controlDistance,
    y: start.y + sourceAttachment.normal.y * controlDistance,
  };
  const lastControl = {
    x: end.x + targetAttachment.normal.x * controlDistance,
    y: end.y + targetAttachment.normal.y * controlDistance,
  };
  return [
    `M ${start.x},${start.y} C ${firstControl.x},${firstControl.y} ${lastControl.x},${lastControl.y} ${end.x},${end.y}`,
    (start.x + 3 * firstControl.x + 3 * lastControl.x + end.x) / 8,
    (start.y + 3 * firstControl.y + 3 * lastControl.y + end.y) / 8,
  ];
};
