import {
  generateArrayConsumerKey,
  generateCollectConsumerKey,
  generateCopyKey,
  generateCopyOutputTransitionKey,
  generateCopyPlaceKey,
  generateInputConsumerKey,
  generateInputValueKey,
  generateInstanceKey,
  generateItemValueKey,
  generateOutputPortKey,
  generateOutputValueKey,
  generateValuePlaceKey,
} from "../../flow-net-keys.js";
import { getActionDefinition } from "./flow-steps.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
  portEndpoint,
} from "./net-elements.js";

import type { FlowSteps, ValueShape } from "./flow-steps.js";
import type { NetBuilder } from "./net-builder.js";
import type { ArcEndpoint, OutputArc } from "@hashintel/petrinaut-core";
import type {
  FlowDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * Something that takes a value: a step's input, a for-each step's array, or a for-each step collecting its
 * items' outputs (which always consumes).
 */
type Consumer = { key: string; label: string; consumes: boolean };

type Value = {
  /** e.g. `input.prompt`, or `output.1~proposedEntities` */
  key: string;
  /** For descriptions: the value's place is named by its key, as kernels address places by name. */
  label: string;
  shape: ValueShape;
  /**
   * Where the value first appears: an action step's output port, or the places it's put in directly, by the
   * executor when a run starts (a flow input) or by a for-each step's transitions (its item, and its collected
   * output).
   */
  producer:
    | { kind: "port"; stepId: string; outputName: string; portId: string }
    | { kind: "placed" };
  consumers: Consumer[];
  isFlowOutput: boolean;
};

/**
 * Where a value is held: where its readers (and a flow output) find it, where each consumer that consumes it
 * takes it from, and, for a value a transition of the root net produces, the places that transition puts it
 * in.
 */
type ValueLocation = {
  shared: ArcEndpoint | null;
  /** Consumer key → where that consumer takes the value from. */
  taken: Map<string, ArcEndpoint>;
  producedInto: ArcEndpoint[];
};

const sourceValueKey = (source: StepInputSource): string | null => {
  switch (source.kind) {
    case "flow-input":
      return generateInputValueKey(source.inputName);
    case "step-output":
      return generateOutputValueKey(source.stepId, source.outputName);
    case "item":
    case "constant":
      return null;
  }
};

/** The item value of the for-each step a step is directly inside. */
const itemValueKeyIn = (scope: string[]) => {
  const forEachStepId = scope.at(-1);

  if (forEachStepId === undefined) {
    throw new Error("Only a step inside a for-each step can use its item");
  }

  return generateItemValueKey(forEachStepId);
};

export const consumes = (source: StepInputSource) =>
  source.kind !== "constant" && source.access === "consume";

/**
 * The arcs to and from the places every value is held in.
 */
export type ValuePlaces = ReturnType<typeof placeValues>;

/**
 * Adds the places every flow input and step output is held in, and the transitions that copy a step's output
 * where more than one consumer needs it.
 *
 * A transition is only added where one token has to become several. An action step's output stays in its
 * port, where its readers read it, unless something consumes it: a single consumer with no readers takes it
 * from the port, and otherwise a `copyOutput` transition puts it in a place shared by the readers and in a copy for
 * each consumer, so consumers never race for a token. A value a root transition produces goes straight into
 * those places.
 */
export const placeValues = ({
  flowDefinition,
  steps,
  net,
}: {
  flowDefinition: FlowDefinition;
  steps: FlowSteps;
  net: NetBuilder;
}) => {
  const values = new Map<string, Value>();

  const addValue = (value: Omit<Value, "consumers" | "isFlowOutput">) => {
    values.set(value.key, { ...value, consumers: [], isFlowOutput: false });
  };

  for (const input of flowDefinition.inputs) {
    addValue({
      key: generateInputValueKey(input.name),
      label: input.name,
      shape: input,
      producer: { kind: "placed" },
    });
  }

  for (const { step } of steps.entries) {
    if (step.kind === "for-each") {
      addValue({
        key: generateOutputValueKey(step.stepId, step.collect.as),
        label: `${step.stepId}.${step.collect.as}`,
        shape: steps.getOutputShape(step.stepId, step.collect.as),
        producer: { kind: "placed" },
      });
      addValue({
        key: generateItemValueKey(step.stepId),
        label: `Item: ${step.stepId}`,
        shape: { ...steps.getForEachArrayShape(step), array: false },
        producer: { kind: "placed" },
      });
    } else {
      const subnetName = steps.getSubnetName(step);

      for (const output of getActionDefinition(step).outputs) {
        addValue({
          key: generateOutputValueKey(step.stepId, output.name),
          label: `${step.stepId}.${output.name}`,
          shape: steps.getOutputShape(step.stepId, output.name),
          producer: {
            kind: "port",
            stepId: step.stepId,
            outputName: output.name,
            portId: generateOutputPortKey(subnetName, output.name),
          },
        });
      }
    }
  }

  const getValue = (key: string): Value => {
    const value = values.get(key);

    if (!value) {
      throw new Error(`There is no value "${key}"`);
    }

    return value;
  };

  /* Consumer key → the value it takes, and how. */
  const consumersByKey = new Map<
    string,
    { valueKey: string; consumer: Consumer }
  >();

  const addConsumer = (valueKey: string, consumer: Consumer) => {
    getValue(valueKey).consumers.push(consumer);
    consumersByKey.set(consumer.key, { valueKey, consumer });
  };

  /* Register every consumer, so that each value's places can be decided before any arcs are made. */
  for (const { step, scope } of steps.entries) {
    if (step.kind === "action") {
      for (const [inputName, source] of Object.entries(step.inputs)) {
        const valueKey =
          source.kind === "item"
            ? itemValueKeyIn(scope)
            : sourceValueKey(source);

        if (valueKey) {
          addConsumer(valueKey, {
            key: generateInputConsumerKey(step.stepId, inputName),
            label: `${step.stepId}.${inputName}`,
            consumes: consumes(source),
          });
        }
      }
    } else {
      const arrayKey = sourceValueKey(step.over);

      if (arrayKey) {
        addConsumer(arrayKey, {
          key: generateArrayConsumerKey(step.stepId),
          label: `${step.stepId} (for each)`,
          consumes: consumes(step.over),
        });
      }

      addConsumer(
        generateOutputValueKey(step.collect.stepId, step.collect.outputName),
        {
          key: generateCollectConsumerKey(step.stepId),
          label: `${step.stepId} (collect)`,
          consumes: true,
        },
      );
    }
  }

  for (const output of flowDefinition.outputs) {
    getValue(
      generateOutputValueKey(output.stepId, output.outputName),
    ).isFlowOutput = true;
  }

  const valueLocations = new Map<string, ValueLocation>();

  for (const value of values.values()) {
    const colorId = net.registerPayloadColor(value.shape);
    const takers = value.consumers.filter(({ consumes: taken }) => taken);
    const isShared =
      value.isFlowOutput || takers.length < value.consumers.length;

    if (value.producer.kind === "port") {
      const port = portEndpoint(
        generateInstanceKey(value.producer.stepId),
        value.producer.portId,
      );

      if (takers.length === 0) {
        valueLocations.set(value.key, {
          shared: port,
          taken: new Map(),
          producedInto: [],
        });
        continue;
      }

      const [onlyTaker] = takers;

      if (onlyTaker && takers.length === 1 && !isShared) {
        valueLocations.set(value.key, {
          shared: null,
          taken: new Map([[onlyTaker.key, port]]),
          producedInto: [],
        });
        continue;
      }
    }

    const shared =
      isShared || value.consumers.length === 0
        ? placeEndpoint(
            net.addPlace({
              id: generateValuePlaceKey(value.key),
              name: value.key,
              description: value.isFlowOutput
                ? `${value.label}, an output of the flow.`
                : `${value.label}, available to every step that reads it.`,
              colorId,
            }),
          )
        : null;

    const taken = new Map(
      takers.map((consumer) => [
        consumer.key,
        placeEndpoint(
          net.addPlace({
            id: generateCopyPlaceKey(value.key, consumer.key),
            name: generateCopyKey(value.key, consumer.key),
            description: `${value.label}, for ${consumer.label} to consume.`,
            colorId,
          }),
        ),
      ]),
    );

    const producedInto = [
      ...(shared === null ? [] : [shared]),
      ...taken.values(),
    ];

    if (value.producer.kind === "port") {
      const { stepId, outputName, portId } = value.producer;

      net.addTransitions(
        createTransition({
          id: generateCopyOutputTransitionKey(stepId, outputName),
          name: `Copy ${value.label}`,
          description: `Puts the ${outputName} output of step ${stepId} where each step that reads or consumes it takes it from.`,
          role: "copyOutput",
          metadata: { stepId, outputName },
          inputArcs: [
            inputArc(portEndpoint(generateInstanceKey(stepId), portId)),
          ],
          outputArcs: producedInto.map(outputArc),
        }),
      );

      valueLocations.set(value.key, { shared, taken, producedInto: [] });
    } else {
      valueLocations.set(value.key, { shared, taken, producedInto });
    }
  }

  const getValueLocation = (key: string): ValueLocation => {
    const location = valueLocations.get(key);

    if (!location) {
      throw new Error(`Value "${key}" has no location`);
    }

    return location;
  };

  /** Arcs from a root transition that produces a value, putting it into every place it's taken from. */
  const valueOutputArcs = (valueKey: string): OutputArc[] =>
    getValueLocation(valueKey).producedInto.map(outputArc);

  /** The arc a consumer takes its value through, if it takes one: a constant isn't a value. */
  const consumerInputArc = (consumerKey: string) => {
    const registered = consumersByKey.get(consumerKey);

    if (!registered) {
      return null;
    }

    const { valueKey, consumer } = registered;
    const { shared, taken } = getValueLocation(valueKey);

    if (consumer.consumes) {
      const endpoint = taken.get(consumer.key);

      if (!endpoint) {
        throw new Error(
          `Value "${valueKey}" has no copy for ${consumer.label}`,
        );
      }

      return inputArc(endpoint, "standard");
    }

    if (!shared) {
      throw new Error(`Value "${valueKey}" has no place for ${consumer.label}`);
    }

    return inputArc(shared, "read");
  };

  return {
    /** The arc a step's input takes its connected value through, or `null` for a constant. */
    stepInputArc: (stepId: string, inputName: string) =>
      consumerInputArc(generateInputConsumerKey(stepId, inputName)),

    /** The arc a for-each step takes the array it iterates over through, or `null` for a constant. */
    forEachArrayArc: (forEachStepId: string) =>
      consumerInputArc(generateArrayConsumerKey(forEachStepId)),

    /** The arc a for-each step collects each item's output through. */
    collectArc: (forEachStepId: string) => {
      const arc = consumerInputArc(generateCollectConsumerKey(forEachStepId));

      if (!arc) {
        throw new Error(`For-each step "${forEachStepId}" collects nothing`);
      }

      return arc;
    },

    /** Arcs putting a for-each step's item where each step inside it takes it from. */
    itemOutputArcs: (forEachStepId: string) =>
      valueOutputArcs(generateItemValueKey(forEachStepId)),

    /** Arcs putting a for-each step's collected output where each of its consumers takes it from. */
    collectedOutputArcs: (forEachStepId: string, outputName: string) =>
      valueOutputArcs(generateOutputValueKey(forEachStepId, outputName)),

    /**
     * Where each flow input is put when a run starts: the place shared by its readers, and a copy for each step
     * that consumes it.
     */
    flowInputEndpoints: Object.fromEntries(
      flowDefinition.inputs.map((input) => [
        input.name,
        getValueLocation(generateInputValueKey(input.name)).producedInto,
      ]),
    ),

    /** Where each flow output is found: a place of the root net, or an output port of a step's instance. */
    flowOutputEndpoints: Object.fromEntries(
      flowDefinition.outputs.map((output) => {
        const { shared } = getValueLocation(
          generateOutputValueKey(output.stepId, output.outputName),
        );

        if (!shared) {
          throw new Error(`Flow output "${output.name}" has no place`);
        }

        return [output.name, shared];
      }),
    ),
  };
};
