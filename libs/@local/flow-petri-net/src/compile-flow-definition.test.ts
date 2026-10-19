import { describe, expect, it } from "vitest";

import {
  canonicalizePetrinautIds,
  parseSDCPNFile,
  serializeSDCPN,
  toPetrinautId,
} from "@hashintel/petrinaut-core";
import { compilePetrinautModel } from "@hashintel/petrinaut-core/compiled-model";
import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import * as browserPluginFlows from "@local/hash-isomorphic-utils/flows/definitions/browser-plugin-flow-definitions";
import * as fileFlows from "@local/hash-isomorphic-utils/flows/definitions/file-flow-definitions";
import * as frontendFlows from "@local/hash-isomorphic-utils/flows/definitions/frontend-flow-definitions";
import { ftseInvestorsFlow } from "@local/hash-isomorphic-utils/flows/definitions/ftse-investors-flow-definition";
import * as goalFlows from "@local/hash-isomorphic-utils/flows/definitions/goal-flow-definitions";
import * as integrationFlows from "@local/hash-isomorphic-utils/flows/definitions/integration-flow-definitions";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { compileFlowDefinition } from "./compile-flow-definition.js";

import type { SDCPN } from "@hashintel/petrinaut-core";
import type {
  ActionStepDefinition,
  FlowDefinition,
  FlowDefinitionWithId,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

const isFlow = (value: unknown): value is FlowDefinitionWithId =>
  typeof value === "object" &&
  value !== null &&
  "flowDefinitionId" in value &&
  "flowDefinition" in value;

/** Every hardcoded flow's definition, found among the flow modules' exports so that new flows are covered too. */
const hardcodedFlowDefinitions = Object.entries({
  ...browserPluginFlows,
  ...fileFlows,
  ...frontendFlows,
  ...goalFlows,
  ...integrationFlows,
  ftseInvestorsFlow,
}).flatMap(([name, value]: [string, unknown]) =>
  isFlow(value) ? [[name, value.flowDefinition] as const] : [],
);

const roleOf = (transition: SDCPN["transitions"][number]) =>
  transition.metadata?.role;

/** Finds the place or transition whose id is made from `key`, e.g. `t.startStep.1`. */
const byKey =
  (key: string) =>
  ({ id }: { id: string }) =>
    id === toPetrinautId(key);

const placeEndpointOf = (key: string) =>
  ({ kind: "place", placeId: toPetrinautId(key) }) as const;

/** Every action step of a definition, including those inside `forEach` steps. */
const actionStepsOf = (
  steps: FlowDefinition["steps"],
): ActionStepDefinition[] =>
  steps.flatMap((step) =>
    step.kind === "action" ? [step] : actionStepsOf(step.steps),
  );

/** The kinds a colour's tokens may carry, from its name: `Text`, `Text[]`, or `Text | WebPage`. */
const kindsOfColorName = (name: string) =>
  name.replace(/\[\]$/, "").split(" | ") as PayloadKind[];

/** The colour of a place of the root net, or of a port of a step's instance. */
const colorAt = (
  sdcpn: SDCPN,
  endpoint:
    | { kind: "place"; placeId: string }
    | {
        kind: "componentPort";
        componentInstanceId: string;
        portPlaceId: string;
      },
) => {
  if (endpoint.kind === "place") {
    const place = sdcpn.places.find(({ id }) => id === endpoint.placeId);

    return sdcpn.types.find(({ id }) => id === place?.colorId);
  }

  const instance = sdcpn.componentInstances?.find(
    ({ id }) => id === endpoint.componentInstanceId,
  );
  const subnet = sdcpn.subnets?.find(({ id }) => id === instance?.subnetId);
  const port = subnet?.places.find(({ id }) => id === endpoint.portPlaceId);

  return subnet?.types.find(({ id }) => id === port?.colorId);
};

/** The colour of the port a step's instance takes an input through. */
const inputPortColor = (sdcpn: SDCPN, stepId: string, inputName: string) => {
  const instance = sdcpn.componentInstances?.find(byKey(stepId));
  const subnet = sdcpn.subnets?.find(({ id }) => id === instance?.subnetId);
  const port = subnet?.places.find(
    ({ isPort, name }) => isPort && name === inputName,
  );

  return subnet?.types.find(({ id }) => id === port?.colorId);
};

const portEndpointOf = (componentInstanceId: string, portKey: string) =>
  ({
    kind: "componentPort",
    componentInstanceId: toPetrinautId(componentInstanceId),
    portPlaceId: toPetrinautId(portKey),
  }) as const;

describe("compileFlowDefinition", () => {
  it("finds the hardcoded flows", () => {
    expect(hardcodedFlowDefinitions.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "goalFlow",
        "manualBrowserInferenceFlow",
        "ftseInvestorsFlow",
      ]),
    );
  });

  for (const [name, flowDefinition] of hardcodedFlowDefinitions) {
    describe(name, () => {
      it("compiles to a net Petrinaut can import and build", async () => {
        const sdcpn = await compileFlowDefinition(flowDefinition);

        const imported = parseSDCPNFile(
          JSON.parse(
            serializeSDCPN({
              petriNetDefinition: sdcpn,
              title: flowDefinition.name,
              format: "json",
            }),
          ),
        );

        expect(imported.ok).toBe(true);
        expect(() => compilePetrinautModel({ sdcpn })).not.toThrow();
      });

      it("has only Petrinaut ids, so loading it in Petrinaut leaves it as it is", async () => {
        const sdcpn = await compileFlowDefinition(flowDefinition);

        expect(canonicalizePetrinautIds(sdcpn)).toBe(sdcpn);
      });

      it("feeds each input port a value of a kind the port accepts", async () => {
        const sdcpn = await compileFlowDefinition(flowDefinition);
        const shapes = createStepShapeResolver(flowDefinition);

        for (const step of actionStepsOf(flowDefinition.steps)) {
          for (const inputName of Object.keys(step.inputs)) {
            const kind = shapes.getInputKind(step.stepId, inputName);
            const color = inputPortColor(sdcpn, step.stepId, inputName);

            expect(kind, `${step.stepId}.${inputName}`).not.toBeNull();
            expect(
              kindsOfColorName(color?.name ?? ""),
              `${step.stepId}.${inputName}`,
            ).toContain(kind);
          }
        }
      });

      it("finds each flow output at a place or port of its kind", async () => {
        const sdcpn = await compileFlowDefinition(flowDefinition);
        const shapes = createStepShapeResolver(flowDefinition);

        const flowOutputs = sdcpn.metadata?.flowOutputs as Record<
          string,
          Parameters<typeof colorAt>[1]
        >;

        for (const output of flowDefinition.outputs) {
          const shape = shapes.getStepOutputShape(
            output.stepId,
            output.outputName,
          );
          const endpoint = flowOutputs[output.name];

          expect(endpoint, output.name).toBeDefined();
          expect(colorAt(sdcpn, endpoint!)?.name, output.name).toBe(
            `${shape?.payloadKind}${shape?.array ? "[]" : ""}`,
          );
        }
      });
    });
  }

  it("compiles deterministically", async () => {
    expect(
      await compileFlowDefinition(ftseInvestorsFlow.flowDefinition),
    ).toEqual(await compileFlowDefinition(ftseInvestorsFlow.flowDefinition));
  });

  it("gives each step's instance its retry count, or the default", async () => {
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "save-files-from-urls",
          name: "Save files from URLs",
          description: "Save two files from URLs to HASH",
          inputs: { url: flowInput("Text") },
        },
        ({ inputs, step }) => {
          const retried = step("retried", actions.getFileFromUrl, {
            description: "Retrieve a file, retrying up to 5 times",
            inputs: { url: inputs.url },
            retryCount: 5,
          });
          const notRetried = step("default", actions.getFileFromUrl, {
            description: "Retrieve a file",
            inputs: { url: inputs.url },
          });

          return {
            outputs: {
              retried: retried.outputs.fileEntity,
              default: notRetried.outputs.fileEntity,
            },
          };
        },
      ).flowDefinition,
    );

    const maxRetriesOf = (stepId: string) =>
      Object.values(
        sdcpn.componentInstances?.find(byKey(stepId))?.parameterValues ?? {},
      );

    expect(maxRetriesOf("retried")).toEqual(["5"]);
    expect(maxRetriesOf("default")).toEqual(["3"]);
  });

  it("iterates over a forEach step's array and joins its items", async () => {
    const sdcpn = await compileFlowDefinition(ftseInvestorsFlow.flowDefinition);

    const forEachTransitions = sdcpn.transitions
      .filter(({ metadata }) => metadata?.stepId === "3")
      .map((transition) => [transition.id, roleOf(transition)]);

    expect(forEachTransitions).toEqual([
      [toPetrinautId("t.startForEach.3"), "startForEach"],
      [toPetrinautId("t.startItem.3"), "startItem"],
      [toPetrinautId("t.startCollecting.3"), "startCollecting"],
      [toPetrinautId("t.collectItem.3"), "collectItem"],
      [toPetrinautId("t.finishCollecting.3"), "finishCollecting"],
    ]);

    const startItem = sdcpn.transitions.find(byKey("t.startItem.3"));

    /* Each item starts both nested steps. */
    expect(startItem?.outputArcs.map(({ endpoint }) => endpoint)).toEqual([
      placeEndpointOf("p.forEach.3.iterator"),
      placeEndpointOf("p.forEach.3.item"),
      placeEndpointOf("p.pending.3.1"),
      placeEndpointOf("p.pending.3.2"),
    ]);

    /* The draft flag is read by every item, never consumed. */
    const persistInvestors = sdcpn.transitions.find(byKey("t.startStep.3.2"));

    expect(persistInvestors?.inputArcs).toContainEqual({
      endpoint: placeEndpointOf("p.input.draft"),
      weight: 1,
      type: "read",
    });
  });

  describe("routing a step's output", () => {
    /**
     * A flow whose `research` step's `proposedEntities` output goes to a `persistEntities` step per entry of
     * `accesses`, read or consumed, and optionally out of the flow.
     */
    const compileWithConsumers = (
      accesses: ("read" | "consume")[],
      { asFlowOutput = false } = {},
    ) =>
      compileFlowDefinition(
        defineFlow(
          {
            flowDefinitionId: "routing",
            name: "Routing",
            description: "One output, taken by any number of steps",
            inputs: { prompt: flowInput("Text") },
          },
          ({ inputs, step }) => {
            const research = step("research", actions.researchEntities, {
              description: "",
              inputs: { prompt: inputs.prompt },
            });

            const { proposedEntities } = research.outputs;

            for (const [index, access] of accesses.entries()) {
              step(`persist${index}`, actions.persistEntities, {
                description: "",
                inputs: {
                  proposedEntities:
                    access === "read"
                      ? proposedEntities.read()
                      : proposedEntities.consume(),
                },
              });
            }

            const outputs: Record<string, typeof proposedEntities> =
              asFlowOutput ? { proposedEntities } : {};

            return { outputs };
          },
        ).flowDefinition,
      );

    const outputPort = portEndpointOf(
      "research",
      "p.researchEntities.out.proposedEntities",
    );

    const sharedPlace = placeEndpointOf("p.output.research.proposedEntities");

    const copyPlace = (stepId: string) =>
      placeEndpointOf(
        `p.output.research.proposedEntities.to.${stepId}.proposedEntities`,
      );

    const routeInputArc = (sdcpn: SDCPN, stepId: string) =>
      sdcpn.transitions
        .find(byKey(`t.startStep.${stepId}`))
        ?.inputArcs.find(
          ({ endpoint }) =>
            endpoint?.kind !== "place" ||
            endpoint.placeId !== toPetrinautId(`p.pending.${stepId}`),
        );

    const copyTransition = (sdcpn: SDCPN) =>
      sdcpn.transitions.find(byKey("t.copyOutput.research.proposedEntities"));

    it("lets every reader read the output port, when nothing consumes it", async () => {
      const sdcpn = await compileWithConsumers(["read", "read"]);

      expect(copyTransition(sdcpn)).toBeUndefined();

      for (const stepId of ["persist0", "persist1"]) {
        expect(routeInputArc(sdcpn, stepId)).toEqual({
          endpoint: outputPort,
          weight: 1,
          type: "read",
        });
      }
    });

    it("lets a single consumer take the output from the port", async () => {
      const sdcpn = await compileWithConsumers(["consume"]);

      expect(copyTransition(sdcpn)).toBeUndefined();

      expect(routeInputArc(sdcpn, "persist0")).toEqual({
        endpoint: outputPort,
        weight: 1,
        type: "standard",
      });
    });

    it("leaves a flow output that nothing consumes in the port", async () => {
      const sdcpn = await compileWithConsumers([], { asFlowOutput: true });

      expect(copyTransition(sdcpn)).toBeUndefined();
      expect(sdcpn.metadata?.flowOutputs).toEqual({
        proposedEntities: outputPort,
      });
    });

    it("copies the output for each consumer, and into a place shared by its readers", async () => {
      const sdcpn = await compileWithConsumers(["consume", "read"]);

      const copy = copyTransition(sdcpn);

      expect(copy?.metadata).toMatchObject({
        role: "copyOutput",
        stepId: "research",
        outputName: "proposedEntities",
      });
      expect(copy?.inputArcs.map(({ endpoint }) => endpoint)).toEqual([
        outputPort,
      ]);
      expect(copy?.outputArcs.map(({ endpoint }) => endpoint)).toEqual([
        sharedPlace,
        copyPlace("persist0"),
      ]);

      expect(routeInputArc(sdcpn, "persist0")).toEqual({
        endpoint: copyPlace("persist0"),
        weight: 1,
        type: "standard",
      });
      expect(routeInputArc(sdcpn, "persist1")).toEqual({
        endpoint: sharedPlace,
        weight: 1,
        type: "read",
      });
    });

    it("copies the output for each of several consumers", async () => {
      const sdcpn = await compileWithConsumers(["consume", "consume"]);

      expect(
        copyTransition(sdcpn)?.outputArcs.map(({ endpoint }) => endpoint),
      ).toEqual([copyPlace("persist0"), copyPlace("persist1")]);
    });

    it("copies a flow output that a step consumes", async () => {
      const sdcpn = await compileWithConsumers(["consume"], {
        asFlowOutput: true,
      });

      expect(
        copyTransition(sdcpn)?.outputArcs.map(({ endpoint }) => endpoint),
      ).toEqual([sharedPlace, copyPlace("persist0")]);
      expect(sdcpn.metadata?.flowOutputs).toEqual({
        proposedEntities: sharedPlace,
      });
    });

    it("names the step in every transition added for it", async () => {
      const sdcpn = await compileWithConsumers(["consume", "read"]);

      expect(
        sdcpn.transitions
          .filter((transition) => !byKey("t.startRun")(transition))
          .map(({ id, metadata }) => [id, metadata?.stepId]),
      ).toEqual(
        (
          [
            ["t.copyOutput.research.proposedEntities", "research"],
            ["t.startStep.research", "research"],
            ["t.recordStepFailure.research", "research"],
            ["t.startStep.persist0", "persist0"],
            ["t.recordStepFailure.persist0", "persist0"],
            ["t.startStep.persist1", "persist1"],
            ["t.recordStepFailure.persist1", "persist1"],
          ] satisfies [key: string, stepId: string][]
        ).map(([key, stepId]) => [toPetrinautId(key), stepId]),
      );
    });

    /*
     * A run's marking is stored against these ids, so changing how they're made would lose track of the runs
     * of every flow.
     */
    it("gives places and transitions ids made from the step ids", async () => {
      const sdcpn = await compileWithConsumers(["consume", "read"]);

      const idsOf = (keys: string[]) => keys.map(toPetrinautId).sort();

      expect(sdcpn.places.map(({ id }) => id).sort()).toEqual(
        idsOf([
          "p.failedStepRuns",
          "p.input.prompt",
          "p.output.research.proposedEntities",
          "p.output.research.proposedEntities.to.persist0.proposedEntities",
          "p.pending.persist0",
          "p.pending.persist1",
          "p.pending.research",
          "p.runRequests",
        ]),
      );
      expect(sdcpn.transitions.map(({ id }) => id).sort()).toEqual(
        idsOf([
          "t.copyOutput.research.proposedEntities",
          "t.recordStepFailure.persist0",
          "t.recordStepFailure.persist1",
          "t.recordStepFailure.research",
          "t.startRun",
          "t.startStep.persist0",
          "t.startStep.persist1",
          "t.startStep.research",
        ]),
      );
      expect(sdcpn.componentInstances?.map(({ id }) => id)).toEqual(
        ["research", "persist0", "persist1"].map(toPetrinautId),
      );
    });
  });

  it("routes a value into every input port of a step, marking those nothing feeds absent", async () => {
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "save-file-from-url",
          name: "Save file from URL",
          description: "Save a file from a URL to HASH",
          inputs: { url: flowInput("Text") },
        },
        ({ inputs, step }) => {
          const getFile = step("1", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: { url: inputs.url },
          });

          return { outputs: { fileEntity: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );

    const startStep = sdcpn.transitions.find(byKey("t.startStep.1"));

    expect(startStep?.outputArcs.map(({ endpoint }) => endpoint)).toEqual(
      actions.getFileFromUrl.inputs.map(({ name }) =>
        portEndpointOf("1", `p.getFileFromUrl.in.${name}`),
      ),
    );

    /* Each line of the kernel produces the token for one port: `"<instance>::<port>": [{ … }]`. */
    const presentByPort: Record<string, boolean> = Object.fromEntries(
      (startStep?.transitionKernelCode ?? "")
        .split("\n")
        .flatMap((line): [string, boolean][] => {
          const match = line.match(
            /"[^"]*::(\w+)": \[\{.*present: (true|false)/,
          );

          return match?.[1] ? [[match[1], match[2] === "true"]] : [];
        }),
    );

    expect(presentByPort).toEqual({
      url: true,
      description: false,
      displayName: false,
    });
  });
});
