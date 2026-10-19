import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The kinds one step of an action with derived kinds (`kindFrom`) has: the kind connected to each input
 * a `kindFrom` names.
 */
export type ResolvedKinds = Record<string, PayloadKind>;

/**
 * The key of the subnet a step is an instance of. An action with derived kinds gets a subnet per
 * combination of resolved kinds (e.g. `filter.PersistedEntityMetadata`), so that its ports are typed by them;
 * any other action has one subnet, keyed by its id.
 */
export const actionSubnetKey = (
  actionDefinitionId: string,
  resolvedKinds: ResolvedKinds = {},
) =>
  [
    actionDefinitionId,
    ...Object.keys(resolvedKinds)
      .sort()
      .map((inputName) => resolvedKinds[inputName]),
  ].join(".");

export const actionSubnetId = (subnetKey: string) => `subnet.${subnetKey}`;

/*
 * Ids inside a subnet are prefixed with its key (see `actionSubnetKey`), because Petrinaut keys some compiled artifacts (such
 * as transition kernels) by unscoped id, so ids must be unique across every subnet of a net.
 */

export const subnetItemId = (
  kind: "p" | "t",
  subnetKey: string,
  name: string,
) => `${kind}.${subnetKey}.${name}`;

export const inputPortId = (subnetKey: string, inputName: string) =>
  subnetItemId("p", subnetKey, `in.${inputName}`);

export const outputPortId = (subnetKey: string, outputName: string) =>
  subnetItemId("p", subnetKey, `out.${outputName}`);

export const gaveUpPortId = (subnetKey: string) =>
  subnetItemId("p", subnetKey, "gaveUp");

/**
 * The port an action with no outputs signals success through.
 */
export const donePortId = (subnetKey: string) =>
  subnetItemId("p", subnetKey, "done");

/**
 * The port an action with no inputs is started through.
 */
export const startPortId = (subnetKey: string) =>
  subnetItemId("p", subnetKey, "in.start");

export const maxRetriesParameterId = "param.maxRetries";

export const defaultMaxRetries = 3;
