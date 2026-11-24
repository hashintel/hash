import type { Size } from "@hashintel/petrinaut-core";
import type { XYPosition } from "@xyflow/react";

const clamp = (value: number, maximum: number) =>
  Math.max(0, Math.min(maximum, value));

/** Stretch a rounded rectangle's outline toward the place, keeping the drawing area intact. */
export const getVisualizerBubble = (
  size: Size,
  target: XYPosition | null,
): string => {
  const width = Math.max(0, size.width - 1);
  const height = Math.max(0, size.height - 1);
  const radius = Math.min(13.5, width / 2, height / 2);
  const sides = [
    {
      x: radius,
      y: 0,
      dx: 1,
      dy: 0,
      length: width - 2 * radius,
      cx: width - radius,
      cy: radius,
      angle: -Math.PI / 2,
    },
    {
      x: width,
      y: radius,
      dx: 0,
      dy: 1,
      length: height - 2 * radius,
      cx: width - radius,
      cy: height - radius,
      angle: 0,
    },
    {
      x: width - radius,
      y: height,
      dx: -1,
      dy: 0,
      length: width - 2 * radius,
      cx: radius,
      cy: height - radius,
      angle: Math.PI / 2,
    },
    {
      x: 0,
      y: height - radius,
      dx: 0,
      dy: -1,
      length: height - 2 * radius,
      cx: radius,
      cy: radius,
      angle: Math.PI,
    },
  ];
  const cornerLength = (radius * Math.PI) / 2;
  const perimeter = sides.reduce(
    (total, side) => total + side.length + cornerLength,
    0,
  );
  if (perimeter === 0) return "";
  const wrap = (distance: number) =>
    ((distance % perimeter) + perimeter) % perimeter;
  const outlineAt = (distance: number) => {
    let remaining = wrap(distance);
    for (const side of sides) {
      if (remaining <= side.length)
        return {
          x: side.x + side.dx * remaining,
          y: side.y + side.dy * remaining,
          dx: side.dx,
          dy: side.dy,
        };
      remaining -= side.length;
      if (remaining <= cornerLength) {
        const angle = side.angle + remaining / radius;
        return {
          x: side.cx + radius * Math.cos(angle),
          y: side.cy + radius * Math.sin(angle),
          dx: -Math.sin(angle),
          dy: Math.cos(angle),
        };
      }
      remaining -= cornerLength;
    }
    return { x: radius, y: 0, dx: 1, dy: 0 };
  };

  const samples = new Set([0, perimeter]);
  let offset = 0;
  let attachment = 0;
  let nearest = Infinity;
  for (const side of sides) {
    for (const [start, length, spacing] of [
      [offset, side.length, 24],
      [offset + side.length, cornerLength, 4],
    ] as const) {
      const steps = Math.max(1, Math.ceil(length / spacing));
      for (let index = 0; index <= steps; index++)
        samples.add(start + (length * index) / steps);
    }
    if (target) {
      const angle =
        Math.atan2(target.y - 0.5 - side.cy, target.x - 0.5 - side.cx) -
        side.angle;
      const arc =
        clamp(Math.atan2(Math.sin(angle), Math.cos(angle)), Math.PI / 2) *
        radius;
      const line = clamp(
        (target.x - 0.5 - side.x) * side.dx +
          (target.y - 0.5 - side.y) * side.dy,
        side.length,
      );
      for (const candidate of [offset + line, offset + side.length + arc]) {
        const point = outlineAt(candidate);
        const distance = Math.hypot(
          target.x - 0.5 - point.x,
          target.y - 0.5 - point.y,
        );
        if (distance < nearest) {
          nearest = distance;
          attachment = candidate;
        }
      }
    }
    offset += side.length + cornerLength;
  }

  const base = outlineAt(attachment);
  const length = target ? nearest : 0;
  let cornerDistance = Infinity;
  offset = 0;
  for (const side of sides) {
    const middle = offset + side.length + cornerLength / 2;
    const distance = Math.abs(
      wrap(attachment - middle + perimeter / 2) - perimeter / 2,
    );
    cornerDistance = Math.min(
      cornerDistance,
      Math.max(0, distance - cornerLength / 2),
    );
    offset += side.length + cornerLength;
  }
  const cornerRatio = Math.min(1, cornerDistance / 24);
  const cornerBlend = cornerRatio ** 2 * (3 - 2 * cornerRatio);
  const reach = Math.min(
    Math.min(width, height) * 0.2,
    length * 0.6,
    4 + (2 + 8 / (1 + length / 60)) * cornerBlend,
  );
  const hasTail = target !== null && length > 8 && reach > 0;
  const start = hasTail ? wrap(attachment + reach) : 0;
  const end = hasTail ? perimeter - 2 * reach : perimeter;
  const distances = [
    0,
    ...[...samples]
      .map((distance) => wrap(distance - start))
      .filter((distance) => distance > 0 && distance < end),
    end,
  ].sort((first, second) => first - second);
  const coordinates = (x: number, y: number) =>
    `${(x + 0.5).toFixed(2)} ${(y + 0.5).toFixed(2)}`;
  const first = outlineAt(start);
  const commands = [`M ${coordinates(first.x, first.y)}`];
  for (let index = 1; index < distances.length; index++) {
    const from = outlineAt(start + distances[index - 1]!);
    const to = outlineAt(start + distances[index]!);
    const step = (distances[index]! - distances[index - 1]!) / 3;
    commands.push(
      `C ${coordinates(from.x + from.dx * step, from.y + from.dy * step)} ${coordinates(to.x - to.dx * step, to.y - to.dy * step)} ${coordinates(to.x, to.y)}`,
    );
  }
  if (hasTail) {
    const normal = {
      x: (target.x - 0.5 - base.x) / length,
      y: (target.y - 0.5 - base.y) / length,
    };
    const tangent = { x: -normal.y, y: normal.x };
    const dotRadius = 3;
    const neck = 0.65 + 1.35 / (1 + length / 60);
    const join = dotRadius / Math.SQRT2;
    const waist = length * 0.6;
    const point = (along: number, across: number) =>
      coordinates(
        base.x + normal.x * along + tangent.x * across,
        base.y + normal.y * along + tangent.y * across,
      );
    const last = outlineAt(start + end);
    // Keep the dot round while the neck thins with distance from the window.
    const dotHandle = Math.min(0.8, length / 12);
    commands.push(
      `C ${coordinates(last.x + last.dx * reach * 0.8, last.y + last.dy * reach * 0.8)} ${point(length * 0.2, -neck)} ${point(waist, -neck)}`,
      `C ${point(length * 0.8, -neck)} ${point(length - join - dotHandle, -join + dotHandle)} ${point(length - join, -join)}`,
      `A ${dotRadius} ${dotRadius} 0 1 1 ${point(length - join, join)}`,
      `C ${point(length - join - dotHandle, join - dotHandle)} ${point(length * 0.8, neck)} ${point(waist, neck)}`,
      `C ${point(length * 0.2, neck)} ${coordinates(first.x - first.dx * reach * 0.8, first.y - first.dy * reach * 0.8)} ${coordinates(first.x, first.y)}`,
    );
  }
  return `${commands.join(" ")} Z`;
};
