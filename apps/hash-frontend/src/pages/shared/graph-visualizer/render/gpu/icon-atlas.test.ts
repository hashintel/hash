/**
 * IconAtlas contract tests on scripted DOM fakes (node environment, no
 * jsdom): the synchronous emoji path, the async URL lifecycle, and the
 * terminal-failure rule that a URL key which failed to load is skipped by
 * every later `ensureIcons` call (no second fetch, no fresh slot claim)
 * while subsequent keys keep working.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IconAtlas } from "./icon-atlas";

const noop = (): void => undefined;

/** 2D-context stand-in covering exactly the calls the atlas makes. */
const fakeContext = () =>
  ({
    save: noop,
    restore: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    clearRect: noop,
    fillRect: noop,
    fillText: noop,
    drawImage: noop,
    font: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
    globalCompositeOperation: "",
  }) as unknown as CanvasRenderingContext2D;

const fakeCanvas = () => ({
  width: 0,
  height: 0,
  getContext: fakeContext,
});

/** Captures every `new Image()` so tests can resolve or fail loads manually. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  naturalWidth = 24;
  naturalHeight = 24;
  src = "";

  constructor() {
    FakeImage.instances.push(this);
  }
}

const URL_KEY = "https://icons.test/type.svg";

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function newAtlas(): { atlas: IconAtlas; updateCount: () => number } {
  let updates = 0;
  const atlas = new IconAtlas(() => {
    updates += 1;
  });
  return { atlas, updateCount: () => updates };
}

describe("IconAtlas", () => {
  it("rasterises emoji synchronously into the mapping", () => {
    const { atlas } = newAtlas();

    atlas.ensureIcons(["📦"]);

    expect(atlas.has("📦")).toBe(true);
    expect(atlas.getMapping()["📦"]).toMatchObject({ x: 0, y: 0 });
  });

  it("keeps a URL key pending until its load resolves", () => {
    const { atlas, updateCount } = newAtlas();

    atlas.ensureIcons([URL_KEY]);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(URL_KEY);
    expect(atlas.has(URL_KEY)).toBe(false);

    // Re-ensuring an in-flight key must not start a second request.
    atlas.ensureIcons([URL_KEY]);
    expect(FakeImage.instances).toHaveLength(1);

    const versionBefore = atlas.version;
    FakeImage.instances[0]!.onload?.();
    expect(atlas.has(URL_KEY)).toBe(true);
    expect(atlas.getMapping()[URL_KEY]).toMatchObject({ x: 0, y: 0 });
    expect(atlas.version).toBe(versionBefore + 1);
    expect(updateCount()).toBe(1);
  });

  it("treats a failed URL load as terminal: skipped forever, slot spent once", () => {
    const { atlas, updateCount } = newAtlas();

    atlas.ensureIcons([URL_KEY]);
    // The browser reports a failed request through the error event; the atlas
    // deliberately leaves it unhandled, so the entry stays claimed, not ready.
    FakeImage.instances[0]!.onerror?.();
    expect(atlas.has(URL_KEY)).toBe(false);
    expect(atlas.getMapping()[URL_KEY]).toBeUndefined();

    // Icon rescans (tier changes, leaf rebuilds, streamed entities sharing the
    // type's icon) re-send the key: it must be skipped, not refetched into a
    // freshly claimed slot.
    atlas.ensureIcons([URL_KEY]);
    expect(FakeImage.instances).toHaveLength(1);
    expect(updateCount()).toBe(0);

    // The failed key's slot 0 stays spent (a blank cell): the next key claims
    // slot 1, one cell width in.
    atlas.ensureIcons(["📦"]);
    expect(atlas.getMapping()["📦"]).toMatchObject({ x: 64, y: 0 });
  });
});
