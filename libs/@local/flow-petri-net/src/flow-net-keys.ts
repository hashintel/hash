import { stepRunIdSeparator } from "@local/hash-isomorphic-utils/flows/step-run-id";

import type {
  ActionLifecycleRole,
  TransitionRole,
} from "./flow-net-metadata.js";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/*
 * The keys a compiled flow net is built from. Every place, transition, instance, subnet, parameter and colour has a
 * readable key, and its id in the net is the Petrinaut id of that key (`toPetrinautId`). Anything that needs an
 * element's id works it out from its key, made with these functions.
 */

/** Separates the parts of a key, as in `t.startStep.<step>`. */
export const keyPartSeparator = ".";

/**
 * Separates two parts that may themselves contain {@link keyPartSeparator}: a step id from an output's name, and a
 * value from the consumer of its copy. Step ids can't contain it, as it's the step run id separator, and neither can
 * an action's input names.
 */
export const keyBoundarySeparator = stepRunIdSeparator;

const joinKey = (...parts: string[]) => parts.join(keyPartSeparator);

/*
 * Values, which places hold. A value's key is unique across the net.
 */

export const generateInputValueKey = (inputName: string) =>
  joinKey("input", inputName);

/** A step's output, whatever it's called: a for-each step's collected output can have any name. */
export const generateStepOutputKey = (stepId: string, outputName: string) =>
  `${stepId}${keyBoundarySeparator}${outputName}`;

export const generateOutputValueKey = (stepId: string, outputName: string) =>
  joinKey("output", generateStepOutputKey(stepId, outputName));

/** The value a for-each step gives the steps inside it: the item each of their runs is for. */
export const generateItemValueKey = (forEachStepId: string) =>
  joinKey("item", forEachStepId);

/*
 * Consumers, which take values. A consumer's key never contains {@link keyBoundarySeparator}.
 */

export const generateInputConsumerKey = (stepId: string, inputName: string) =>
  joinKey(stepId, inputName);

/** A for-each step taking the array it iterates over. */
export const generateArrayConsumerKey = (forEachStepId: string) =>
  joinKey(forEachStepId, "over");

/** A for-each step collecting its items' outputs. */
export const generateCollectConsumerKey = (forEachStepId: string) =>
  joinKey(forEachStepId, "collect");

/**
 * A value's copy for one consumer to take. Copies have a namespace of their own, apart from values' keys (which
 * start `input`, `output` or `item`), as a value's key can contain the separator: a flow input's name can be
 * anything. As a consumer's key can't contain the separator, the last one in a copy's key separates the value from
 * the consumer.
 */
export const generateCopyKey = (valueKey: string, consumerKey: string) =>
  joinKey("copy", `${valueKey}${keyBoundarySeparator}${consumerKey}`);

/*
 * Places of the root net.
 */

/** The place a value is shared from, with its readers (and a flow output). */
export const generateValuePlaceKey = (valueKey: string) =>
  joinKey("p", valueKey);

/** The place one consumer takes its copy of a value from. */
export const generateCopyPlaceKey = (valueKey: string, consumerKey: string) =>
  joinKey("p", generateCopyKey(valueKey, consumerKey));

/** The place holding a step's `Pending` token until it starts. */
export const generatePendingPlaceKey = (stepId: string) =>
  joinKey("p", "pending", stepId);

/** The place a step's token goes to when the step gives up, which fails its run. */
export const failedStepRunsPlaceKey = joinKey("p", "failedStepRuns");

export const generateIteratorPlaceKey = (forEachStepId: string) =>
  joinKey("p", "forEach", forEachStepId, "iterator");

export const generateAccumulatorPlaceKey = (forEachStepId: string) =>
  joinKey("p", "forEach", forEachStepId, "accumulator");

/*
 * Transitions of the root net, each keyed by its role and the step it's for.
 */

/** The roles of the root net's transitions that are each added once per step. */
export type StepTransitionRole = Exclude<
  TransitionRole,
  "copyOutput" | ActionLifecycleRole
>;

export const generateStepTransitionKey = (
  role: StepTransitionRole,
  stepId: string,
) => joinKey("t", role, stepId);

export const generateCopyOutputTransitionKey = (
  stepId: string,
  outputName: string,
) => joinKey("t", "copyOutput", generateStepOutputKey(stepId, outputName));

/*
 * Component instances.
 */

/**
 * A step's instance of its action's subnet. Instances have keys of their own, as step ids can be any string, such
 * as one that is also the key of a place.
 */
export const generateInstanceKey = (stepId: string) => joinKey("i", stepId);

/*
 * Subnets, one per action, and what's inside them.
 */

/**
 * The kinds one step of an action with derived kinds (`kindFrom`) has: the kind connected to each input a
 * `kindFrom` names.
 */
export type ResolvedKinds = Record<string, PayloadKind>;

/**
 * Identifies the subnet a step is an instance of, and prefixes the keys inside it. An action with derived kinds
 * gets a subnet per combination of resolved kinds (e.g. `filter.PersistedEntityMetadata`), so that its ports are
 * typed by them; any other action has one subnet, identified by its id.
 */
export const generateActionSubnetName = (
  actionDefinitionId: string,
  resolvedKinds: ResolvedKinds = {},
) =>
  joinKey(
    actionDefinitionId,
    ...Object.entries(resolvedKinds)
      .sort(([inputName], [otherInputName]) =>
        inputName < otherInputName ? -1 : 1,
      )
      .map(([, kind]) => kind),
  );

export const generateSubnetKey = (subnetName: string) =>
  joinKey("subnet", subnetName);

/**
 * A place or transition inside a subnet. Keys inside a subnet are prefixed with its name, because Petrinaut keys
 * some compiled artifacts (such as transition kernels) by unscoped id, so ids must be unique across every subnet
 * of a net.
 */
export const generateSubnetElementKey = (
  elementKind: "p" | "t",
  subnetName: string,
  ...parts: string[]
) => joinKey(elementKind, subnetName, ...parts);

export const generateInputPortKey = (subnetName: string, inputName: string) =>
  generateSubnetElementKey("p", subnetName, "in", inputName);

export const generateOutputPortKey = (subnetName: string, outputName: string) =>
  generateSubnetElementKey("p", subnetName, "out", outputName);

/** The port an action with no inputs is started through. */
export const generateStartPortKey = (subnetName: string) =>
  generateSubnetElementKey("p", subnetName, "in", "start");

/** The port an action with no outputs signals success through. */
export const generateDonePortKey = (subnetName: string) =>
  generateSubnetElementKey("p", subnetName, "done");

export const generateGaveUpPortKey = (subnetName: string) =>
  generateSubnetElementKey("p", subnetName, "gaveUp");

export const maxRetriesParameterKey = joinKey("param", "maxRetries");

/*
 * Colours.
 */

const arrayName = (name: string, array: boolean) =>
  array ? `${name}[]` : name;

const sortedKinds = (kinds: readonly PayloadKind[]) =>
  [...new Set(kinds)].sort();

/** The name of a colour of payload tokens, e.g. `Text[]` or `Text | WebPage`. */
export const generatePayloadColorName = (
  kinds: readonly PayloadKind[],
  array: boolean,
) => arrayName(sortedKinds(kinds).join(" | "), array);

export const generatePayloadColorKey = (kind: PayloadKind, array: boolean) =>
  joinKey("color", arrayName(kind, array));

export const generateOneOfPayloadColorKey = (
  kinds: readonly PayloadKind[],
  array: boolean,
) =>
  joinKey("color", arrayName(`oneOf(${sortedKinds(kinds).join("|")})`, array));

export const generateIteratorColorKey = (kind: PayloadKind) =>
  joinKey("color", "iterator", kind);

export const pendingColorKey = joinKey("color", "pending");
export const lifecycleColorKey = joinKey("color", "lifecycle");
export const stepFailureColorKey = joinKey("color", "stepFailure");
export const accumulatorColorKey = joinKey("color", "accumulator");
