import { describe, expect, it } from "vitest";

import { toPetrinautId } from "../petrinaut-id";
import { parseSDCPNDocument, parseSDCPNFile } from "./parse-sdcpn-file";
import { serializeSDCPN } from "./serialize-sdcpn";

const sourceDocument = {
  version: 1,
  meta: { generator: "Petrinaut" },
  title: "Test Net",
  description: "A test net",
  metadata: { source: "test" },
  places: [
    {
      id: "p1",
      name: "Place 1",
      colorId: null,
      dynamicsEnabled: false,
      x: 100,
      y: 200,
    },
  ],
  transitions: [
    {
      id: "t1",
      name: "Transition 1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "true",
      transitionKernelCode: "const tokens = input.p1;\nreturn { p1: tokens };",
      x: 300,
      y: 200,
    },
  ],
  components: [
    {
      id: "component1",
      name: "Component 1",
      description: "A component",
      metadata: { origin: "test" },
      places: [
        {
          id: "port1",
          name: "Port 1",
          colorId: null,
          dynamicsEnabled: false,
          isPort: true,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    },
    {
      id: "component2",
      name: "Component 2",
      places: [
        {
          id: "inner1",
          name: "Inner 1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      componentInstances: [
        {
          id: "nested1",
          name: "Nested 1",
          component: { id: "component1" },
          x: 0,
          y: 0,
        },
      ],
      fusions: [
        {
          id: "fusion2",
          name: "Fusion 2",
          members: [
            { kind: "place", placeId: "inner1" },
            {
              kind: "componentPort",
              componentInstanceId: "nested1",
              portPlaceId: "port1",
            },
          ],
        },
      ],
    },
  ],
  componentInstances: [
    {
      id: "instance1",
      name: "Instance 1",
      component: { id: "component1" },
      x: 0,
      y: 0,
    },
  ],
  fusions: [
    {
      id: "fusion1",
      name: "Fusion 1",
      members: [
        { kind: "place", placeId: "p1" },
        {
          kind: "componentPort",
          componentInstanceId: "instance1",
          portPlaceId: "port1",
        },
      ],
    },
  ],
};

const parseFixture = () => {
  const parsed = parseSDCPNFile(sourceDocument);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.sdcpn;
};

describe("serializeSDCPN", () => {
  it("serializes to YAML by default and round-trips through parseSDCPNDocument", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
    });

    expect(text).toContain("version: 1");
    expect(text).toContain("transitionKernelCode: |-");
    expect(() => JSON.parse(text) as unknown).toThrow();

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.sdcpn).toEqual(sdcpn);
    expect(reimported.hadMissingPositions).toBe(false);
  });

  it("serializes to JSON on request and round-trips through parseSDCPNDocument", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      format: "json",
    });

    expect(JSON.parse(text)).toMatchObject({ version: 1, title: "Test Net" });

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.sdcpn).toEqual(sdcpn);
  });

  it("round-trips a visual-info-free YAML export, flagging missing positions", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      removeVisualInfo: true,
    });

    expect(text).not.toMatch(/^\s*'?x'?:/m);
    expect(text).not.toMatch(/^\s*'?y'?:/m);

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.hadMissingPositions).toBe(true);
  });

  it("writes format metadata first, then the sections in dependency order", () => {
    const sdcpn = parseFixture();

    const yamlText = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
    });
    expect(yamlText.startsWith("version: 1\n")).toBe(true);

    const jsonText = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      format: "json",
    });
    const document = JSON.parse(jsonText) as Record<
      string,
      Record<string, unknown>[]
    >;
    expect(Object.keys(document)).toEqual([
      "version",
      "meta",
      "title",
      "description",
      "metadata",
      "parameters",
      "types",
      "differentialEquations",
      "components",
      "places",
      "componentInstances",
      "fusions",
      "transitions",
      "metrics",
      "scenarios",
    ]);
    expect(Object.keys(document.components![0]!)).toEqual([
      "id",
      "name",
      "description",
      "metadata",
      "parameters",
      "types",
      "differentialEquations",
      "places",
      "componentInstances",
      "transitions",
    ]);
    expect(Object.keys(document.components![1]!)).toEqual([
      "id",
      "name",
      "parameters",
      "types",
      "differentialEquations",
      "places",
      "componentInstances",
      "fusions",
      "transitions",
    ]);
  });

  it("writes no `fusions` key for a net that has none", () => {
    const { fusions: _fusions, ...withoutFusions } = sourceDocument;
    const parsed = parseSDCPNFile(withoutFusions);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.sdcpn).not.toHaveProperty("fusions");

    const text = serializeSDCPN({
      petriNetDefinition: parsed.sdcpn,
      title: "Test Net",
      format: "json",
    });
    expect(JSON.parse(text)).not.toHaveProperty("fusions");
  });

  it("reads a fusion that carries a key this build does not know", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      fusions: sourceDocument.fusions.map((fusion) => ({
        ...fusion,
        addedLater: true,
      })),
    });

    expect(parsed.ok).toBe(true);
  });

  it("refuses a fusion without a name", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      fusions: sourceDocument.fusions.map(
        ({ name: _name, ...unnamed }) => unnamed,
      ),
    });

    expect(parsed).toEqual({
      ok: false,
      error:
        "Invalid SDCPN file: fusions.0.name: Invalid input: expected string, received undefined",
    });
  });

  it("reads a fusion the editor would refuse, for the checks to report", () => {
    const [first] = sourceDocument.fusions;
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      fusions: [{ ...first!, members: first!.members.slice(0, 1) }],
    });

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.sdcpn.fusions?.[0]?.members).toHaveLength(1);
  });

  it("reads `interface: false` as a component that is no interface", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      components: sourceDocument.components.map((component) => ({
        ...component,
        interface: false,
      })),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sdcpn.components?.[0]).not.toHaveProperty("interface");
  });

  it("writes an interface flag, an implements list and the document's bindings in their places", () => {
    const sdcpn = parseFixture();
    const iface = sdcpn.components![0]!;

    const text = serializeSDCPN({
      petriNetDefinition: {
        ...sdcpn,
        components: [
          { ...iface, interface: true },
          { ...iface, id: "fast", name: "Fast", implements: [iface.id] },
        ],
        implementations: [
          { interface: { id: iface.id }, component: { id: "fast" } },
        ],
      },
      title: "Test Net",
      format: "json",
    });
    const document = JSON.parse(text) as {
      implementations: unknown;
      components: Record<string, unknown>[];
    };

    const keys = Object.keys(document);
    expect(keys.indexOf("implementations")).toBe(
      keys.indexOf("components") + 1,
    );
    expect(document.implementations).toEqual([
      { interface: { id: iface.id }, component: { id: "fast" } },
    ]);
    expect(Object.keys(document.components[0]!).slice(0, 5)).toEqual([
      "id",
      "name",
      "description",
      "metadata",
      "interface",
    ]);
    expect(Object.keys(document.components[1]!).slice(0, 5)).toEqual([
      "id",
      "name",
      "description",
      "metadata",
      "implements",
    ]);
  });

  it("reads the document's bindings and an instance's choice as references, converting their ids", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      implementations: [
        { interface: { id: "stage" }, component: { id: "fast-stage" } },
      ],
      componentInstances: [
        {
          id: "drill",
          name: "Drill",
          component: { id: "stage" },
          implementation: { id: "slow-stage" },
        },
      ],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sdcpn.implementations).toEqual([
      {
        interface: { id: toPetrinautId("stage") },
        component: { id: toPetrinautId("fast-stage") },
      },
    ]);
    expect(parsed.sdcpn.componentInstances?.[0]?.implementation).toEqual({
      id: toPetrinautId("slow-stage"),
    });
  });

  it("refuses bindings keyed by interface id, and an instance's choice given as a bare id", () => {
    const keyed = parseSDCPNFile({
      ...sourceDocument,
      implementations: { stage: "fast-stage" },
    });
    expect(keyed.ok).toBe(false);
    if (!keyed.ok) {
      expect(keyed.error).toContain("implementations");
    }

    const bare = parseSDCPNFile({
      ...sourceDocument,
      componentInstances: [
        {
          id: "drill",
          name: "Drill",
          component: { id: "stage" },
          implementation: "slow-stage",
        },
      ],
    });
    expect(bare.ok).toBe(false);
    if (!bare.ok) {
      expect(bare.error).toContain("implementation");
    }
  });

  it("refuses an instance's choice given as null: an update clears a choice that way, a file holds none", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      componentInstances: [
        {
          id: "drill",
          name: "Drill",
          component: { id: "stage" },
          implementation: null,
        },
      ],
    });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("implementation");
    }
  });

  it("writes imports before the components, and reads them back with what names their components as written", () => {
    const sdcpn = parseFixture();
    const scale = { from: "@hashintel/logistics", id: "scale" };
    const importing = {
      ...sdcpn,
      imports: [{ id: "@hashintel/logistics" }],
      componentInstances: [
        {
          id: toPetrinautId("scale-1"),
          name: "ScaleA",
          component: scale,
          parameterValues: {},
          implementation: { from: "@hashintel/logistics", id: "belt" },
          x: 0,
          y: 0,
        },
      ],
      implementations: [{ interface: scale, component: scale }],
    };

    const text = serializeSDCPN({
      petriNetDefinition: importing,
      title: "Test Net",
      format: "json",
    });
    const keys = Object.keys(JSON.parse(text) as object);
    const parsed = parseSDCPNDocument(text);

    expect(keys.indexOf("imports")).toBe(keys.indexOf("components") - 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sdcpn.imports).toEqual(importing.imports);
    expect(parsed.sdcpn.componentInstances).toEqual(
      importing.componentInstances,
    );
    expect(parsed.sdcpn.implementations).toEqual(importing.implementations);
  });

  it("reads a port of a component of an import as a document reads any id", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      imports: [{ id: "@hashintel/logistics" }],
      componentInstances: [
        {
          id: "scale-1",
          name: "ScaleA",
          component: { from: "@hashintel/logistics", id: "scale" },
        },
      ],
      fusions: [
        {
          id: "feed",
          name: "Feed",
          members: [
            { kind: "place", placeId: "p1" },
            {
              kind: "componentPort",
              componentInstanceId: "scale-1",
              portPlaceId: "in",
            },
          ],
        },
      ],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sdcpn.fusions?.[0]?.members[1]).toMatchObject({
      portPlaceId: toPetrinautId("in"),
    });
  });

  it("refuses an instance that names no component", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      componentInstances: [{ id: "drill", name: "Drill" }],
    });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("componentInstances.0.component");
    }
  });

  it("writes a component's colour and icon last, and leaves them out without visual info", () => {
    const sdcpn = parseFixture();
    const iconSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const styled = {
      ...sdcpn,
      components: [
        { ...sdcpn.components![0]!, iconSvg, displayColor: "#3b82f6" },
      ],
    };

    const text = serializeSDCPN({
      petriNetDefinition: styled,
      title: "Test Net",
      format: "json",
    });
    const document = JSON.parse(text) as {
      components: Record<string, unknown>[];
    };
    expect(Object.keys(document.components[0]!).slice(-2)).toEqual([
      "displayColor",
      "iconSvg",
    ]);

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.sdcpn.components?.[0]).toMatchObject({
      iconSvg,
      displayColor: "#3b82f6",
    });

    const bare = serializeSDCPN({
      petriNetDefinition: styled,
      title: "Test Net",
      removeVisualInfo: true,
    });
    expect(bare).not.toContain("iconSvg");
    expect(bare).not.toContain("displayColor");
  });

  it("refuses a file whose component icon holds anything but shapes, naming the element", () => {
    const [component] = sourceDocument.components;
    const withIcon = (iconSvg: string) =>
      parseSDCPNFile({
        ...sourceDocument,
        components: [{ ...component, iconSvg }],
      });

    expect(withIcon('<svg viewBox="0 0 8 8"><rect/></svg>').ok).toBe(true);

    const refused = withIcon(
      '<svg viewBox="0 0 8 8"><g id="a"/><use href="#a"/></svg>',
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toContain("`use`");
    }
    expect(withIcon("<svg><title>Stage</title><rect/></svg>").ok).toBe(false);
  });

  it("rejects text that is neither YAML nor JSON via parseSDCPNDocument", () => {
    const result = parseSDCPNDocument("places: [");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid SDCPN file");
    }
  });
});
