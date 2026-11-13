import { describe, expect, it } from "vitest";

import { buildDataTypeTree } from "./data-type-tree";

import type { VersionedUrl } from "@blockprotocol/type-system";

const id = (name: string, version = 1) =>
  `https://blockprotocol.org/@blockprotocol/types/data-type/${name}/v/${version}` as VersionedUrl;
const row = (name: string, parents: string[] = [], version = 1) => ({
  rowId: id(name, version),
  typeId: id(name, version),
  title: name,
  parentIds: parents.map((parent) => id(parent)),
});
const path = (...names: string[]) =>
  JSON.stringify(names.map((name) => id(name)));
const rows = [
  row("value"),
  row("number", ["value"]),
  row("length", ["number"]),
  row("metric", ["length"]),
  row("meters", ["metric"]),
  row("imperial", ["length"]),
  row("feet", ["imperial"]),
  row("text", ["value"]),
];
const defaults = {
  rows,
  expandedRows: new Set<string>(),
  collapsedSearchRows: new Set<string>(),
};

describe("data type hierarchy", () => {
  it("starts with the children of Value, collapsed", () => {
    const tree = buildDataTypeTree(defaults);
    expect(tree.map(({ title }) => title)).toEqual(["number", "text"]);
    expect(tree[0]?.hierarchy).toEqual({
      depth: 0,
      hasChildren: true,
      expanded: false,
      matchesSearch: true,
    });
  });

  it("expands one level at a time and keeps siblings in input sort order", () => {
    const tree = buildDataTypeTree({
      ...defaults,
      expandedRows: new Set([path("number"), path("number", "length")]),
    });
    expect(tree.map(({ title }) => title)).toEqual([
      "number",
      "length",
      "metric",
      "imperial",
      "text",
    ]);
    expect(tree.map(({ hierarchy }) => hierarchy.depth)).toEqual([
      0, 1, 2, 2, 0,
    ]);
    const reversed = buildDataTypeTree({
      ...defaults,
      rows: rows.toReversed(),
      expandedRows: new Set([path("number"), path("number", "length")]),
    });
    expect(reversed.map(({ title }) => title)).toEqual([
      "text",
      "number",
      "length",
      "imperial",
      "metric",
    ]);
  });

  it("automatically reveals a deeply collapsed search match and mutes only its ancestors", () => {
    const tree = buildDataTypeTree({
      ...defaults,
      matchingIds: new Set([id("meters")]),
    });
    expect(tree.map(({ title }) => title)).toEqual([
      "number",
      "length",
      "metric",
      "meters",
    ]);
    expect(tree.map(({ hierarchy }) => hierarchy.matchesSearch)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(tree.map(({ hierarchy }) => hierarchy.expanded)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("shows matches from different branches and keeps matching ancestors in full color", () => {
    const tree = buildDataTypeTree({
      ...defaults,
      matchingIds: new Set([id("length"), id("meters"), id("feet")]),
    });
    expect(
      tree
        .filter(({ hierarchy }) => hierarchy.matchesSearch)
        .map(({ title }) => title),
    ).toEqual(["length", "meters", "feet"]);
    expect(tree.map(({ title }) => title)).not.toContain("text");
  });

  it("lets search branches collapse without changing the saved browsing expansion", () => {
    const expandedRows = new Set([path("number")]);
    const collapsedSearchRows = new Set([path("number", "length")]);
    expect(
      buildDataTypeTree({
        ...defaults,
        expandedRows,
        collapsedSearchRows,
        matchingIds: new Set([id("meters")]),
      }).map(({ title }) => title),
    ).toEqual(["number", "length"]);
    expect(
      buildDataTypeTree({ ...defaults, expandedRows, collapsedSearchRows }).map(
        ({ title }) => title,
      ),
    ).toEqual(["number", "length", "text"]);
    expect([...expandedRows]).toEqual([path("number")]);
  });

  it("returns no rows for an unmatched search", () => {
    expect(buildDataTypeTree({ ...defaults, matchingIds: new Set() })).toEqual(
      [],
    );
  });

  it("still exposes Value when it matches or is the only filtered type", () => {
    expect(
      buildDataTypeTree({
        ...defaults,
        matchingIds: new Set([id("value")]),
      }).map(({ title }) => title),
    ).toEqual(["value"]);
    expect(
      buildDataTypeTree({ ...defaults, rows: [row("value")] }).map(
        ({ title }) => title,
      ),
    ).toEqual(["value"]);
  });

  it("promotes types whose parents are excluded by filters", () => {
    expect(
      buildDataTypeTree({ ...defaults, rows: [row("meters", ["metric"])] }).map(
        ({ title }) => title,
      ),
    ).toEqual(["meters"]);
  });

  it("resolves references to older parents to the latest displayed version", () => {
    const tree = buildDataTypeTree({
      ...defaults,
      rows: [row("length", [], 3), row("meters", ["length"])],
      matchingIds: new Set([id("meters")]),
    });
    expect(tree.map(({ typeId }) => typeId)).toEqual([
      id("length", 3),
      id("meters"),
    ]);
    expect(tree[1]?.hierarchy.depth).toBe(1);
  });

  it("shows multiple inheritance under each parent with distinct row identities", () => {
    const tree = buildDataTypeTree({
      ...defaults,
      rows: [
        row("length"),
        row("distance"),
        row("meters", ["length", "distance", "length"]),
      ],
      matchingIds: new Set([id("meters")]),
    });
    expect(tree.map(({ title }) => title)).toEqual([
      "length",
      "meters",
      "distance",
      "meters",
    ]);
    expect(new Set(tree.map(({ rowId }) => rowId)).size).toBe(4);
    expect(new Set(tree.map(({ typeId }) => typeId)).size).toBe(3);
  });

  it("does not hide or loop on a cyclic component or self-reference", () => {
    const tree = buildDataTypeTree({
      ...defaults,
      rows: [
        row("number", ["length"]),
        row("length", ["number"]),
        row("text", ["text"]),
      ],
      matchingIds: new Set([id("length"), id("text")]),
    });
    expect(new Set(tree.map(({ title }) => title))).toEqual(
      new Set(["number", "length", "text"]),
    );
    expect(tree).toHaveLength(3);
  });

  it("finds a descendant beyond the first thousand catalogue entries", () => {
    const catalogue = [
      row("number"),
      ...Array.from({ length: 1500 }, (_, index) =>
        row(`unit-${index}`, ["number"]),
      ),
    ];
    const tree = buildDataTypeTree({
      ...defaults,
      rows: catalogue,
      matchingIds: new Set([id("unit-1499")]),
    });
    expect(tree.map(({ title }) => title)).toEqual(["number", "unit-1499"]);
  });
});
