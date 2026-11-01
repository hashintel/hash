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
import { ftseInvestorsFlow } from "@local/hash-isomorphic-utils/flows/definitions/ftse-investors-flow-definition";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { compileFlowDefinition } from "./compile-flow-definition.js";
import {
  failedStepRunsPlaceKey,
  generateCopyOutputTransitionKey,
  generateCopyPlaceKey,
  generateInputConsumerKey,
  generateInputPortKey,
  generateInputValueKey,
  generateInstanceKey,
  generateItemValueKey,
  generateIteratorPlaceKey,
  generateOutputPortKey,
  generateOutputValueKey,
  generatePendingPlaceKey,
  generateStepTransitionKey,
  generateValuePlaceKey,
} from "./flow-net-keys.js";
import { hardcodedFlowDefinitions } from "./testing/flow-definitions.js";

import type { SDCPN } from "@hashintel/petrinaut-core";
import type {
  ActionStepDefinition,
  FlowDefinition,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

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
  const instance = sdcpn.componentInstances?.find(
    byKey(generateInstanceKey(stepId)),
  );
  const subnet = sdcpn.subnets?.find(({ id }) => id === instance?.subnetId);
  const port = subnet?.places.find(
    ({ isPort, name }) => isPort && name === inputName,
  );

  return subnet?.types.find(({ id }) => id === port?.colorId);
};

/** The ids of a net's places, transitions and instances, which must all differ. */
const idsOf = (sdcpn: SDCPN) => [
  ...sdcpn.places.map(({ id }) => id),
  ...sdcpn.transitions.map(({ id }) => id),
  ...(sdcpn.componentInstances ?? []).map(({ id }) => id),
];

const portEndpointOf = (componentInstanceId: string, portKey: string) =>
  ({
    kind: "componentPort",
    componentInstanceId: toPetrinautId(
      generateInstanceKey(componentInstanceId),
    ),
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

        const ids = idsOf(sdcpn);
        expect(new Set(ids).size).toBe(ids.length);

        /* Kernels address places by name. */
        const placeNames = sdcpn.places.map((place) => place.name);
        expect(new Set(placeNames).size).toBe(placeNames.length);
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

  it("gives every place, transition and instance a distinct id, whatever the step ids", async () => {
    /* A step id can be any string without the step run id separator, including the key of a place. */
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "step-named-like-a-place",
          name: "Step named like a place",
          description:
            "A step whose id is the key of the failed step runs place",
          inputs: { url: flowInput("Text") },
        },
        ({ inputs, step }) => {
          const getFile = step(failedStepRunsPlaceKey, actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: { url: inputs.url },
          });

          return { outputs: { fileEntity: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );

    const ids = idsOf(sdcpn);

    expect(new Set(ids).size).toBe(ids.length);
    expect(() => compilePetrinautModel({ sdcpn })).not.toThrow();
  });

  it("keeps a step's output apart from a nested step's, whichever their names", async () => {
    /* Step `a` collects `b.fileEntity`, and the step inside it is `a.b`, whose output is `fileEntity`. */
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "dotted-names",
          name: "Dotted names",
          description:
            "A collected output and a nested step's output that join to the same dotted name",
          inputs: { urls: flowInput("Text", { array: true }) },
        },
        ({ inputs, forEach }) => {
          const files = forEach("a", inputs.urls, {
            description: "Retrieve each file",
            collectAs: "b.fileEntity",
            steps: (url, scope) =>
              scope.step("a.b", actions.getFileFromUrl, {
                description: "Retrieve the file",
                inputs: { url },
              }).outputs.fileEntity,
          });

          return { outputs: { files } };
        },
      ).flowDefinition,
    );

    const ids = idsOf(sdcpn);
    expect(new Set(ids).size).toBe(ids.length);

    const placeNames = sdcpn.places.map((place) => place.name);
    expect(new Set(placeNames).size).toBe(placeNames.length);

    const collected = placeEndpointOf(
      generateValuePlaceKey(generateOutputValueKey("a", "b.fileEntity")),
    );

    expect(
      sdcpn.transitions.find(
        byKey(generateStepTransitionKey("finishCollecting", "a")),
      )?.outputArcs,
    ).toContainEqual({ endpoint: collected, weight: 1 });
    expect(
      (sdcpn.metadata?.flowOutputs as Record<string, unknown>).files,
    ).toEqual(collected);
  });

  it("says where a run's flow inputs and first Pending tokens go", async () => {
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "run-start",
          name: "Run start",
          description:
            "An input two steps consume and one reads, and a forEach",
          inputs: {
            url: flowInput("Text"),
            urls: flowInput("Text", { array: true }),
          },
        },
        ({ inputs, step, forEach }) => {
          for (const stepId of ["a", "b"]) {
            step(stepId, actions.getFileFromUrl, {
              description: "Retrieve the file",
              inputs: { url: inputs.url.consume() },
            });
          }
          const read = step("c", actions.getFileFromUrl, {
            description: "Retrieve the file again",
            inputs: { url: inputs.url },
          });
          const files = forEach("each", inputs.urls, {
            description: "Retrieve each file",
            collectAs: "files",
            steps: (url, scope) =>
              scope.step("inner", actions.getFileFromUrl, {
                description: "Retrieve the file",
                inputs: { url },
              }).outputs.fileEntity,
          });

          return { outputs: { file: read.outputs.fileEntity, files } };
        },
      ).flowDefinition,
    );

    expect(sdcpn.metadata?.flowInputs).toEqual({
      url: [
        placeEndpointOf(generateValuePlaceKey(generateInputValueKey("url"))),
        placeEndpointOf(
          generateCopyPlaceKey(
            generateInputValueKey("url"),
            generateInputConsumerKey("a", "url"),
          ),
        ),
        placeEndpointOf(
          generateCopyPlaceKey(
            generateInputValueKey("url"),
            generateInputConsumerKey("b", "url"),
          ),
        ),
      ],
      urls: [
        placeEndpointOf(generateValuePlaceKey(generateInputValueKey("urls"))),
      ],
    });
    /* Only the top-level steps: a step inside a forEach gets its Pending token when an item starts. */
    expect(sdcpn.metadata?.pendingAtStart).toEqual(
      ["a", "b", "c", "each"].map((stepId) =>
        placeEndpointOf(generatePendingPlaceKey(stepId)),
      ),
    );
  });

  it("keeps a copy apart from a value whose key it would otherwise share", async () => {
    /* Step `a` consumes `url`, whose copy for `a.url` must not be the input named `url~a.url`. */
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "copy-named-like-an-input",
          name: "Copy named like an input",
          description: "An input whose name is that of another input's copy",
          inputs: {
            url: flowInput("Text"),
            "url~a.url": flowInput("Text"),
          },
        },
        ({ inputs, step }) => {
          const getFile = step("a", actions.getFileFromUrl, {
            description: "Retrieve the file",
            inputs: {
              url: inputs.url.consume(),
              description: inputs["url~a.url"],
            },
          });

          return { outputs: { fileEntity: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );

    const ids = idsOf(sdcpn);
    expect(new Set(ids).size).toBe(ids.length);

    const placeNames = sdcpn.places.map((place) => place.name);
    expect(new Set(placeNames).size).toBe(placeNames.length);

    expect(() => compilePetrinautModel({ sdcpn })).not.toThrow();
  });

  it("builds a flow whose inputs share a label", async () => {
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "inputs-sharing-a-label",
          name: "Inputs sharing a label",
          description: "Two inputs labelled the same",
          inputs: {
            sourceUrl: flowInput("Text", { label: "URL" }),
            backupUrl: flowInput("Text", { label: "URL" }),
          },
        },
        ({ inputs, step }) => {
          const getFile = step("1", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: { url: inputs.sourceUrl, description: inputs.backupUrl },
          });

          return { outputs: { fileEntity: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );

    expect(() => compilePetrinautModel({ sdcpn })).not.toThrow();
  });

  it("records which value each input of a step takes", async () => {
    const compileWithInputsSwapped = (swapped: boolean) =>
      compileFlowDefinition(
        defineFlow(
          {
            flowDefinitionId: "two-text-inputs",
            name: "Two text inputs",
            description: "Two values of one kind, connected either way round",
            inputs: { a: flowInput("Text"), b: flowInput("Text") },
          },
          ({ inputs, step }) => {
            const getFile = step("1", actions.getFileFromUrl, {
              description: "Retrieve the file from the URL",
              inputs: swapped
                ? { url: inputs.b, description: inputs.a }
                : { url: inputs.a, description: inputs.b },
            });

            return { outputs: { fileEntity: getFile.outputs.fileEntity } };
          },
        ).flowDefinition,
      );

    const inputSourcesOf = async (swapped: boolean) =>
      (await compileWithInputsSwapped(swapped)).transitions.find(
        byKey(generateStepTransitionKey("startStep", "1")),
      )?.metadata?.inputSources;

    expect(await inputSourcesOf(false)).toEqual({
      url: {
        kind: "value",
        from: placeEndpointOf(
          generateValuePlaceKey(generateInputValueKey("a")),
        ),
        access: "read",
      },
      description: {
        kind: "value",
        from: placeEndpointOf(
          generateValuePlaceKey(generateInputValueKey("b")),
        ),
        access: "read",
      },
      displayName: { kind: "absent" },
    });
    expect(await inputSourcesOf(true)).toMatchObject({
      url: {
        from: placeEndpointOf(
          generateValuePlaceKey(generateInputValueKey("b")),
        ),
      },
      description: {
        from: placeEndpointOf(
          generateValuePlaceKey(generateInputValueKey("a")),
        ),
      },
    });
  });

  it("gives each step inside a forEach that consumes the item a copy of its own", async () => {
    const sdcpn = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "item-consumed-twice",
          name: "Item consumed twice",
          description: "Two steps inside a forEach both consume its item",
          inputs: { urls: flowInput("Text", { array: true }) },
        },
        ({ inputs, forEach }) => {
          const files = forEach("each", inputs.urls, {
            description: "Retrieve each file twice",
            collectAs: "files",
            steps: (url, scope) => {
              const first = scope.step("a", actions.getFileFromUrl, {
                description: "Retrieve the file",
                inputs: { url: url.consume() },
              });
              scope.step("b", actions.getFileFromUrl, {
                description: "Retrieve the file again",
                inputs: { url: url.consume() },
              });

              return first.outputs.fileEntity;
            },
          });

          return { outputs: { files } };
        },
      ).flowDefinition,
    );

    const copyFor = (stepId: string) =>
      placeEndpointOf(
        generateCopyPlaceKey(
          generateItemValueKey("each"),
          generateInputConsumerKey(stepId, "url"),
        ),
      );

    expect(
      sdcpn.transitions
        .find(byKey(generateStepTransitionKey("startItem", "each")))
        ?.outputArcs.map(({ endpoint }) => endpoint),
    ).toEqual(expect.arrayContaining([copyFor("a"), copyFor("b")]));

    for (const stepId of ["a", "b"]) {
      expect(
        sdcpn.transitions.find(
          byKey(generateStepTransitionKey("startStep", stepId)),
        )?.inputArcs,
      ).toContainEqual({
        endpoint: copyFor(stepId),
        weight: 1,
        type: "standard",
      });
    }

    expect(() => compilePetrinautModel({ sdcpn })).not.toThrow();
  });

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
        sdcpn.componentInstances?.find(byKey(generateInstanceKey(stepId)))
          ?.parameterValues ?? {},
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
      [
        toPetrinautId(generateStepTransitionKey("startForEach", "3")),
        "startForEach",
      ],
      [toPetrinautId(generateStepTransitionKey("startItem", "3")), "startItem"],
      [
        toPetrinautId(generateStepTransitionKey("startCollecting", "3")),
        "startCollecting",
      ],
      [
        toPetrinautId(generateStepTransitionKey("collectItem", "3")),
        "collectItem",
      ],
      [
        toPetrinautId(generateStepTransitionKey("finishCollecting", "3")),
        "finishCollecting",
      ],
    ]);

    const startItem = sdcpn.transitions.find(
      byKey(generateStepTransitionKey("startItem", "3")),
    );

    /* Each item starts both nested steps. */
    expect(startItem?.outputArcs.map(({ endpoint }) => endpoint)).toEqual([
      placeEndpointOf(generateIteratorPlaceKey("3")),
      placeEndpointOf(generateValuePlaceKey(generateItemValueKey("3"))),
      placeEndpointOf(generatePendingPlaceKey("3.1")),
      placeEndpointOf(generatePendingPlaceKey("3.2")),
    ]);

    /* The draft flag is read by every item, never consumed. */
    const persistInvestors = sdcpn.transitions.find(
      byKey(generateStepTransitionKey("startStep", "3.2")),
    );

    expect(persistInvestors?.inputArcs).toContainEqual({
      endpoint: placeEndpointOf(
        generateValuePlaceKey(generateInputValueKey("draft")),
      ),
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
      generateOutputPortKey("researchEntities", "proposedEntities"),
    );

    const sharedPlace = placeEndpointOf(
      generateValuePlaceKey(
        generateOutputValueKey("research", "proposedEntities"),
      ),
    );

    const copyPlace = (stepId: string) =>
      placeEndpointOf(
        generateCopyPlaceKey(
          generateOutputValueKey("research", "proposedEntities"),
          generateInputConsumerKey(stepId, "proposedEntities"),
        ),
      );

    const routeInputArc = (sdcpn: SDCPN, stepId: string) =>
      sdcpn.transitions
        .find(byKey(generateStepTransitionKey("startStep", stepId)))
        ?.inputArcs.find(
          ({ endpoint }) =>
            endpoint?.kind !== "place" ||
            endpoint.placeId !== toPetrinautId(generatePendingPlaceKey(stepId)),
        );

    const copyTransition = (sdcpn: SDCPN) =>
      sdcpn.transitions.find(
        byKey(generateCopyOutputTransitionKey("research", "proposedEntities")),
      );

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
        sdcpn.transitions.map(({ id, metadata }) => [id, metadata?.stepId]),
      ).toEqual(
        (
          [
            [
              generateCopyOutputTransitionKey("research", "proposedEntities"),
              "research",
            ],
            [generateStepTransitionKey("startStep", "research"), "research"],
            [
              generateStepTransitionKey("recordStepFailure", "research"),
              "research",
            ],
            [generateStepTransitionKey("startStep", "persist0"), "persist0"],
            [
              generateStepTransitionKey("recordStepFailure", "persist0"),
              "persist0",
            ],
            [generateStepTransitionKey("startStep", "persist1"), "persist1"],
            [
              generateStepTransitionKey("recordStepFailure", "persist1"),
              "persist1",
            ],
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

      const idsOfKeys = (keys: string[]) => keys.map(toPetrinautId).sort();

      expect(sdcpn.places.map(({ id }) => id).sort()).toEqual(
        idsOfKeys([
          failedStepRunsPlaceKey,
          generateValuePlaceKey(generateInputValueKey("prompt")),
          generateValuePlaceKey(
            generateOutputValueKey("research", "proposedEntities"),
          ),
          generateCopyPlaceKey(
            generateOutputValueKey("research", "proposedEntities"),
            generateInputConsumerKey("persist0", "proposedEntities"),
          ),
          generatePendingPlaceKey("persist0"),
          generatePendingPlaceKey("persist1"),
          generatePendingPlaceKey("research"),
        ]),
      );
      expect(sdcpn.transitions.map(({ id }) => id).sort()).toEqual(
        idsOfKeys([
          generateCopyOutputTransitionKey("research", "proposedEntities"),
          generateStepTransitionKey("recordStepFailure", "persist0"),
          generateStepTransitionKey("recordStepFailure", "persist1"),
          generateStepTransitionKey("recordStepFailure", "research"),
          generateStepTransitionKey("startStep", "persist0"),
          generateStepTransitionKey("startStep", "persist1"),
          generateStepTransitionKey("startStep", "research"),
        ]),
      );
      expect(sdcpn.componentInstances?.map(({ id }) => id)).toEqual(
        ["research", "persist0", "persist1"].map((stepId) =>
          toPetrinautId(generateInstanceKey(stepId)),
        ),
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

    const startStep = sdcpn.transitions.find(
      byKey(generateStepTransitionKey("startStep", "1")),
    );

    expect(startStep?.outputArcs.map(({ endpoint }) => endpoint)).toEqual(
      actions.getFileFromUrl.inputs.map(({ name }) =>
        portEndpointOf("1", generateInputPortKey("getFileFromUrl", name)),
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
