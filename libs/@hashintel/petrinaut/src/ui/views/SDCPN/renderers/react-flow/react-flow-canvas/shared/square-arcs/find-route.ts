import type { CanvasPoint } from "../../../../../canvas-scene";

export type RoutingBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type RoutingPort = {
  point: CanvasPoint;
  anchor: CanvasPoint;
  direction: number;
};

const directions = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const bendCost = 32;
const maxGridPoints = 24_000;
const maxVisitedStates = 12_000;
const epsilon = 0.001;

export const segmentIsClear = (
  start: CanvasPoint,
  end: CanvasPoint,
  boxes: readonly RoutingBox[],
): boolean =>
  !boxes.some((box) =>
    start.x === end.x
      ? start.x > box.left + epsilon &&
        start.x < box.right - epsilon &&
        Math.max(start.y, end.y) > box.top + epsilon &&
        Math.min(start.y, end.y) < box.bottom - epsilon
      : start.y > box.top + epsilon &&
        start.y < box.bottom - epsilon &&
        Math.max(start.x, end.x) > box.left + epsilon &&
        Math.min(start.x, end.x) < box.right - epsilon,
  );

type Entry = { state: number; cost: number; estimate: number };

const createQueue = () => {
  const heap: Entry[] = [];
  return {
    get length() {
      return heap.length;
    },
    push: (entry: Entry) => {
      let index = heap.length;
      heap.push(entry);
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        const parentEntry = heap[parent];
        if (!parentEntry || parentEntry.estimate <= entry.estimate) break;
        heap[index] = parentEntry;
        index = parent;
      }
      heap[index] = entry;
    },
    pop: (): Entry | undefined => {
      const first = heap[0];
      const last = heap.pop();
      if (!last || heap.length === 0) return first;
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        let childEntry = heap[child];
        const nextChild = heap[child + 1];
        if (
          nextChild &&
          childEntry &&
          nextChild.estimate < childEntry.estimate
        ) {
          child++;
          childEntry = nextChild;
        }
        if (!childEntry || childEntry.estimate >= last.estimate) break;
        heap[index] = childEntry;
        index = child;
      }
      heap[index] = last;
      return first;
    },
  };
};

const distance = (start: CanvasPoint, end: CanvasPoint) =>
  Math.abs(end.x - start.x) + Math.abs(end.y - start.y);

/** Searches the orthogonal visibility grid, with heading in the state so bends have a cost. */
export const findRoute = (
  sources: readonly RoutingPort[],
  targets: readonly RoutingPort[],
  boxes: readonly RoutingBox[],
  bounds: RoutingBox,
): CanvasPoint[] | null => {
  if (!sources.length || !targets.length) return null;
  const ports = [...sources, ...targets];
  const xs = [
    ...new Set([
      bounds.left,
      bounds.right,
      ...ports.map((port) => port.point.x),
      ...boxes
        .flatMap((box) => [box.left, box.right])
        .filter((value) => value > bounds.left && value < bounds.right),
    ]),
  ].sort((left, right) => left - right);
  const ys = [
    ...new Set([
      bounds.top,
      bounds.bottom,
      ...ports.map((port) => port.point.y),
      ...boxes
        .flatMap((box) => [box.top, box.bottom])
        .filter((value) => value > bounds.top && value < bounds.bottom),
    ]),
  ].sort((left, right) => left - right);
  if (xs.length * ys.length > maxGridPoints) return null;

  const cellOf = (point: CanvasPoint) =>
    ys.indexOf(point.y) * xs.length + xs.indexOf(point.x);
  const pointOf = (cell: number): CanvasPoint => ({
    x: xs[cell % xs.length]!,
    y: ys[Math.floor(cell / xs.length)]!,
  });
  const targetsByCell = new Map(
    targets.map((port) => [cellOf(port.point), port]),
  );
  const heuristic = (point: CanvasPoint) =>
    Math.min(
      ...targets.map(
        (port) =>
          distance(point, port.point) + distance(port.point, port.anchor),
      ),
    );
  const costs = new Map<number, number>();
  const previous = new Map<number, number>();
  const starts = new Map<number, RoutingPort>();
  const queue = createQueue();
  const clearSegments = new Map<string, boolean>();
  for (const port of sources) {
    const state = cellOf(port.point) * 4 + port.direction;
    const cost = distance(port.anchor, port.point);
    costs.set(state, cost);
    starts.set(state, port);
    queue.push({ state, cost, estimate: cost + heuristic(port.point) });
  }

  let best: { state: number; target: RoutingPort; cost: number } | undefined;
  let visited = 0;
  while (queue.length && visited < maxVisitedStates) {
    const entry = queue.pop();
    if (!entry) break;
    if (best && entry.estimate >= best.cost) break;
    if (entry.cost !== costs.get(entry.state)) continue;
    visited++;
    const cell = Math.floor(entry.state / 4);
    const heading = entry.state % 4;
    const point = pointOf(cell);
    const target = targetsByCell.get(cell);
    if (target && (target.direction < 0 || heading !== target.direction)) {
      const cost =
        entry.cost +
        distance(point, target.anchor) +
        (target.direction >= 0 && heading !== (target.direction + 2) % 4
          ? bendCost
          : 0);
      if (!best || cost < best.cost)
        best = { state: entry.state, target, cost };
    }
    for (const [direction, delta] of directions.entries()) {
      if (direction === (heading + 2) % 4) continue;
      const column = (cell % xs.length) + delta.x;
      const row = Math.floor(cell / xs.length) + delta.y;
      if (column < 0 || column >= xs.length || row < 0 || row >= ys.length)
        continue;
      const nextCell = row * xs.length + column;
      const nextPoint = pointOf(nextCell);
      const key = `${Math.min(cell, nextCell)}:${Math.max(cell, nextCell)}`;
      let clear = clearSegments.get(key);
      if (clear === undefined) {
        clear = segmentIsClear(point, nextPoint, boxes);
        clearSegments.set(key, clear);
      }
      if (!clear) continue;
      const state = nextCell * 4 + direction;
      const cost =
        entry.cost +
        distance(point, nextPoint) +
        (heading === direction ? 0 : bendCost);
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state, cost);
      previous.set(state, entry.state);
      queue.push({ state, cost, estimate: cost + heuristic(nextPoint) });
    }
  }
  if (!best) return null;
  const points = [best.target.anchor];
  let state = best.state;
  for (;;) {
    points.push(pointOf(Math.floor(state / 4)));
    const parent = previous.get(state);
    if (parent === undefined) break;
    state = parent;
  }
  const source = starts.get(state);
  if (!source) return null;
  points.push(source.anchor);
  return points.reverse();
};
