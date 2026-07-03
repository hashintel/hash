/**
 * Spatial binning for the community BubbleSets (the R9 fix): turns each
 * community's single bbox-covering quad into one instance per occupied grid
 * cell, so a fragment only ever sums the kernels that can actually reach it.
 *
 * Why: the metaball field is thresholded, but a fragment can only prove
 * "below threshold" by summing every kernel; with one quad per community
 * that made exterior/contour pixels (the dominant population on a zoomed-out
 * view full of overlapping communities) pay O(members + segments) texel
 * fetches each. Kernels have finite support, so the field at a pixel only
 * depends on points within `fieldRadius` and capsules within their radius.
 * Binning kernels into cells of `2 * fieldRadius` bounds every fragment's
 * work to a handful of local kernels, and skips empty regions entirely
 * (no instance -> no fragments at all).
 *
 * The packing preserves the field exactly: a cell's kernel list contains
 * every point whose support disc intersects the cell rect and every capsule
 * whose support (spine dilated by its radius) does, so the per-cell sum
 * equals the full-community sum at every pixel inside the cell
 * (`evaluateBubbleField` in `bubble-corridors.ts` is the test oracle).
 * Contours are therefore pixel-identical to the unbinned rendering.
 *
 * Texel layout (rgba32float, {@link BUBBLE_TEX_WIDTH} wide, rows wrap),
 * appended community by community:
 *
 * [cell point copies ...][cell capsule endpoint-pair copies ...]
 *
 * Point texel: `(x, y, _, _)`. Capsule pair: `(ax, ay, radius, _)` then
 * `(bx, by, _, _)`; the same conventions the bubble shader already reads,
 * so the shader is unchanged; only what an "instance" means changed. Texel
 * channels the shader never samples (`.ba` of points, the pair's second
 * `.ba`) are left unwritten between frames.
 *
 * Storage reuses grow-only {@link Column} buffers across frames; steady-state
 * packing allocates only per-pack subarray views. Hot loops go through
 * `Column.raw`, so steady-state packing allocates nothing but the five
 * exact-length result views per pack. The reported texture height is
 * monotone (grow-only) so the layer's texture is not re-created every time
 * occupancy jitters by a row.
 */
import { Column } from "../worker/collections/column";
import { forEachCapsuleCell } from "./bubble-grid-traversal";

/** Width of the positions texture the metaball shader samples (rows wrap). */
export const BUBBLE_TEX_WIDTH = 256;

/**
 * Cell edge as a multiple of the point-kernel field radius. At 2× the
 * support radius, a point's support disc intersects at most a 2×2 cell
 * block, and a capsule (corridor radii are ≪ fieldRadius) only ever bleeds
 * into the ring-1 neighbours of the cells its spine crosses.
 */
const CELL_SIZE_FIELD_RADII = 2;

/**
 * One grouping's kernels, as handed to {@link BubbleCellPacker.pack}.
 *
 * Fields are raw typed-array views into `CommunityGrouping`'s storage
 * (community.ts), NOT {@link Column}s, deliberately: that storage has a
 * fixed layout frozen when the grouping is built — fixed sizes, disjoint
 * per-community segment regions at fixed offsets — and is rewritten in
 * place by the gather loop and the corridor planner, which share these
 * exact arrays. Nothing there grows or windows, so a `Column` wrapper
 * would only imply resizability (which would corrupt the fixed offsets)
 * and add unwrapping at every consumer. The packer's own state — which
 * DOES grow and window per frame — is where `Column` earns its keep.
 */
export interface BubbleCellPack {
  /** Number of rendered (kept) communities. */
  readonly keptCount: number;
  /** Per kept community `[pointSlotOffset, memberCount]` (gather order). */
  readonly ranges: Float32Array;
  /** Canonical member positions, texel stride 4 (`[x, y, _, _]` per slot). */
  readonly pointTexels: Float32Array;
  /** Per kept community RGBA. */
  readonly colors: Uint8Array;
  /** Per corridor segment `[slotA, slotB]`; absolute point slots. */
  readonly segmentSlots: Int32Array;
  /** Per corridor segment: capsule kernel radius (world units). */
  readonly segmentRadius: Float32Array;
  /** Per kept community: live segment count. */
  readonly segmentCounts: Int32Array;
  /** Per kept community: first segment-storage index. */
  readonly segmentStorageOffsets: Int32Array;
  /** Per kept community: point-kernel field radius (world units). Oversampled
   * communities carry a larger radius (see `communityFieldRadius`), so the
   * cell grid — sized from the radius — is coarser for them too. */
  readonly fieldRadii: Float32Array;
}

/** Views over the packer's columns; valid until the next `pack()`. */
export interface BubbleCellPackResult {
  /** Occupied cells across all communities == instance count. */
  readonly cellCount: number;
  /** Exactly `BUBBLE_TEX_WIDTH * texHeight` texels (*4 floats). */
  readonly texels: Float32Array;
  readonly texHeight: number;
  /** Per cell `[minX, minY, maxX, maxY]` world rect. */
  readonly bounds: Float32Array;
  /** Per cell RGBA (its community's colour). */
  readonly colors: Uint8Array;
  /** Per cell `[firstPointTexel, pointCount]`. */
  readonly nodeRanges: Float32Array;
  /** Per cell `[firstEndpointPairTexel, segmentCount]`. */
  readonly segmentRanges: Float32Array;
  /** Per cell: its community's point-kernel field radius (world units). */
  readonly fieldRadii: Float32Array;
}

/** GPU-bound and scratch storage never leaves this thread. */
const plain = { backing: "plain" } as const;

/**
 * Reusable packer: bins one grouping's kernels into per-cell instances every
 * frame. Owns all storage; see the module header for the layout.
 */
export class BubbleCellPacker {
  /** Point copies per cell; the instance pass turns counts into write cursors. */
  #cellPointCounts = new Column(Int32Array, 256, plain);

  /** Capsule copies per cell; the instance pass turns counts into write cursors. */
  #cellSegmentCounts = new Column(Int32Array, 256, plain);

  /** Cell → dense instance index, or -1 for empty cells. */
  #cellInstance = new Column(Int32Array, 256, plain);

  /**
   * Per-segment visit stamp, so one segment marks each cell at most once.
   * Contents deliberately PERSIST across packs (a stale stamp can never
   * equal a fresh {@link #stampCounter} value, and `resize` re-exposes old
   * slots as-is), so it is never zeroed in the steady state. A `BitSet`
   * would do the same job but needs an O(cells) clear per segment; bumping
   * the stamp is a free reset.
   */
  #cellStamp = new Column(Int32Array, 256, plain);

  #stampCounter = 0;

  /** Collected `(cell, pointSlot)` incidences for the current community. */
  #pointPairs = new Column(Int32Array, 512, plain);

  /** Collected `(cell, segmentStorageIndex)` incidences. */
  #segmentPairs = new Column(Int32Array, 512, plain);

  /** Grid shape of the community currently being packed. */
  #cols = 0;

  #rows = 0;

  #texels = new Column(Float32Array, BUBBLE_TEX_WIDTH * 4, plain);

  #bounds = new Column(Float32Array, 256, plain);

  #colors = new Column(Uint8Array, 256, plain);

  #nodeRanges = new Column(Float32Array, 128, plain);

  #segmentRanges = new Column(Float32Array, 128, plain);

  #fieldRadii = new Column(Float32Array, 128, plain);

  /** Monotone texture height: keeps occupancy jitter from re-creating the GPU texture. */
  #texHeight = 1;

  /** Segment being traversed by {@link #markSegmentCell} (avoids a closure per segment). */
  #currentSegmentStorage = 0;

  /** Stamp/count views for the community being traversed. */
  #stampView = new Int32Array(0);

  #segmentCountsView = new Int32Array(0);

  /** Record one deduped `(cell, segment)` incidence during a capsule walk. */
  #markSegmentCell = (col: number, row: number): void => {
    const cell = row * this.#cols + col;
    if (this.#stampView[cell] === this.#stampCounter) {
      return;
    }
    this.#stampView[cell] = this.#stampCounter;
    this.#segmentCountsView[cell] = this.#segmentCountsView[cell]! + 1;
    this.#segmentPairs.push(cell);
    this.#segmentPairs.push(this.#currentSegmentStorage);
  };

  pack(pack: BubbleCellPack): BubbleCellPackResult {
    const { keptCount, ranges, pointTexels } = pack;

    // Stamps stay valid across packs because the counter only grows; reset
    // both before it can wrap (hours of continuous packing) so a stale stamp
    // can never alias a fresh one.
    if (this.#stampCounter > 0x40000000) {
      this.#stampCounter = 0;
      this.#cellStamp.fill(0);
    }

    this.#bounds.clear();
    this.#colors.clear();
    this.#nodeRanges.clear();
    this.#segmentRanges.clear();
    this.#fieldRadii.clear();
    this.#texels.clear();

    let cellTotal = 0;
    let texelCursor = 0;

    for (let ci = 0; ci < keptCount; ci++) {
      const pointOffset = ranges[ci * 2]!;
      const memberCount = ranges[ci * 2 + 1]!;
      if (memberCount === 0) {
        continue;
      }

      const fieldRadius = pack.fieldRadii[ci]!;
      const cellSize = fieldRadius * CELL_SIZE_FIELD_RADII;

      // Grid over the community bbox EXPANDED by the field radius: kernels
      // reach that far past the outermost member, and every pixel with a
      // non-zero field must land in some cell.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let member = 0; member < memberCount; member++) {
        const slot = (pointOffset + member) * 4;
        const x = pointTexels[slot]!;
        const y = pointTexels[slot + 1]!;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      const originX = minX - fieldRadius;
      const originY = minY - fieldRadius;

      const cols = Math.max(
        1,
        Math.ceil((maxX + fieldRadius - originX) / cellSize),
      );
      const rows = Math.max(
        1,
        Math.ceil((maxY + fieldRadius - originY) / cellSize),
      );

      this.#cols = cols;
      this.#rows = rows;
      const cellCount = cols * rows;

      this.#cellPointCounts.resize(cellCount);
      this.#cellPointCounts.fill(0);
      this.#cellSegmentCounts.resize(cellCount);
      this.#cellSegmentCounts.fill(0);
      this.#cellInstance.resize(cellCount);
      this.#cellStamp.resize(cellCount);

      this.#collectPointPairs(
        pack,
        ci,
        fieldRadius,
        originX,
        originY,
        cellSize,
      );
      this.#collectSegmentPairs(pack, ci, originX, originY, cellSize);

      // Occupied cells to dense instances, then prefix-sum both count
      // columns into write cursors for the scatter passes. `raw` views:
      // these loops are the packer's hot path, all indices are window-
      // bounded above, and none of the columns grow until re-read.
      const pointCounts = this.#cellPointCounts.raw;
      const segmentCounts = this.#cellSegmentCounts.raw;
      const cellInstance = this.#cellInstance.raw;
      const instanceBase = cellTotal;

      let localInstances = 0;
      let pointCopyTotal = 0;
      let segmentCopyTotal = 0;

      for (let cell = 0; cell < cellCount; cell++) {
        const pointCopies = pointCounts[cell]!;
        const segmentCopies = segmentCounts[cell]!;
        if (pointCopies === 0 && segmentCopies === 0) {
          cellInstance[cell] = -1;
          continue;
        }

        cellInstance[cell] = instanceBase + localInstances;
        localInstances += 1;
        pointCopyTotal += pointCopies;
        segmentCopyTotal += segmentCopies;
      }

      const instanceEnd = instanceBase + localInstances;
      this.#bounds.resize(instanceEnd * 4);
      this.#colors.resize(instanceEnd * 4);
      this.#nodeRanges.resize(instanceEnd * 2);
      this.#segmentRanges.resize(instanceEnd * 2);
      this.#fieldRadii.resize(instanceEnd);

      const pointRegionBase = texelCursor;
      const segmentRegionBase = pointRegionBase + pointCopyTotal;
      texelCursor = segmentRegionBase + segmentCopyTotal * 2;
      this.#texels.resize(texelCursor * 4);

      const bounds = this.#bounds.raw;
      const colors = this.#colors.raw;
      const nodeRanges = this.#nodeRanges.raw;
      const segmentRanges = this.#segmentRanges.raw;
      const fieldRadii = this.#fieldRadii.raw;

      let pointCursor = pointRegionBase;
      let segmentPairCursor = 0;

      const red = pack.colors[ci * 4]!;
      const green = pack.colors[ci * 4 + 1]!;
      const blue = pack.colors[ci * 4 + 2]!;
      const alpha = pack.colors[ci * 4 + 3]!;

      for (let cell = 0; cell < cellCount; cell++) {
        const instance = cellInstance[cell]!;
        if (instance < 0) {
          continue;
        }

        const col = cell % cols;
        const row = (cell - col) / cols;

        bounds[instance * 4] = originX + col * cellSize;
        bounds[instance * 4 + 1] = originY + row * cellSize;
        bounds[instance * 4 + 2] = originX + (col + 1) * cellSize;
        bounds[instance * 4 + 3] = originY + (row + 1) * cellSize;

        colors[instance * 4] = red;
        colors[instance * 4 + 1] = green;
        colors[instance * 4 + 2] = blue;
        colors[instance * 4 + 3] = alpha;

        fieldRadii[instance] = fieldRadius;

        nodeRanges[instance * 2] = pointCursor;
        nodeRanges[instance * 2 + 1] = pointCounts[cell]!;

        segmentRanges[instance * 2] = segmentRegionBase + segmentPairCursor * 2;
        segmentRanges[instance * 2 + 1] = segmentCounts[cell]!;

        // Prefix sums are complete; overwrite counts with absolute texel
        // write cursors for the scatter passes.
        const pointStart = pointCursor;
        pointCursor += pointCounts[cell]!;
        pointCounts[cell] = pointStart;

        const segmentStart = segmentPairCursor;
        segmentPairCursor += segmentCounts[cell]!;
        segmentCounts[cell] = segmentRegionBase + segmentStart * 2;
      }

      this.#scatterPoints(pointTexels);
      this.#scatterSegments(pack);

      cellTotal = instanceEnd;
    }

    const neededHeight = Math.max(1, Math.ceil(texelCursor / BUBBLE_TEX_WIDTH));
    this.#texHeight = Math.max(this.#texHeight, neededHeight);
    this.#texels.resize(BUBBLE_TEX_WIDTH * this.#texHeight * 4);

    // Exact-length views (not `raw`): deck sizes uploads by view length and
    // the luma texture write must match texWidth × texHeight.
    return {
      cellCount: cellTotal,
      texels: this.#texels.subarray().view,
      texHeight: this.#texHeight,
      bounds: this.#bounds.subarray().view,
      colors: this.#colors.subarray().view,
      nodeRanges: this.#nodeRanges.subarray().view,
      segmentRanges: this.#segmentRanges.subarray().view,
      fieldRadii: this.#fieldRadii.subarray().view,
    };
  }

  /**
   * Every `(cell, pointSlot)` incidence for community `ci`: cells whose rect
   * intersects the point's support disc. Cell size is 2 × the support
   * radius, so the candidate block is at most 2×2; the exact rect–disc test
   * trims corner overreach.
   */
  #collectPointPairs(
    pack: BubbleCellPack,
    ci: number,
    fieldRadius: number,
    originX: number,
    originY: number,
    cellSize: number,
  ): void {
    const { ranges, pointTexels } = pack;
    const cols = this.#cols;
    const rows = this.#rows;
    const pointCounts = this.#cellPointCounts.raw;
    const pointOffset = ranges[ci * 2]!;
    const memberCount = ranges[ci * 2 + 1]!;
    const radiusSq = fieldRadius * fieldRadius;
    this.#pointPairs.clear();

    for (let member = 0; member < memberCount; member++) {
      const slot = pointOffset + member;
      const x = pointTexels[slot * 4]!;
      const y = pointTexels[slot * 4 + 1]!;
      const colMin = Math.max(
        0,
        Math.floor((x - fieldRadius - originX) / cellSize),
      );
      const colMax = Math.min(
        cols - 1,
        Math.floor((x + fieldRadius - originX) / cellSize),
      );

      const rowMin = Math.max(
        0,
        Math.floor((y - fieldRadius - originY) / cellSize),
      );
      const rowMax = Math.min(
        rows - 1,
        Math.floor((y + fieldRadius - originY) / cellSize),
      );

      for (let row = rowMin; row <= rowMax; row++) {
        for (let col = colMin; col <= colMax; col++) {
          const cellMinX = originX + col * cellSize;
          const cellMinY = originY + row * cellSize;

          const nearestX = Math.min(Math.max(x, cellMinX), cellMinX + cellSize);
          const nearestY = Math.min(Math.max(y, cellMinY), cellMinY + cellSize);

          const dx = x - nearestX;
          const dy = y - nearestY;

          if (dx * dx + dy * dy >= radiusSq) {
            continue;
          }

          const cell = row * cols + col;
          pointCounts[cell] = pointCounts[cell]! + 1;
          this.#pointPairs.push(cell);
          this.#pointPairs.push(slot);
        }
      }
    }
  }

  /**
   * Every `(cell, segment)` incidence for community `ci`: cells the capsule
   * support touches ({@link forEachCapsuleCell} enumerates them; the stamp
   * dedupes, since a straight walk revisits neighbours).
   */
  #collectSegmentPairs(
    pack: BubbleCellPack,
    ci: number,
    originX: number,
    originY: number,
    cellSize: number,
  ): void {
    const {
      pointTexels,
      segmentSlots,
      segmentRadius,
      segmentCounts,
      segmentStorageOffsets,
    } = pack;

    const storageStart = segmentStorageOffsets[ci]!;
    const segmentCount = segmentCounts[ci]!;

    this.#segmentPairs.clear();
    this.#stampView = this.#cellStamp.raw;
    this.#segmentCountsView = this.#cellSegmentCounts.raw;

    for (let segment = 0; segment < segmentCount; segment++) {
      const storage = storageStart + segment;
      const radius = Math.min(segmentRadius[storage]!, cellSize);
      if (radius <= 0) {
        continue;
      }

      this.#stampCounter += 1;
      this.#currentSegmentStorage = storage;

      forEachCapsuleCell(
        {
          ax: pointTexels[segmentSlots[storage * 2]! * 4]!,
          ay: pointTexels[segmentSlots[storage * 2]! * 4 + 1]!,
          bx: pointTexels[segmentSlots[storage * 2 + 1]! * 4]!,
          by: pointTexels[segmentSlots[storage * 2 + 1]! * 4 + 1]!,
          radius,
          originX,
          originY,
          cellSize,
          cols: this.#cols,
          rows: this.#rows,
        },
        this.#markSegmentCell,
      );
    }
  }

  /** Scatter collected point incidences into their cells' texel blocks. */
  #scatterPoints(pointTexels: Float32Array): void {
    // `raw` spans capacity, so bound the walk by the columns' window lengths.
    const pairCount = this.#pointPairs.length;
    const pairs = this.#pointPairs.raw;
    const cursors = this.#cellPointCounts.raw;
    const texels = this.#texels.raw;

    for (let pair = 0; pair < pairCount; pair += 2) {
      const cell = pairs[pair]!;
      const slot = pairs[pair + 1]!;
      const texel = cursors[cell]!;

      cursors[cell] = texel + 1;
      texels[texel * 4] = pointTexels[slot * 4]!;
      texels[texel * 4 + 1] = pointTexels[slot * 4 + 1]!;
    }
  }

  /** Scatter collected capsule incidences as endpoint-pair texels. */
  #scatterSegments(pack: BubbleCellPack): void {
    const { pointTexels, segmentSlots, segmentRadius } = pack;
    const pairCount = this.#segmentPairs.length;
    const pairs = this.#segmentPairs.raw;
    const cursors = this.#cellSegmentCounts.raw;
    const texels = this.#texels.raw;

    for (let pair = 0; pair < pairCount; pair += 2) {
      const cell = pairs[pair]!;
      const storage = pairs[pair + 1]!;
      const texel = cursors[cell]!;

      cursors[cell] = texel + 2;

      const slotA = segmentSlots[storage * 2]!;
      const slotB = segmentSlots[storage * 2 + 1]!;

      texels[texel * 4] = pointTexels[slotA * 4]!;
      texels[texel * 4 + 1] = pointTexels[slotA * 4 + 1]!;
      texels[texel * 4 + 2] = segmentRadius[storage]!;
      texels[(texel + 1) * 4] = pointTexels[slotB * 4]!;
      texels[(texel + 1) * 4 + 1] = pointTexels[slotB * 4 + 1]!;
    }
  }
}
