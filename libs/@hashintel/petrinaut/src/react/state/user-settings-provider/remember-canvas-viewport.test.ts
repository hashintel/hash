import { describe, expect, it } from "vitest";

import { rememberCanvasViewport } from "./remember-canvas-viewport";

const viewport = (zoom: number) => ({ x: 0, y: 0, zoom });

describe("rememberCanvasViewport", () => {
  it("adds and replaces the viewport of a document", () => {
    const once = rememberCanvasViewport({}, "a", viewport(1));
    expect(once).toEqual({ a: viewport(1) });
    expect(rememberCanvasViewport(once, "a", viewport(2))).toEqual({
      a: viewport(2),
    });
  });

  it("keeps other documents and moves the saved one to the most recent slot", () => {
    const saved = rememberCanvasViewport(
      { a: viewport(1), b: viewport(2) },
      "a",
      viewport(3),
    );
    expect(Object.keys(saved)).toEqual(["b", "a"]);
    expect(saved.a).toEqual(viewport(3));
  });

  it("drops the oldest documents past the limit", () => {
    const saved = rememberCanvasViewport(
      { a: viewport(1), b: viewport(2), c: viewport(3) },
      "d",
      viewport(4),
      3,
    );
    expect(Object.keys(saved)).toEqual(["b", "c", "d"]);
  });
});
