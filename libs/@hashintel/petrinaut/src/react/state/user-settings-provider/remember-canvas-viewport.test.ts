import { describe, expect, it } from "vitest";

import { rememberCanvasViewport } from "./remember-canvas-viewport";

const viewport = (zoom: number) => ({ x: 0, y: 0, zoom });
const saved = (zoom: number, savedAt: number) => ({
  ...viewport(zoom),
  savedAt,
});

describe("rememberCanvasViewport", () => {
  it("adds and replaces the viewport of a document", () => {
    const once = rememberCanvasViewport({}, "a", viewport(1), 10);
    expect(once).toEqual({ a: saved(1, 10) });
    expect(rememberCanvasViewport(once, "a", viewport(2), 20)).toEqual({
      a: saved(2, 20),
    });
  });

  it("keeps the other documents and stamps the saved one", () => {
    expect(
      rememberCanvasViewport(
        { a: saved(1, 10), b: saved(2, 20) },
        "a",
        viewport(3),
        30,
      ),
    ).toEqual({ b: saved(2, 20), a: saved(3, 30) });
  });

  it("drops the least recently saved documents past the limit", () => {
    const result = rememberCanvasViewport(
      { a: saved(1, 30), b: saved(2, 10), c: saved(3, 20) },
      "d",
      viewport(4),
      40,
      3,
    );
    expect(Object.keys(result).sort()).toEqual(["a", "c", "d"]);
  });

  it("evicts by save time when document ids read as integers", () => {
    const result = rememberCanvasViewport(
      { 1: saved(1, 30), 2: saved(2, 10) },
      "3",
      viewport(3),
      40,
      2,
    );
    expect(Object.keys(result).sort()).toEqual(["1", "3"]);
  });

  it("treats entries saved before stamping as the oldest", () => {
    const result = rememberCanvasViewport(
      { unstamped: viewport(1), recent: saved(2, 50) },
      "current",
      viewport(3),
      60,
      2,
    );
    expect(Object.keys(result).sort()).toEqual(["current", "recent"]);
  });
});
