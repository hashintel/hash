import { describe, expect, it } from "vitest";

import { toPetrinautId } from "../petrinaut-id";
import { checkComposition } from "./check-composition";
import { implementationsOf } from "./check-interfaces";
import { resolveImplementation } from "./interfaces";
import { resolveLibrary } from "./libraries";
import { logistics } from "./libraries.test-helpers";

import type {
  Component,
  ComponentInstance,
  ComponentReference,
  Place,
  SDCPN,
} from "../types/sdcpn";
import type { ImportStates } from "./imports";

const library = resolveLibrary(logistics.id, logistics);
const resolved: ImportStates = new Map([
  [logistics.id, { status: "resolved", library }],
]);
const libraries = new Map([[logistics.id, library]]);

const scale: ComponentReference = { from: logistics.id, id: "scale" };
const belt: ComponentReference = { from: logistics.id, id: "belt" };

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...overrides,
});

const instanceOf = (
  id: string,
  component: ComponentReference,
  implementation?: ComponentReference,
): ComponentInstance => ({
  id,
  name: id,
  ...(component.from === undefined
    ? { componentId: component.id }
    : { component: { from: component.from, id: component.id } }),
  parameterValues: {},
  ...(implementation ? { implementation } : {}),
  x: 0,
  y: 0,
});

const net = (overrides: Partial<SDCPN> = {}): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  imports: [{ id: logistics.id }],
  ...overrides,
});

/** A component of the document with the ports of `scale` and no parameter. */
const handScale: Component = {
  id: "hand-scale",
  name: "HandScale",
  places: [
    place("hand-in", { name: "In", isPort: true }),
    place("hand-out", { name: "Out", isPort: true }),
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const codes = (sdcpn: SDCPN, imports?: ImportStates) =>
  checkComposition(sdcpn, imports).map((problem) =>
    problem.kind === "import" || problem.kind === "port"
      ? problem.kind
      : problem.code,
  );

describe("checkComposition with imports", () => {
  const wired = net({
    places: [place("stock")],
    transitions: [
      {
        id: "supply",
        name: "Supply",
        inputArcs: [],
        outputArcs: [{ placeId: "stock", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 0,
        y: 0,
      },
    ],
    componentInstances: [
      instanceOf("belt-1", belt),
      instanceOf("belt-2", belt),
    ],
    fusions: [
      {
        id: "feed",
        name: "Feed",
        members: [
          { kind: "place", placeId: "stock" },
          {
            kind: "componentPort",
            componentInstanceId: "belt-1",
            portPlaceId: toPetrinautId("in"),
          },
        ],
      },
    ],
  });

  it("reports nothing on a document whose imports resolved and are wired right", () => {
    expect(checkComposition(wired, resolved)).toEqual([]);
  });

  it("reports an import that failed once, with how many instances use it, and nothing else about them", () => {
    const failed: ImportStates = new Map([
      [logistics.id, { status: "failed", message: "The registry is offline." }],
    ]);

    expect(checkComposition(wired, failed)).toEqual([
      {
        kind: "import",
        componentId: null,
        importId: logistics.id,
        severity: "error",
        message:
          "The import `@hashintel/logistics`, which 2 instances use, did not resolve. The registry is offline.",
      },
    ]);
  });

  it("reports nothing about an import that is still resolving", () => {
    const resolving: ImportStates = new Map([
      [logistics.id, { status: "resolving" }],
    ]);

    expect(checkComposition(wired, resolving)).toEqual([]);
  });

  it("reports a library the document names without importing it, once, whatever it resolved to", () => {
    const unlisted = { ...wired, imports: undefined };
    const problem = {
      kind: "import",
      importId: logistics.id,
      severity: "error",
      message:
        "The document does not import `@hashintel/logistics`, which 2 instances use.",
    };

    expect(checkComposition(unlisted)).toMatchObject([problem]);
    expect(
      checkComposition(unlisted, resolved).filter(
        ({ kind }) => kind === "import",
      ),
    ).toMatchObject([problem]);
  });

  it("counts an instance by the implementation that runs for it, its own choice or the document's default", () => {
    const failed: ImportStates = new Map([
      [logistics.id, { status: "failed", message: "The registry is offline." }],
    ]);
    const stage: Component = { ...handScale, id: "stage", interface: true };
    const messages = (sdcpn: SDCPN) =>
      checkComposition(sdcpn, failed).flatMap((problem) =>
        problem.kind === "import" ? [problem.message] : [],
      );

    expect(
      messages(
        net({
          components: [stage],
          componentInstances: [instanceOf("stage-1", { id: "stage" }, belt)],
        }),
      ),
    ).toEqual([
      "The import `@hashintel/logistics`, which 1 instance uses, did not resolve. The registry is offline.",
    ]);
    expect(
      messages(
        net({
          components: [stage],
          componentInstances: [
            instanceOf("stage-1", { id: "stage" }),
            instanceOf("stage-2", { id: "stage" }),
            instanceOf("stage-3", { id: "stage" }, { id: handScale.id }),
          ],
          implementations: [{ interface: { id: "stage" }, component: belt }],
        }),
      ),
    ).toEqual([
      "The import `@hashintel/logistics`, which 2 instances use, did not resolve. The registry is offline.",
    ]);
  });

  it("reports a library only a binding names without the document importing it", () => {
    const stage: Component = { ...handScale, id: "stage", interface: true };
    const messages = (sdcpn: SDCPN) =>
      checkComposition(sdcpn, resolved).flatMap((problem) =>
        problem.kind === "import" ? [problem.message] : [],
      );

    expect(
      messages(
        net({
          imports: undefined,
          components: [stage],
          componentInstances: [instanceOf("stage-1", { id: "stage" }, belt)],
        }),
      ),
    ).toEqual([
      "The document does not import `@hashintel/logistics`, which 1 instance uses.",
    ]);
    expect(
      messages(
        net({
          imports: undefined,
          components: [stage],
          implementations: [{ interface: { id: "stage" }, component: belt }],
        }),
      ),
    ).toEqual([
      "The document does not import `@hashintel/logistics`, which no instance uses.",
    ]);
  });

  describe("a component its library does not have", () => {
    const crane: ComponentReference = { from: logistics.id, id: "crane" };
    const stage: Component = { ...handScale, id: "stage", interface: true };
    const named = net({
      components: [
        { ...handScale, componentInstances: [instanceOf("crane-2", crane)] },
      ],
      componentInstances: [
        instanceOf("crane-1", crane),
        instanceOf("belt-1", belt),
      ],
    });

    it("is one error on each instance that names it, with the component and the library", () => {
      const problem = {
        kind: "interface",
        code: "missing-component",
        severity: "error",
      };

      expect(checkComposition(named, resolved)).toEqual([
        {
          ...problem,
          componentId: null,
          instanceId: "crane-1",
          message:
            "crane-1 names the component `crane`, which the library `@hashintel/logistics` does not have.",
        },
        {
          ...problem,
          componentId: handScale.id,
          instanceId: "crane-2",
          message:
            "crane-2 names the component `crane`, which the library `@hashintel/logistics` does not have.",
        },
      ]);
    });

    it("is not reported while its library resolves, nor beside the one error of a library that failed", () => {
      expect(
        checkComposition(
          named,
          new Map([[logistics.id, { status: "resolving" }]]),
        ),
      ).toEqual([]);
      expect(
        checkComposition(
          named,
          new Map([[logistics.id, { status: "failed", message: "Offline." }]]),
        ),
      ).toMatchObject([{ kind: "import", importId: logistics.id }]);
    });

    it("is reported as an implementation on each instance it leaves with nothing to run", () => {
      const messages = (sdcpn: SDCPN) =>
        checkComposition(sdcpn, resolved).map(({ message }) => message);

      expect(
        messages(
          net({
            components: [stage],
            componentInstances: [
              instanceOf("stage-1", { id: "stage" }, crane),
              instanceOf("scale-1", scale, crane),
            ],
          }),
        ),
      ).toEqual([
        "stage-1 names an implementation that does not exist.",
        "scale-1 names an implementation that does not exist.",
      ]);
      expect(
        messages(
          net({
            components: [stage],
            componentInstances: [instanceOf("stage-1", { id: "stage" })],
            implementations: [{ interface: { id: "stage" }, component: crane }],
          }),
        ),
      ).toEqual([
        "stage-1 chooses no implementation, and the document's default for HandScale names an implementation that does not exist.",
      ]);
    });
  });

  it("reports a port a resolved component does not have", () => {
    const sdcpn = net({
      ...wired,
      fusions: [
        {
          id: "feed",
          name: "Feed",
          members: [
            { kind: "place", placeId: "stock" },
            {
              kind: "componentPort",
              componentInstanceId: "belt-1",
              portPlaceId: toPetrinautId("spill"),
            },
          ],
        },
      ],
    });

    expect(codes(sdcpn, resolved)).toContain("unresolved-member");
  });

  it("reports an instance of an interface of an import with nothing bound", () => {
    const sdcpn = net({ componentInstances: [instanceOf("scale-1", scale)] });

    expect(codes(sdcpn, resolved)).toEqual(["unbound-instance"]);
  });

  it("takes a component of an import as the implementation an instance chooses", () => {
    const sdcpn = net({
      componentInstances: [instanceOf("scale-1", scale, belt)],
    });

    expect(checkComposition(sdcpn, resolved)).toEqual([]);
    expect(
      resolveImplementation(sdcpn, sdcpn.componentInstances![0]!, libraries),
    ).toMatchObject({ kind: "bound", implementation: { name: "Belt" } });
  });

  it("takes the document's default for an interface of an import", () => {
    const sdcpn = net({
      componentInstances: [instanceOf("scale-1", scale)],
      implementations: [{ interface: scale, component: belt }],
    });

    expect(checkComposition(sdcpn, resolved)).toEqual([]);
  });

  it("holds a component bound to an interface of an import to its ports and parameters, at the instance", () => {
    const sdcpn = net({
      components: [handScale],
      componentInstances: [instanceOf("scale-1", scale, { id: handScale.id })],
    });

    expect(checkComposition(sdcpn, resolved)).toContainEqual({
      kind: "interface",
      componentId: null,
      instanceId: "scale-1",
      code: "missing-parameter",
      severity: "error",
      message: "HandScale has no parameter rate, which Scale declares.",
    });
  });

  it("reports two defaults for one interface of an import", () => {
    const sdcpn = net({
      implementations: [
        { interface: scale, component: belt },
        { interface: scale, component: belt },
      ],
    });

    expect(codes(sdcpn, resolved)).toEqual(["duplicate-default"]);
  });

  it("does not take an interface of the document and one of an import under one id for the same", () => {
    const sdcpn = net({
      components: [{ ...handScale, id: "scale", interface: true }],
      implementations: [
        { interface: scale, component: belt },
        { interface: { id: "scale" }, component: belt },
      ],
    });

    expect(codes(sdcpn, resolved)).toEqual([]);
  });
});

describe("implementationsOf across libraries", () => {
  const fitting: Component = {
    ...handScale,
    id: "fitting",
    name: "Fitting",
    parameters: [
      {
        id: "fitting-rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "2",
      },
    ],
  };
  const names = (iface: ComponentReference, sdcpn: SDCPN) =>
    implementationsOf(sdcpn, iface, libraries).map(
      ({ reference, component }) => [
        reference.from ?? "document",
        component.name,
      ],
    );

  it("lists what has the ports and parameters of an interface of an import", () => {
    expect(names(scale, net({ components: [handScale, fitting] }))).toEqual([
      ["document", "Fitting"],
      [logistics.id, "Belt"],
    ]);
  });

  it("lists the components that say they implement an interface of the document, then the components of imports that fit it", () => {
    const iface: Component = {
      ...fitting,
      id: "stage",
      name: "Stage",
      interface: true,
    };
    const declared: Component = { ...handScale, implements: ["stage"] };

    expect(
      names({ id: "stage" }, net({ components: [iface, declared, fitting] })),
    ).toEqual([
      ["document", "HandScale"],
      [logistics.id, "Belt"],
    ]);
  });
});
