/**
 * Incrementally-built rasterised icon atlas.
 *
 * A 2D canvas grid of fixed-size cells; each unique icon key is rasterised once.
 * {@link version} bumps on any change (new cell, finished async raster, canvas grow).
 *
 * Icon formats:
 * - URL (`http(s)://` or `/`): monochrome SVG drawn as a white silhouette
 *   (recoloured via `source-in`), loaded asynchronously. Pending until resolved.
 * - Other string: emoji, drawn synchronously with `fillText`.
 *
 * Cells are pre-coloured (white silhouettes / full-colour emoji). The atlas owns
 * the GPU texture lifecycle: {@link getTexture} lazily rebuilds from the canvas
 * when the version or device changes.
 */

import type { Position } from "../../geometry";
import type { Device, Texture } from "@luma.gl/core";

/** A rasterised icon's cell rectangle within the atlas canvas, in device pixels. */
export interface AtlasCell extends Position {
  readonly width: number;
  readonly height: number;
}

/** Side length (device px) of one square atlas cell -- the rasterisation resolution per icon. */
const CELL_SIZE = 64;

/**
 * Cells per row. Fixed for the atlas's life; growth only adds rows, so
 * existing slots keep their (col, row) and pixels copy with one blit.
 */
const COLUMNS = 8;

/** Initial row count; the canvas grows by {@link ROW_GROWTH} rows whenever the grid fills. */
const INITIAL_ROWS = 8;
const ROW_GROWTH = 8;

/** Emoji glyph size within a cell (leaves a small margin so it never clips the cell edge). */
const EMOJI_FONT_PX = Math.round(CELL_SIZE * 0.8);

/** True when the icon string is http(s) or root-relative (async SVG silhouette); otherwise treated as emoji. */
function isUrlIcon(icon: string): boolean {
  return (
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("/")
  );
}

/** Resolve root-relative paths against window.location.origin. */
function resolveIconUrl(icon: string): string {
  return icon.startsWith("/")
    ? new URL(icon, window.location.origin).href
    : icon;
}

/** A claimed cell. `cellIndex` is a stable row-major slot (never reused). */
interface AtlasEntry {
  readonly cellIndex: number;
  ready: boolean;
}

export class IconAtlas {
  /** Bumped on any change (new cell, finished async raster, canvas grow). */
  #version = 0;
  /** The backing canvas; a grid of {@link CELL_SIZE} cells, uploaded to the GPU by the layer. */
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  /** Current row count (columns are fixed at {@link COLUMNS}); grows by {@link ROW_GROWTH}. */
  #rows = INITIAL_ROWS;
  /** Next free cell slot (row-major); never decreases, so slots are stable across grows. */
  #nextCell = 0;
  /** Every claimed key (ready or pending) -> its stable slot + ready flag. */
  readonly #entries = new Map<string, AtlasEntry>();
  /** Fired after an async raster finishes (so the Scene re-pushes the layers). */
  readonly #onUpdate: () => void;
  /** Cached GPU texture + the atlas version + device it was built from (rebuilt when stale). */
  #texture: Texture | undefined;
  #textureVersion = -1;
  #textureDevice: Device | undefined;
  /**
   * Cached deck `iconMapping` + the version it reflects. A per-frame layer build then reuses one
   * object identity until the atlas actually changes, so deck does not re-process the mapping each
   * frame (it diffs `iconMapping` by identity).
   */
  #mapping: Record<string, AtlasCell> | undefined;
  #mappingVersion = -1;

  constructor(onUpdate: () => void) {
    this.#onUpdate = onUpdate;
    this.#canvas = document.createElement("canvas");
    this.#canvas.width = COLUMNS * CELL_SIZE;
    this.#canvas.height = this.#rows * CELL_SIZE;
    this.#ctx = this.#contextOf(this.#canvas);
  }

  get version(): number {
    return this.#version;
  }

  /** The backing canvas (exposed mainly for tests; the layer uses {@link getTexture}). */
  get canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  /** GPU texture, rebuilt from the canvas when version or device changes. */
  getTexture(device: Device): Texture {
    if (
      this.#texture === undefined ||
      this.#textureVersion !== this.#version ||
      this.#textureDevice !== device
    ) {
      this.#texture?.destroy();
      this.#texture = device.createTexture({
        data: this.#canvas,
        width: this.#canvas.width,
        height: this.#canvas.height,
        sampler: { minFilter: "linear", magFilter: "linear" },
      });
      this.#textureVersion = this.#version;
      this.#textureDevice = device;
    }
    return this.#texture;
  }

  /** deck.gl `iconMapping` for ready keys. Cached by version (stable identity). */
  getMapping(): Record<string, AtlasCell> {
    if (this.#mapping !== undefined && this.#mappingVersion === this.#version) {
      return this.#mapping;
    }
    const mapping: Record<string, AtlasCell> = {};
    for (const [key, entry] of this.#entries) {
      if (entry.ready) {
        mapping[key] = this.#cellRect(entry.cellIndex);
      }
    }
    this.#mapping = mapping;
    this.#mappingVersion = this.#version;
    return mapping;
  }

  /** Is `key` rasterised and ready to draw? A pending/unknown key is not. */
  has(key: string): boolean {
    return this.#entries.get(key)?.ready === true;
  }

  /** Ensure each key is rasterised (or in flight). Already-claimed keys are skipped. */
  ensureIcons(keys: readonly string[]): void {
    for (const key of keys) {
      if (key.length === 0 || this.#entries.has(key)) {
        continue;
      }
      if (isUrlIcon(key)) {
        this.#rasterizeUrl(key);
      } else {
        this.#rasterizeEmoji(key);
      }
    }
  }

  /** Release the GPU texture. The atlas must not be used afterwards. */
  dispose(): void {
    this.#texture?.destroy();
    this.#texture = undefined;
  }

  #contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("IconAtlas: 2D canvas context unavailable");
    }
    return ctx;
  }

  /** Claim the next free slot, growing the canvas first if the grid is full. */
  #claimSlot(): number {
    if (this.#nextCell >= COLUMNS * this.#rows) {
      this.#grow();
    }
    const slot = this.#nextCell;
    this.#nextCell += 1;
    return slot;
  }

  /** Add rows: taller canvas, single blit copy, existing cell rectangles stay valid. */
  #grow(): void {
    const previous = this.#canvas;
    this.#rows += ROW_GROWTH;
    const next = document.createElement("canvas");
    next.width = COLUMNS * CELL_SIZE;
    next.height = this.#rows * CELL_SIZE;
    const ctx = this.#contextOf(next);
    ctx.drawImage(previous, 0, 0);
    this.#canvas = next;
    this.#ctx = ctx;
    this.#version += 1;
  }

  /** The cell rectangle for a row-major slot index (columns fixed at {@link COLUMNS}). */
  #cellRect(slot: number): AtlasCell {
    const col = slot % COLUMNS;
    const row = Math.floor(slot / COLUMNS);
    return {
      x: col * CELL_SIZE,
      y: row * CELL_SIZE,
      width: CELL_SIZE,
      height: CELL_SIZE,
    };
  }

  #rasterizeEmoji(key: string): void {
    const slot = this.#claimSlot();
    const cell = this.#cellRect(slot);
    const ctx = this.#ctx;
    ctx.save();
    ctx.clearRect(cell.x, cell.y, cell.width, cell.height);
    ctx.font = `${EMOJI_FONT_PX}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(key, cell.x + cell.width / 2, cell.y + cell.height / 2);
    ctx.restore();
    this.#entries.set(key, { cellIndex: slot, ready: true });
    this.#version += 1;
  }

  #rasterizeUrl(key: string): void {
    const slot = this.#claimSlot();
    const entry: AtlasEntry = { cellIndex: slot, ready: false };
    this.#entries.set(key, entry);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      // The canvas may have grown while this loaded; the slot is stable, so recompute its rect.
      this.#drawSilhouette(image, this.#cellRect(entry.cellIndex));
      entry.ready = true;
      this.#version += 1;
      this.#onUpdate();
    };
    image.onerror = () => {
      // Drop it: the key stays not-ready, never enters the mapping, so the layer simply never
      // shows an icon for it. (Its slot is spent -- a blank cell -- which is acceptable.)
      this.#entries.delete(key);
    };
    image.src = resolveIconUrl(key);
  }

  /** Draw `image` fitted into `cell`, then recolour to a white silhouette via `source-in`. */
  #drawSilhouette(image: HTMLImageElement, cell: AtlasCell): void {
    const ctx = this.#ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    ctx.clearRect(cell.x, cell.y, cell.width, cell.height);
    const naturalWidth = image.naturalWidth || cell.width;
    const naturalHeight = image.naturalHeight || cell.height;
    const fit = Math.min(
      cell.width / naturalWidth,
      cell.height / naturalHeight,
    );
    const drawWidth = naturalWidth * fit;
    const drawHeight = naturalHeight * fit;
    const drawX = cell.x + (cell.width - drawWidth) / 2;
    const drawY = cell.y + (cell.height - drawHeight) / 2;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    ctx.restore();
  }
}
