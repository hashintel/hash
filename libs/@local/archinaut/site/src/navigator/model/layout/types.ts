export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PlacedNode extends Box {
  id: string;
  depth: number;
  container: boolean;
}

export interface Layout {
  nodes: Map<string, PlacedNode>;
  bounds: Box;
}

export const leafWidth = 176;
export const leafHeight = 46;
export const chipHeight = 30;
export const containerTitle = 30;
export const padding = 12;
export const gap = 10;

export const chipWidth = (name: string): number =>
  Math.min(300, Math.max(132, 30 + name.length * 6.6));

export const centerOf = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

export const boundsOf = (boxes: Iterable<Box>, margin = 0): Box => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + 2 * margin,
    height: maxY - minY + 2 * margin,
  };
};
