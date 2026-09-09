import { describe, expect, it } from "vitest";

import { createRunDataBuilder, createStackedDataBuilder } from "./chart-data";

import type { StreamingStore, TimelineSeriesMeta } from "./types";

const seriesMeta = (id: string): TimelineSeriesMeta => ({
  seriesId: id,
  seriesName: id,
  color: "#000",
});

/**
 * A store, and a way to append one frame to it: a time, then one value per
 * series, as the streaming hook does.
 */
const makeStore = (seriesIds: string[]) => {
  const store: StreamingStore = {
    series: seriesIds.map(seriesMeta),
    columns: [[], ...seriesIds.map(() => [])],
    length: 0,
    revision: 0,
  };

  const append = (time: number, values: number[]) => {
    store.columns[0]!.push(time);
    values.forEach((value, index) => store.columns[index + 1]!.push(value));
    store.length = store.columns[0]!.length;
  };

  return { store, append };
};

describe("createRunDataBuilder", () => {
  it("plots each visible series from the store's own column", () => {
    const { store, append } = makeStore(["a", "b"]);
    append(0, [1, 2]);
    const build = createRunDataBuilder();

    const data = build(store, new Set());

    expect(data[0]).toBe(store.columns[0]);
    expect(data[1]).toBe(store.columns[1]);
    expect(data[2]).toBe(store.columns[2]);
  });

  it("plots a hidden series as gaps, one per frame", () => {
    const { store, append } = makeStore(["a", "b"]);
    append(0, [1, 2]);
    append(1, [3, 4]);
    const build = createRunDataBuilder();

    const data = build(store, new Set(["a"]));

    expect(data[1]).toStrictEqual([null, null]);
    expect(data[2]).toBe(store.columns[2]);
  });

  it("extends the gaps as frames arrive", () => {
    const { store, append } = makeStore(["a"]);
    append(0, [1]);
    const hidden = new Set(["a"]);
    const build = createRunDataBuilder();

    build(store, hidden);
    append(1, [2]);
    const data = build(store, hidden);

    expect(data[1]).toStrictEqual([null, null]);
  });

  it("rebuilds when the hidden set changes", () => {
    const { store, append } = makeStore(["a"]);
    append(0, [1]);
    const build = createRunDataBuilder();

    build(store, new Set(["a"]));
    const data = build(store, new Set());

    expect(data[1]).toBe(store.columns[1]);
  });
});

describe("createStackedDataBuilder", () => {
  it("stacks each series on the ones below it, topmost band first", () => {
    const { store, append } = makeStore(["a", "b", "c"]);
    append(0, [1, 2, 3]);
    const build = createStackedDataBuilder();

    const data = build(store, new Set());

    expect(data[0]).toBe(store.columns[0]);
    // c on b on a: 6, 3, 1 — reversed, because uPlot fills from the top.
    expect(data[1]).toStrictEqual([6]);
    expect(data[2]).toStrictEqual([3]);
    expect(data[3]).toStrictEqual([1]);
  });

  it("leaves a hidden series out of the sums", () => {
    const { store, append } = makeStore(["a", "b"]);
    append(0, [1, 2]);
    const build = createStackedDataBuilder();

    const data = build(store, new Set(["a"]));

    expect(data).toHaveLength(2);
    expect(data[1]).toStrictEqual([2]);
  });

  it("extends to the same sums a rebuild would produce", () => {
    const { store, append } = makeStore(["a", "b"]);
    const hidden = new Set<string>();
    const incremental = createStackedDataBuilder();

    for (const [time, values] of [
      [0, [1, 2]],
      [1, [3, 4]],
      [2, [5, 6]],
    ] as const) {
      append(time, [...values]);
      incremental(store, hidden);
    }

    const rebuilt = createStackedDataBuilder()(store, hidden);

    expect(incremental(store, hidden)).toStrictEqual(rebuilt);
    expect(rebuilt[1]).toStrictEqual([3, 7, 11]);
  });

  it("starts over when the run does", () => {
    const { store, append } = makeStore(["a"]);
    const hidden = new Set<string>();
    const build = createStackedDataBuilder();

    append(0, [5]);
    build(store, hidden);

    // A reset replaces the columns rather than emptying them.
    store.columns = [[], []];
    store.length = 0;
    append(0, [1]);

    expect(build(store, hidden)[1]).toStrictEqual([1]);
  });

  it("treats a missing value as zero", () => {
    const { store } = makeStore(["a", "b"]);
    store.columns[0]!.push(0);
    store.columns[1]!.push(2);
    // The second series has no value for this frame.
    store.length = 1;
    const build = createStackedDataBuilder();

    expect(build(store, new Set())[2]).toStrictEqual([2]);
  });
});
