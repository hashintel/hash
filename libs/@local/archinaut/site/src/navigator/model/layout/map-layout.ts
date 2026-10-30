/**
 * The map: every layer at a stable position, nested boxes following the
 * taxonomy, so a reader learns where things live and views only change
 * what is emphasised. Roots go largest first, wrapped into rows so the
 * whole has the aspect of the screen it is drawn on; interface chips sit at
 * the centroid of their participants, pushed out of any box they would
 * cover.
 */

import {
  boundsOf,
  centerOf,
  chipHeight,
  chipWidth,
  containerTitle,
  gap,
  leafHeight,
  leafWidth,
  padding,
  type Layout,
  type PlacedNode,
} from "./types";

import type { GraphIndex } from "../graph";

interface Block {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  depth: number;
  children: Block[];
}

const rootGap = 40;

const area = (block: Block): number => block.width * block.height;

const buildBlock = (index: GraphIndex, id: string, depth: number): Block => {
  const kids = index.children.get(id) ?? [];
  if (kids.length === 0) {
    return {
      id,
      width: leafWidth,
      height: leafHeight,
      x: 0,
      y: 0,
      depth,
      children: [],
    };
  }
  const blocks = kids
    .map((kid) => buildBlock(index, kid.id, depth + 1))
    .sort(
      (left, right) =>
        Number(left.children.length > 0) - Number(right.children.length > 0) ||
        left.id.localeCompare(right.id),
    );
  // Rows wrap at the width that makes the box about twice as wide as it is
  // tall, whatever its children's sizes, so no container becomes one long
  // row.
  const rowWidth = Math.max(
    ...blocks.map((block) => block.width),
    Math.sqrt(blocks.reduce((sum, block) => sum + area(block), 0) * 2),
  );
  let cursorX = padding;
  let cursorY = containerTitle;
  let rowHeight = 0;
  let innerWidth = 0;
  for (const block of blocks) {
    if (cursorX > padding && cursorX + block.width - padding > rowWidth) {
      cursorX = padding;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    block.x = cursorX;
    block.y = cursorY;
    cursorX += block.width + gap;
    rowHeight = Math.max(rowHeight, block.height);
    innerWidth = Math.max(innerWidth, cursorX - gap);
  }
  return {
    id,
    width: innerWidth + padding,
    height: cursorY + rowHeight + padding,
    x: 0,
    y: 0,
    depth,
    children: blocks,
  };
};

const placeChips = (
  index: GraphIndex,
  nodes: Map<string, PlacedNode>,
): void => {
  const chips: PlacedNode[] = [];
  for (const node of index.model.interfaces) {
    const anchors = node.participants.flatMap((participant) => {
      const placed = nodes.get(participant.node);
      if (placed === undefined) {
        return [];
      }
      return [
        placed.container
          ? { x: placed.x + placed.width / 2, y: placed.y + containerTitle / 2 }
          : centerOf(placed),
      ];
    });
    const count = Math.max(1, anchors.length);
    const width = chipWidth(node.name);
    chips.push({
      id: node.id,
      x: anchors.reduce((sum, point) => sum + point.x, 0) / count - width / 2,
      y:
        anchors.reduce((sum, point) => sum + point.y, 0) / count -
        chipHeight / 2,
      width,
      height: chipHeight,
      depth: 0,
      container: false,
    });
  }

  const obstacles = [...nodes.values()].filter((node) => !node.container);
  const margin = 8;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    let moved = false;
    for (const chip of chips) {
      for (const other of [...obstacles, ...chips]) {
        if (other === chip) {
          continue;
        }
        const overlapX =
          Math.min(chip.x + chip.width, other.x + other.width) -
          Math.max(chip.x, other.x) +
          margin;
        const overlapY =
          Math.min(chip.y + chip.height, other.y + other.height) -
          Math.max(chip.y, other.y) +
          margin;
        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }
        const chipCenter = centerOf(chip);
        const otherCenter = centerOf(other);
        if (overlapX < overlapY) {
          chip.x += (chipCenter.x >= otherCenter.x ? 1 : -1) * overlapX;
        } else {
          chip.y += (chipCenter.y >= otherCenter.y ? 1 : -1) * overlapY;
        }
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  for (const chip of chips) {
    nodes.set(chip.id, chip);
  }
};

/**
 * @param aspect Width over height of the space the map is drawn in.
 */
export const mapLayout = (index: GraphIndex, aspect: number): Layout => {
  const nodes = new Map<string, PlacedNode>();
  const blocks = index.roots
    .map((root) => buildBlock(index, root.id, 0))
    .sort(
      (left, right) =>
        area(right) - area(left) || left.id.localeCompare(right.id),
    );

  const total = blocks.reduce((sum, block) => sum + area(block), 0);
  const targetWidth = Math.max(
    ...blocks.map((block) => block.width),
    Math.sqrt(total * aspect),
  );
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  for (const block of blocks) {
    if (cursorX > 0 && cursorX + block.width > targetWidth) {
      cursorX = 0;
      cursorY += rowHeight + rootGap;
      rowHeight = 0;
    }
    block.x = cursorX;
    block.y = cursorY;
    cursorX += block.width + rootGap;
    rowHeight = Math.max(rowHeight, block.height);
  }

  const place = (block: Block, offsetX: number, offsetY: number): void => {
    const x = offsetX + block.x;
    const y = offsetY + block.y;
    nodes.set(block.id, {
      id: block.id,
      x,
      y,
      width: block.width,
      height: block.height,
      depth: block.depth,
      container: block.children.length > 0,
    });
    for (const child of block.children) {
      place(child, x, y);
    }
  };
  for (const block of blocks) {
    place(block, 0, 0);
  }

  const mapBounds = boundsOf(nodes.values());
  let externalY = mapBounds.y;
  for (const external of index.model.externals) {
    nodes.set(external.id, {
      id: external.id,
      x: mapBounds.x + mapBounds.width + rootGap,
      y: externalY,
      width: leafWidth,
      height: leafHeight,
      depth: 0,
      container: false,
    });
    externalY += leafHeight + gap;
  }

  placeChips(index, nodes);
  return { nodes, bounds: boundsOf(nodes.values(), 40) };
};
