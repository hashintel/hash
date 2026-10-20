import { stepRunIdSeparator } from "@local/hash-isomorphic-utils/flows/step-run-id";

import { outputPortId } from "./action-subnet-ids.js";
import { getActionDefinition } from "./flow-steps.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
  portEndpoint,
} from "./net-elements.js";
import { generateInstanceKey } from "./step-places.js";

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
export type Consumer = { key: string; label: string; consumes: boolean };

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

export const inputValueKey = (inputId: string) => `input.${inputId}`;

/**
 * The key of a step's output. Step ids can't contain the separator, so it tells the step from the output whatever
 * the output is called: a for-each step's collected output can have any name.
 */
export const generateStepOutputKey = (stepId: string, outputName: string) =>
  `${stepId}${stepRunIdSeparator}${outputName}`;

export const outputValueKey = (stepId: string, outputName: string) =>
  `output.${generateStepOutputKey(stepId, outputName)}`;

/**
 * The key of a value's copy for one consumer to take. A consumer's key, a step id and an action's input name,
 * can't contain the separator, so the last one in a copy's key separates the value from the consumer.
 */
export const generateCopyKey = (valueKey: string, consumerKey: string) =>
  `${valueKey}${stepRunIdSeparator}${consumerKey}`;

/** The value a for-each step gives the steps inside it: the item each of their runs is for. */
export const itemValueKey = (forEachStepId: string) => `item.${forEachStepId}`;

export const sourceValueKey = (source: StepInputSource): string | null => {
  switch (source.kind) {
    case "flow-input":
      return inputValueKey(source.inputName);
    case "step-output":
      return outputValueKey(source.stepId, source.outputName);
    case "item":
    case "constant":
      return null;
  }
};

/** The item value of the for-each step a step is directly inside. */
export const itemValueKeyIn = (scope: string[]) => {
  const forEachStepId = scope.at(-1);

  if (forEachStepId === undefined) {
    throw new Error("Only a step inside a for-each step can use its item");
  }

  return itemValueKey(forEachStepId);
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
      key: inputValueKey(input.name),
      label: input.name,
      shape: input,
      producer: { kind: "placed" },
    });
  }

  for (const { step } of steps.entries) {
    if (step.kind === "for-each") {
      addValue({
        key: outputValueKey(step.stepId, step.collect.as),
        label: `${step.stepId}.${step.collect.as}`,
        shape: steps.getOutputShape(step.stepId, step.collect.as),
        producer: { kind: "placed" },
      });
      addValue({
        key: itemValueKey(step.stepId),
        label: `Item: ${step.stepId}`,
        shape: { ...steps.getForEachArrayShape(step), array: false },
        producer: { kind: "placed" },
      });
    } else {
      const subnetKey = steps.getSubnetKey(step);

      for (const output of getActionDefinition(step).outputs) {
        addValue({
          key: outputValueKey(step.stepId, output.name),
          label: `${step.stepId}.${output.name}`,
          shape: steps.getOutputShape(step.stepId, output.name),
          producer: {
            kind: "port",
            stepId: step.stepId,
            outputName: output.name,
            portId: outputPortId(subnetKey, output.name),
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

  /* Register every consumer, so that each value's places can be decided before any arcs are made. */
  for (const { step, scope } of steps.entries) {
    if (step.kind === "action") {
      for (const [inputName, source] of Object.entries(step.inputs)) {
        const key =
          source.kind === "item"
            ? itemValueKeyIn(scope)
            : sourceValueKey(source);

        if (key) {
          getValue(key).consumers.push({
            key: `${step.stepId}.${inputName}`,
            label: `${step.stepId}.${inputName}`,
            consumes: consumes(source),
          });
        }
      }
    } else {
      const overKey = sourceValueKey(step.over);

      if (overKey) {
        getValue(overKey).consumers.push({
          key: `${step.stepId}.over`,
          label: `${step.stepId} (for each)`,
          consumes: consumes(step.over),
        });
      }

      getValue(
        outputValueKey(step.collect.stepId, step.collect.outputName),
      ).consumers.push({
        key: `${step.stepId}.collect`,
        label: `${step.stepId} (collect)`,
        consumes: true,
      });
    }
  }

  for (const output of flowDefinition.outputs) {
    getValue(outputValueKey(output.stepId, output.outputName)).isFlowOutput =
      true;
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
              id: `p.${value.key}`,
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
            id: `p.${generateCopyKey(value.key, consumer.key)}`,
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
          id: `t.copyOutput.${generateStepOutputKey(stepId, outputName)}`,
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

  return {
    /** Arcs from a root transition that produces a value, putting it into every place it's taken from. */
    valueOutputArcs: (key: string): OutputArc[] =>
      getValueLocation(key).producedInto.map(outputArc),

    /** The arc a consumer takes a value through. */
    valueInputArc: (key: string, consumer: Consumer) => {
      const { shared, taken } = getValueLocation(key);

      if (consumer.consumes) {
        const endpoint = taken.get(consumer.key);

        if (!endpoint) {
          throw new Error(`Value "${key}" has no copy for ${consumer.label}`);
        }

        return inputArc(endpoint, "standard");
      }

      if (!shared) {
        throw new Error(`Value "${key}" has no place for ${consumer.label}`);
      }

      return inputArc(shared, "read");
    },

    /**
     * Where each flow input is put when a run starts: the place shared by its readers, and a copy for each step
     * that consumes it.
     */
    flowInputEndpoints: Object.fromEntries(
      flowDefinition.inputs.map((input) => [
        input.name,
        getValueLocation(inputValueKey(input.name)).producedInto,
      ]),
    ),

    /** Where each flow output is found: a place of the root net, or an output port of a step's instance. */
    flowOutputEndpoints: Object.fromEntries(
      flowDefinition.outputs.map((output) => {
        const { shared } = getValueLocation(
          outputValueKey(output.stepId, output.outputName),
        );

        if (!shared) {
          throw new Error(`Flow output "${output.name}" has no place`);
        }

        return [output.name, shared];
      }),
    ),
  };
};
