/* eslint-disable no-param-reassign */
/**
 * Geometric primitives for layout and hit testing.
 *
 * Circle is the readonly interface: LOD, rendering, and hit testing
 * read positions through it. MutableCircle is the concrete class
 * used during layout passes where positions change in place.
 */

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface MutablePosition {
  x: number;
  y: number;
}

export interface Circle extends Position {
  readonly radius: number;
}

export function screenRadius(circle: Circle, zoom: number): number {
  return circle.radius * 2 ** zoom;
}

/**
 * Mutable circle for layout passes. Collision resolution runs
 * thousands of iterations and must mutate positions in place.
 */
export class MutableCircle implements Circle {
  x: number;
  y: number;

  radius: number;

  constructor(x?: number, y?: number, radius?: number) {
    this.x = x ?? 0;
    this.y = y ?? 0;
    this.radius = radius ?? 0;
  }

  get isOrigin(): boolean {
    return this.x === 0 && this.y === 0 && this.radius === 0;
  }

  /**
   * Push this circle and `other` apart so they no longer overlap.
   * Each moves half the overlap distance along the center-to-center axis.
   *
   * Returns true if the circles were pushed apart. Returns false
   * if they don't overlap, or if they're coincident (distance ≈ 0)
   * and can't determine a separation direction. The caller must
   * handle the coincident case with domain-specific logic.
   */
  pushApart(other: MutableCircle, padding: number): boolean {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const dist = Math.hypot(dx, dy);
    const minDist = this.radius + other.radius + padding;

    if (dist >= minDist || dist <= 0.001) {
      return false;
    }

    const push = (minDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;
    this.x -= nx * push;
    this.y -= ny * push;
    other.x += nx * push;
    other.y += ny * push;

    return true;
  }
}

export class Bbox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;

  constructor(left: number, right: number, top: number, bottom: number) {
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
  }

  static fromViewport(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    zoom: number,
  ): Bbox {
    const scale = 2 ** zoom;
    const halfW = width / 2 / scale;
    const halfH = height / 2 / scale;
    return new Bbox(
      centerX - halfW,
      centerX + halfW,
      centerY - halfH,
      centerY + halfH,
    );
  }

  containsPoint(x: number, y: number): boolean {
    return (
      x >= this.left && x <= this.right && y >= this.top && y <= this.bottom
    );
  }

  intersectsCircle(circle: Circle): boolean {
    return (
      circle.x + circle.radius >= this.left &&
      circle.x - circle.radius <= this.right &&
      circle.y + circle.radius >= this.top &&
      circle.y - circle.radius <= this.bottom
    );
  }
}
