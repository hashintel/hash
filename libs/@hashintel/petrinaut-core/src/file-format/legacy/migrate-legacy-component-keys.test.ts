import { describe, expect, it } from "vitest";

import { toPetrinautId } from "../../document/petrinaut-id";
import { createJsonDocHandle } from "../../handle/json-doc-handle/create-json-doc-handle";
import { parseSDCPNDocument } from "../parse-sdcpn-file";
import { normalizeSDCPN } from "../sdcpn-input";
import { serializeSDCPN } from "../serialize-sdcpn";
import { migrateLegacyComponentKeys } from "./migrate-legacy-component-keys";

import type { SDCPNInput } from "../sdcpn-input";

const port = {
  id: "in",
  name: "In",
  colorId: null,
  dynamicsEnabled: false,
  isPort: true,
  x: 0,
  y: 0,
};

const emptyNet = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const instance = (id: string, naming: object) => ({
  id,
  name: id,
  parameterValues: {},
  x: 0,
  y: 0,
  ...naming,
});

/** A document as the editor stored one before the rename: a line of two stages. */
const storedBefore = {
  ...emptyNet,
  subnets: [
    { ...emptyNet, id: "stage", name: "Stage", places: [port] },
    {
      ...emptyNet,
      id: "line",
      name: "Line",
      componentInstances: [
        instance("First", { subnetId: "stage" }),
        instance("Second", { subnetId: "stage" }),
      ],
    },
  ],
  componentInstances: [
    instance("Main", { subnetId: "line" }),
    instance("Belt", {
      component: { from: "@hashintel/logistics", id: "belt" },
    }),
  ],
};

const fileBefore = `
version: 1
title: Line
subnets:
  - id: stage
    name: Stage
    places:
      - { id: in, name: In, isPort: true }
    transitions: []
  - id: line
    name: Line
    places: []
    transitions: []
    componentInstances:
      - { id: first, name: First, subnetId: stage }
places: []
componentInstances:
  - { id: main, name: Main, subnetId: line }
transitions: []
`;

describe("migrateLegacyComponentKeys", () => {
  it("lists the document's `subnets` as its components", () => {
    const migrated = migrateLegacyComponentKeys(storedBefore);

    expect(migrated).not.toHaveProperty("subnets");
    expect(migrated).toMatchObject({
      components: [{ id: "stage" }, { id: "line" }],
    });
  });

  it("names an instance's component by reference, in the root net and inside a component", () => {
    const migrated = migrateLegacyComponentKeys(storedBefore) as unknown as {
      components: { componentInstances?: object[] }[];
      componentInstances: object[];
    };

    expect(migrated.componentInstances).toEqual([
      instance("Main", { component: { id: "line" } }),
      instance("Belt", {
        component: { from: "@hashintel/logistics", id: "belt" },
      }),
    ]);
    expect(migrated.components[1]?.componentInstances).toEqual([
      instance("First", { component: { id: "stage" } }),
      instance("Second", { component: { id: "stage" } }),
    ]);
  });

  it("returns a current document itself", () => {
    const current = migrateLegacyComponentKeys(storedBefore);

    expect(migrateLegacyComponentKeys(current)).toBe(current);
    for (const other of [null, "text", [], { places: [] }]) {
      expect(migrateLegacyComponentKeys(other)).toBe(other);
    }
  });

  it("reads a file written with `subnets` and `subnetId`, and writes it back with neither", () => {
    const parsed = parseSDCPNDocument(fileBefore);

    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) {
      return;
    }
    const [stage, line] = parsed.sdcpn.components ?? [];
    expect([stage?.id, line?.id]).toEqual([
      toPetrinautId("stage"),
      toPetrinautId("line"),
    ]);
    expect(line?.componentInstances?.[0]?.component).toEqual({
      id: toPetrinautId("stage"),
    });
    expect(parsed.sdcpn.componentInstances?.[0]?.component).toEqual({
      id: toPetrinautId("line"),
    });

    const { title, ...petriNetDefinition } = parsed.sdcpn;
    const written = serializeSDCPN({ petriNetDefinition, title });
    expect(written).toContain("\ncomponents:\n");
    expect(written).not.toMatch(/subnet/i);
    expect(parseSDCPNDocument(written)).toMatchObject({ sdcpn: parsed.sdcpn });
  });

  it("reads a document held in memory, through `normalizeSDCPN` and through a handle", () => {
    const normalized = normalizeSDCPN(storedBefore as unknown as SDCPNInput);

    expect(normalized).not.toHaveProperty("subnets");
    expect(normalized.components?.map(({ id }) => id)).toEqual([
      toPetrinautId("stage"),
      toPetrinautId("line"),
    ]);
    expect(
      normalized.componentInstances?.map(({ component }) => component),
    ).toEqual([
      { id: toPetrinautId("line") },
      { from: "@hashintel/logistics", id: "belt" },
    ]);
    expect(
      normalized.components?.[1]?.componentInstances?.map(
        ({ component }) => component,
      ),
    ).toEqual([{ id: toPetrinautId("stage") }, { id: toPetrinautId("stage") }]);

    const handle = createJsonDocHandle({
      initial: storedBefore as unknown as SDCPNInput,
    });
    expect(handle.doc()).toEqual(normalized);
  });
});
