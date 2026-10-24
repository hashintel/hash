import { describe, expect, test } from "vitest";

import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";

import type { Place, SDCPN } from "./types/sdcpn";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const place = (id: string): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

describe("createPetrinaut", () => {
  test("follows the handle again after dispose, so a remounted host sees later writes", () => {
    const handle = createJsonDocHandle({ initial: emptySDCPN });
    const instance = createPetrinaut({ document: handle, readonly: true });
    const seen: string[][] = [];
    const patchBatches: number[] = [];

    const stop = instance.definition.subscribe((net) =>
      seen.push(net.places.map(({ name }) => name)),
    );
    handle.change((draft) => {
      draft.places.push(place("first"));
    });
    stop();
    instance.dispose();

    instance.definition.subscribe((net) =>
      seen.push(net.places.map(({ name }) => name)),
    );
    instance.patches.subscribe((patches) => patchBatches.push(patches.length));
    handle.change((draft) => {
      draft.places.push(place("second"));
    });

    expect(seen).toEqual([["first"], ["first", "second"]]);
    expect(instance.definition.get().places.map(({ name }) => name)).toEqual([
      "first",
      "second",
    ]);
    expect(patchBatches.length).toBe(1);
  });

  test("releases the handle once its last subscriber leaves, and dispose is safe to repeat", () => {
    const handle = createJsonDocHandle({ initial: emptySDCPN });
    const instance = createPetrinaut({ document: handle });
    const seen: number[] = [];

    const stop = instance.definition.subscribe((net) =>
      seen.push(net.places.length),
    );
    stop();
    handle.change((draft) => {
      draft.places.push(place("unseen"));
    });
    instance.dispose();
    instance.dispose();

    expect(seen).toEqual([]);
    expect(instance.definition.get().places.length).toBe(1);
  });
});
