import { beforeEach, describe, expect, it, vi } from "vitest";

import { printPetrinautDsl, type SDCPN } from "@hashintel/petrinaut-core";
import { assemblyLine } from "@hashintel/petrinaut-core/examples";

import { deriveNet, emptyNet } from "./derive-net";

const text = printPetrinautDsl({
  sdcpn: assemblyLine.petriNetDefinition,
  title: "Line",
}).text;

/** A layout that puts a scope's nodes in a row, with a mark of its own. */
const rowLayout = vi.fn((net: SDCPN) =>
  Promise.resolve(
    Object.fromEntries(
      [
        ...net.places,
        ...net.transitions,
        ...(net.componentInstances ?? []),
      ].map((node, index) => [node.id, { x: index * 100, y: 7 }]),
    ),
  ),
);

beforeEach(() => {
  rowLayout.mockClear();
});

describe("deriveNet", () => {
  it("builds the net from the text, laying out every scope on the first pass", async () => {
    const derived = await deriveNet(emptyNet, text, { layout: rowLayout });

    expect(derived.title).toBe("Line");
    expect(derived.diagnostics).toEqual([]);
    expect(derived.net!.places.map(({ name }) => name)).toEqual([
      "Buffer",
      "Finished",
    ]);
    expect(derived.net!.subnets!.map(({ name }) => name)).toEqual([
      "Source",
      "Stage",
    ]);
    // The root and both components have nodes the empty net did not.
    expect(rowLayout).toHaveBeenCalledTimes(3);
    expect(derived.net!.componentInstances!.map(({ y }) => y)).toEqual([
      7, 7, 7,
    ]);
    expect(derived.net!.subnets![1]!.transitions[0]).toMatchObject({
      name: "Process",
      y: 7,
    });
  });

  it("keeps ids and positions through an edit and lays out only the scope with a new node", async () => {
    const first = (await deriveNet(emptyNet, text, { layout: rowLayout })).net!;
    rowLayout.mockClear();

    const second = await deriveNet(
      first,
      text.replace("place Finished\n", "place Finished\nplace Rejects\n"),
      { layout: rowLayout },
    );

    expect(rowLayout).toHaveBeenCalledTimes(1);
    expect(second.net!.places.map(({ id }) => id).slice(0, 2)).toEqual(
      first.places.map(({ id }) => id),
    );
    expect(second.net!.places[2]).toMatchObject({ name: "Rejects", y: 7 });
    expect(second.net!.subnets).toEqual(first.subnets);
    expect(second.net!.componentInstances!.map(({ id }) => id)).toEqual(
      first.componentInstances!.map(({ id }) => id),
    );
  });

  it("gives no net while the text has an error, with the diagnostics", async () => {
    const broken = await deriveNet(emptyNet, `${text}place\n`, {
      layout: rowLayout,
    });
    const dangling = await deriveNet(
      emptyNet,
      `${text}fuse Buffer, Nobody.In\n`,
      {
        layout: rowLayout,
      },
    );

    expect(broken.net).toBeNull();
    expect(broken.diagnostics.map(({ message }) => message)).toEqual([
      expect.stringMatching(/Expected a place name/u),
    ]);
    expect(dangling.net).toBeNull();
    expect(dangling.diagnostics.map(({ message }) => message)).toEqual([
      'Unknown instance "Nobody"',
    ]);
    expect(rowLayout).not.toHaveBeenCalled();
  });
});
