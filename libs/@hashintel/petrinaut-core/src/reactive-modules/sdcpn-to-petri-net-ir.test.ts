import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "../extensions";
import { compileHirArtifacts } from "../hir/compile";
import { sdcpnToPetriNetIr } from "./sdcpn-to-petri-net-ir";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type {
  InputArc,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "../types/sdcpn";
import type { SdcpnToPetriNetIrInput } from "./sdcpn-to-petri-net-ir";

const place = (
  id: string,
  name: string,
  extra: Partial<Place> = {},
): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  ...extra,
});

const transition = (
  id: string,
  name: string,
  options: {
    inputs?: (string | [string, number] | InputArc)[];
    outputs?: (string | [string, number])[];
    lambdaType?: Transition["lambdaType"];
    lambdaCode?: string;
  } = {},
): Transition => ({
  id,
  name,
  inputArcs: (options.inputs ?? []).map((arc) =>
    typeof arc === "string"
      ? { placeId: arc, weight: 1, type: "standard" }
      : Array.isArray(arc)
        ? { placeId: arc[0], weight: arc[1], type: "standard" }
        : arc,
  ),
  outputArcs: (options.outputs ?? []).map((arc) =>
    typeof arc === "string"
      ? { placeId: arc, weight: 1 }
      : { placeId: arc[0], weight: arc[1] },
  ),
  lambdaType: options.lambdaType ?? "predicate",
  lambdaCode: options.lambdaCode ?? "return true;",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

const net = (
  places: Place[],
  transitions: Transition[],
  extra: Partial<SDCPN> = {},
): SDCPN => ({
  places,
  transitions,
  types: [],
  differentialEquations: [],
  parameters: [],
  ...extra,
});

const rateParameter: Parameter = {
  id: "rate",
  name: "Rate",
  variableName: "rate",
  type: "real",
  defaultValue: "1.5",
};

/** The lambda HIR the language worker hands the panel. */
const lambdaHirOf = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): Record<string, HirFunction | undefined> =>
  Object.fromEntries(
    Object.entries(
      compileHirArtifacts(sdcpn, extensions, { includeHir: true }).artifacts
        .lambdas,
    ).map(([id, artifact]) => [id, artifact.hir]),
  );

/** The kernel and equation HIR the language worker hands the panel. */
const codeHirOf = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): Pick<SdcpnToPetriNetIrInput, "kernelHir" | "dynamicsHir"> => {
  const { artifacts } = compileHirArtifacts(sdcpn, extensions, {
    includeHir: true,
  });
  return {
    kernelHir: Object.fromEntries(
      Object.entries(artifacts.kernels).map(([id, artifact]) => [
        id,
        artifact.hir,
      ]),
    ),
    dynamicsHir: Object.fromEntries(
      Object.entries(artifacts.dynamics).map(([id, artifact]) => [
        id,
        artifact.hir,
      ]),
    ),
  };
};

const compile = (
  sdcpn: SDCPN,
  overrides: Partial<SdcpnToPetriNetIrInput> = {},
) =>
  sdcpnToPetriNetIr({
    sdcpn,
    title: "Test net",
    initialMarking: {},
    parameterValues: {},
    lambdaHir: lambdaHirOf(sdcpn, overrides.extensions),
    ...codeHirOf(sdcpn, overrides.extensions),
    ...overrides,
  });

const cycle = net(
  [
    place("a", "Place A"),
    place("b", "place b"),
    place("c", "3rd", { capacity: 3 }),
  ],
  [
    transition("go", "Go", { inputs: ["a"], outputs: [["b", 2]] }),
    transition("back", "Back", { inputs: ["b"], outputs: ["c"] }),
  ],
  { description: " One token alternates. " },
);

describe("sdcpnToPetriNetIr", () => {
  it("lowers a plain net with the given initial marking and UpperCamelCase names", () => {
    expect(compile(cycle, { initialMarking: { a: 1 } })).toMatchObject({
      ok: true,
      warnings: [],
      ir: {
        name: "test_net",
        description: "One token alternates.",
        kind: "plain",
        places: { PlaceA: null, PlaceB: null, P3rd: { capacity: 3 } },
        marking: { PlaceA: 1 },
        transitions: {
          Go: { inputs: { PlaceA: null }, outputs: { PlaceB: { weight: 2 } } },
          Back: { inputs: { PlaceB: null }, outputs: { P3rd: null } },
        },
      },
    });
  });

  it("keeps names unique and off the names the reader reserves", () => {
    const sdcpn = net(
      [place("x", "X"), place("x2", "X"), place("m", "Module")],
      [],
    );
    const outcome = compile(sdcpn, { reservedNames: ["X", "Module"] });
    expect(outcome.ok && Object.keys(outcome.ir.places)).toEqual([
      "X2",
      "X3",
      "Module2",
    ]);
  });

  it("bakes the panel's parameter values into stochastic rates", () => {
    const sdcpn = net(
      [place("q", "Queue")],
      [
        transition("arrive", "Arrive", {
          outputs: ["q"],
          lambdaType: "stochastic",
          lambdaCode: "return parameters.rate * 2;",
        }),
        transition("wrapped", "Wrapped", {
          inputs: ["q"],
          lambdaType: "stochastic",
          lambdaCode:
            "export default Lambda((input, parameters) => parameters.rate);",
        }),
      ],
      { parameters: [rateParameter] },
    );
    const outcome = compile(sdcpn, { parameterValues: { rate: "4" } });
    expect(outcome.ok && outcome.ir).toMatchObject({
      kind: "stochastic",
      transitions: {
        Arrive: { outputs: { Queue: null }, rate: 8 },
        Wrapped: { inputs: { Queue: null }, rate: 4 },
      },
    });
    const withDefault = compile(sdcpn);
    expect(withDefault.ok && withDefault.ir.transitions.Arrive?.rate).toBe(3);
  });

  it("leaves out transitions that can never fire, with a warning", () => {
    const sdcpn = net(
      [place("a", "A"), place("b", "B")],
      [
        transition("go", "Go", { inputs: ["a"], outputs: ["b"] }),
        transition("never", "Never", {
          inputs: ["a"],
          lambdaCode: "return false;",
        }),
      ],
    );
    const outcome = compile(sdcpn);
    expect(outcome.ok && Object.keys(outcome.ir.transitions)).toEqual(["Go"]);
    expect(outcome.warnings).toEqual([
      {
        code: "dead-transition",
        message: "the predicate is false, so the transition is left out",
        item: { kind: "transition", id: "never", name: "Never" },
      },
    ]);
    const zeroRate = compile(
      net(
        [place("a", "A")],
        [
          transition("t", "T", {
            outputs: ["a"],
            lambdaType: "stochastic",
            lambdaCode: "return 0;",
          }),
        ],
      ),
    );
    expect(zeroRate.ok && zeroRate.ir.transitions).toEqual({});
    expect(zeroRate.warnings.map((warning) => warning.code)).toEqual([
      "dead-transition",
    ]);
  });

  it("treats every transition as plain when the stochasticity extension is off", () => {
    const sdcpn = net(
      [place("a", "A")],
      [
        transition("t", "T", {
          outputs: ["a"],
          lambdaType: "stochastic",
          lambdaCode: "return 2;",
        }),
      ],
    );
    const extensions = {
      ...DEFAULT_PETRINAUT_EXTENSIONS,
      stochasticity: false,
    };
    expect(compile(sdcpn, { extensions })).toMatchObject({
      ok: true,
      ir: { kind: "plain", transitions: { T: { outputs: { A: null } } } },
    });
  });

  it("reports the codes of everything the IR cannot hold", () => {
    const sdcpn = net(
      [place("c", "C")],
      [
        transition("silent", "Silent", {
          inputs: ["c"],
          lambdaType: "stochastic",
          lambdaCode: "",
        }),
        transition("infinite", "Infinite", {
          inputs: ["c"],
          lambdaType: "stochastic",
          lambdaCode: "return Infinity;",
        }),
        transition("dangling", "Dangling", { inputs: ["missing"] }),
        transition("uncompiled", "Uncompiled", {
          inputs: ["c"],
          lambdaCode: "return c;",
        }),
      ],
    );
    const outcome = compile(sdcpn, { initialMarking: { c: 1.5 } });
    expect(outcome.ok).toBe(false);
    expect(
      !outcome.ok &&
        outcome.errors.map((error) => `${error.code}@${error.item.name}`),
    ).toEqual([
      "initial-marking-invalid@C",
      "missing-rate@Silent",
      "infinite-rate@Infinite",
      "unknown-place@Dangling",
      "lambda-not-compiled@Uncompiled",
    ]);
  });

  it("carries colours, dynamics, token markings, code and arc kinds", () => {
    const drone = {
      id: "drone",
      name: "Drone",
      iconSlug: "circle",
      displayColor: "#000",
      elements: [
        { elementId: "battery", name: "battery", type: "real" as const },
        { elementId: "state", name: "state", type: "string" as const },
      ],
    };
    const sdcpn = net(
      [
        place("hangar", "Hangar", { colorId: "drone", capacity: 3 }),
        place("air", "Airborne", {
          colorId: "drone",
          dynamicsEnabled: true,
          differentialEquationId: "drain",
        }),
        place("sorties", "Sorties"),
      ],
      [
        {
          ...transition("launch", "Launch", {
            inputs: ["hangar", { placeId: "sorties", weight: 1, type: "read" }],
            outputs: ["air"],
            lambdaType: "stochastic",
            lambdaCode:
              "return parameters.rate * (input.Hangar[0].battery / 100);",
          }),
          transitionKernelCode:
            'const drone = input.Hangar[0];\nreturn { Airborne: [{ battery: drone.battery, state: "flying" }] };',
        },
        {
          ...transition("land", "Land", {
            inputs: [
              "air",
              { placeId: "sorties", weight: 5, type: "inhibitor" },
            ],
            outputs: ["hangar", "sorties"],
            lambdaCode: "return input.Airborne[0].battery < 20;",
          }),
          transitionKernelCode:
            'return { Hangar: [{ battery: 100, state: "idle" }] };',
        },
        transition("tick", "Tick", {
          inputs: ["sorties"],
          outputs: ["sorties"],
        }),
      ],
      {
        types: [drone],
        differentialEquations: [
          {
            id: "drain",
            name: "Battery drain",
            colorId: "drone",
            code: "return tokens.map((drone) => ({ battery: -parameters.rate * 4 }));",
          },
        ],
        parameters: [rateParameter],
      },
    );
    const outcome = compile(sdcpn, {
      initialMarking: {
        hangar: [
          { battery: 100, state: "idle" },
          { battery: 80, state: "idle" },
        ],
        sorties: 1,
      },
      parameterValues: { rate: "0.5" },
    });
    expect(outcome).toMatchObject({ ok: true, warnings: [] });
    if (outcome.ok) {
      expect(outcome.ir).toEqual({
        name: "test_net",
        kind: "mixed",
        colours: {
          Drone: { battery: "real", state: { enum: ["idle", "flying"] } },
        },
        dynamics: {
          BatteryDrain: {
            colour: "Drone",
            code: "return tokens.map((drone) => ({ battery: -2 }));",
          },
        },
        places: {
          Hangar: { capacity: 3, colour: "Drone" },
          Airborne: { colour: "Drone", dynamics: "BatteryDrain" },
          Sorties: null,
        },
        marking: {
          Hangar: [
            { battery: 100, state: "idle" },
            { battery: 80, state: "idle" },
          ],
          Sorties: 1,
        },
        transitions: {
          Launch: {
            inputs: { Hangar: null, Sorties: { kind: "read" } },
            outputs: { Airborne: null },
            rate: "return 0.5 * (input.Hangar[0].battery / 100);",
            kernel:
              'const drone = input.Hangar[0];\nreturn { Airborne: [{ battery: drone.battery, state: "flying" }] };',
          },
          Land: {
            inputs: {
              Airborne: null,
              Sorties: { weight: 5, kind: "inhibitor" },
            },
            outputs: { Hangar: null, Sorties: null },
            guard: "return input.Airborne[0].battery < 20;",
            kernel: 'return { Hangar: [{ battery: 100, state: "idle" }] };',
          },
          Tick: { inputs: { Sorties: null }, outputs: { Sorties: null } },
        },
      });
    }
  });

  it("marks a transition controllable when its metadata says so", () => {
    const outcome = compile(
      net(
        [place("a", "A"), place("b", "B")],
        [
          {
            ...transition("go", "Go", { inputs: ["a"], outputs: ["b"] }),
            metadata: { control: "controllable", action: "dispatch" },
          },
          {
            ...transition("back", "Back", { inputs: ["b"], outputs: ["a"] }),
            metadata: { control: "uncontrollable" },
          },
        ],
      ),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.ir.transitions).toEqual({
        Go: { inputs: { A: null }, outputs: { B: null }, controllable: true },
        Back: { inputs: { B: null }, outputs: { A: null } },
      });
    }
  });

  it("refuses an initial marking over a place's capacity", () => {
    const outcome = compile(cycle, { initialMarking: { c: 4 } });
    expect(outcome).toMatchObject({
      ok: false,
      errors: [
        {
          code: "initial-marking-over-capacity",
          message: "the initial marking is 4, over the capacity of 3",
          item: { kind: "place", name: "3rd" },
        },
      ],
    });
  });

  it("refuses an empty net and component instances", () => {
    const empty = compile(net([], []));
    expect(!empty.ok && empty.errors.map((error) => error.code)).toEqual([
      "empty-net",
    ]);
    const withInstances = compile(
      net([place("a", "A")], [], {
        subnets: [
          {
            id: "sub",
            name: "Sub",
            places: [],
            transitions: [],
            types: [],
            differentialEquations: [],
            parameters: [],
          },
        ],
        componentInstances: [
          {
            id: "inst",
            subnetId: "sub",
            name: "Inst",
            parameterValues: {},
            x: 0,
            y: 0,
          },
        ],
      }),
    );
    expect(
      !withInstances.ok && withInstances.errors.map((error) => error.code),
    ).toEqual(["component-instances"]);
  });
});
