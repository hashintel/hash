import { describe, expect, it } from "vitest";

import {
  openTo,
  outlineRows,
  toggleRow,
  onOneLine,
  type Expansion,
  type OutlineRow,
} from "./rows";

const net = {
  places: [
    { id: "p1", name: "Stock", colorId: null, x: 0, y: 20.5, initial: true },
    { id: "p2", name: "Sold", colorId: null, x: 300, y: 20.5 },
  ],
  transitions: [
    {
      id: "t1",
      name: "Sell",
      inputArcs: [{ placeId: "p1", weight: 1 }],
      lambdaCode: "export default Lambda(() => {\n  return 1;\n});",
    },
  ],
  types: [],
  parameterValues: {},
  title: undefined,
};

/** Each row on a line: its indent, its key, and what its line says. */
const lines = (rows: readonly OutlineRow[]): string[] =>
  rows.map(({ depth, key, value }) => {
    const said =
      value.kind === "scalar"
        ? value.text
        : value.kind === "text"
          ? `| ${value.lineCount} lines${value.open ? ", open" : ""}`
          : value.open
            ? ""
            : value.summary;
    return `${"  ".repeat(depth)}${key}: ${said}`.trimEnd();
  });

const outline = (expansion: Expansion) => lines(outlineRows(net, expansion));

describe("outlineRows", () => {
  it("opens the first level, and puts each item of a list under its place in it", () => {
    expect(outline(openTo(1))).toEqual([
      "places:",
      // The entries past what fits on the line are left to an ellipsis.
      '  0: { name: "Stock", id: "p1", colorId: null, x: 0, y: 20.5, … }',
      '  1: { name: "Sold", id: "p2", colorId: null, x: 300, y: 20.5 }',
      "transitions:",
      '  0: { name: "Sell", id: "t1", inputArcs: [1 item], … }',
      // A map or a list with nothing in it is a value on its line, and a
      // key set to `undefined` is not there.
      "types: []",
      "parameterValues: {}",
    ]);
  });

  it("opens and closes a row the reader toggles, and keeps the rest", () => {
    const opened = toggleRow(openTo(1), "/places/#p1");
    expect(outline(opened).slice(0, 9)).toEqual([
      "places:",
      "  0:",
      '    id: "p1"',
      '    name: "Stock"',
      "    colorId: null",
      "    x: 0",
      "    y: 20.5",
      "    initial: true",
      '  1: { name: "Sold", id: "p2", colorId: null, x: 300, y: 20.5 }',
    ]);
    expect(outline(toggleRow(opened, "/places/#p1"))).toEqual(
      outline(openTo(1)),
    );
    expect(outline(toggleRow(openTo(1), "/places")).slice(0, 2)).toEqual([
      "places: [2 items]",
      "transitions:",
    ]);
  });

  it("draws text of several lines as a block, closed until opened or all is", () => {
    const transition = toggleRow(openTo(1), "/transitions/#t1");
    expect(outline(transition).slice(3, 9)).toEqual([
      "transitions:",
      "  0:",
      '    id: "t1"',
      '    name: "Sell"',
      "    inputArcs: [1 item]",
      "    lambdaCode: | 3 lines",
    ]);
    expect(
      outline(toggleRow(transition, "/transitions/#t1/lambdaCode")).at(8),
    ).toBe("    lambdaCode: | 3 lines, open");
    expect(outline(openTo(Infinity)).at(-3)).toBe(
      "    lambdaCode: | 3 lines, open",
    );
  });

  it("opens to any depth, from which a toggle still flips a row", () => {
    expect(outline(openTo(0))).toEqual([
      "places: [2 items]",
      "transitions: [1 item]",
      "types: []",
      "parameterValues: {}",
    ]);
    expect(outline(openTo(2)).slice(0, 4)).toEqual([
      "places:",
      "  0:",
      '    id: "p1"',
      '    name: "Stock"',
    ]);
    expect(outline(openTo(Infinity))).toHaveLength(25);
    expect(outline(toggleRow(openTo(Infinity), "/places")).slice(0, 2)).toEqual(
      ["places: [2 items]", "transitions:"],
    );
  });

  it("knows an item by its id, so its row stays open when the list changes", () => {
    const opened = toggleRow(openTo(1), "/places/#p2");
    const reordered = { ...net, places: [net.places[1], net.places[0]] };

    expect(lines(outlineRows(reordered, opened)).slice(0, 3)).toEqual([
      "places:",
      "  0:",
      '    id: "p2"',
    ]);
    // Items that share an id, or have none, go by their place in the list.
    expect(
      outlineRows(
        { list: [{ id: "a" }, { id: "a" }, "b"] },
        openTo(Infinity),
      ).map(({ path }) => path),
    ).toEqual([
      "/list",
      "/list/0",
      "/list/0/id",
      "/list/1",
      "/list/1/id",
      "/list/2",
    ]);
  });

  it("says what a closed map holds: the entries that fit on its line, its name first, its lists among them", () => {
    const summaries = outlineRows(
      {
        patch: { op: "replace", path: ["places", 0, "x"], value: 120 },
        other: { code: "a\nb", list: [{ id: "a" }], count: 3, flag: true },
        nested: { inner: { deep: 1 } },
        net: { places: [{ id: "p1" }, { id: "p2" }], transitions: [] },
        long: { id: "i".repeat(70), name: "A name" },
        "a/b~c": { only: null },
      },
      openTo(0),
    ).map(({ path, value }) => [
      path,
      value.kind === "collection" ? value.summary : null,
    ]);

    expect(summaries).toEqual([
      // A short list of plain values reads whole, as a patch's path does.
      ["/patch", '{ op: "replace", path: ["places", 0, "x"], value: 120 }'],
      // A list says how many items it holds where they do not read whole.
      ["/other", "{ list: [1 item], count: 3, flag: true, … }"],
      ["/nested", "{ … }"],
      ["/net", "{ places: [2 items], transitions: [] }"],
      ["/long", '{ name: "A name", … }'],
      // A slash or a tilde in a key is escaped in its path.
      ["/a~1b~0c", "{ only: null }"],
    ]);
  });

  it("says a closed list's items where they read whole, else how many it holds", () => {
    const summaries = outlineRows(
      {
        path: ["places", 0, "name"],
        one: [1],
        items: [{ id: "a" }],
        mixed: [1, { id: "a" }, "c"],
        blocks: ["a\nb"],
        long: Array.from({ length: 40 }, (_, index) => index),
      },
      openTo(0),
    ).map(({ value }) => (value.kind === "collection" ? value.summary : null));

    expect(summaries).toEqual([
      '["places", 0, "name"]',
      "[1]",
      "[1 item]",
      "[3 items]",
      "[1 item]",
      "[40 items]",
    ]);
  });

  it("has no rows for data that is not a map or a list, or holds nothing", () => {
    expect(outlineRows(undefined, openTo(1))).toEqual([]);
    expect(outlineRows("text", openTo(1))).toEqual([]);
    expect(outlineRows({}, openTo(1))).toEqual([]);
    expect(lines(outlineRows([1, "two"], openTo(1)))).toEqual([
      "0: 1",
      '1: "two"',
    ]);
  });
});

describe("onOneLine", () => {
  it("says any value as a closed row of it would", () => {
    expect(
      [
        "Stock",
        120,
        false,
        null,
        [],
        {},
        ["places", 0],
        { id: "p1", name: "Stock", arcs: [{ weight: 1 }] },
        [{ id: "p1" }, { id: "p2" }],
        "a\nb\nc",
      ].map(onOneLine),
    ).toEqual([
      '"Stock"',
      "120",
      "false",
      "null",
      "[]",
      "{}",
      '["places", 0]',
      '{ name: "Stock", id: "p1", arcs: [1 item] }',
      "[2 items]",
      "| 3 lines",
    ]);
  });
});
