import {
  BpmnElement,
  Connection,
  elementType,
  ElementTypeName,
  isConnection,
  isEnter,
  isGateway,
  isRoot,
  isSource,
} from "../../types/bpmnElements";
import { ProcessParameters } from "../../types/properties";
import { getPropertyValue } from "../getPropertyValue";
import { propertyDefinitions } from "./propertyDefinitions";

type ProcessModelAgent = {
  agent_name: string;
  behaviors: string[];
  max_resources?: { [key: string]: number };
  process_labels: string[];
  process_parameters: {
    [key: string]: ProcessParameters;
  };
  position: [0, 0, 0];
};

const definesNextBlock = (type: ElementTypeName) =>
  type !== "sink" && type !== "select_output";

const elementBehavior = (type: ElementTypeName) => `@hash/process/${type}.js`;

export const behaviorVersion = (behavior: string) =>
  behavior === "@hash/age/age.rs" ? "1.0.0" : "4.1.0";

export const commaSeparatedListToNumberArray = (value: string) => {
  const values = (value ?? "")?.replace(/ /g, "").split(",");
  const array = [];
  for (const value of values) {
    if (!isNaN(parseFloat(value))) {
      array.push(parseFloat(value));
    }
  }
  return !!array.length ? array : undefined;
};

export const filterInvalidConnections = (
  element: BpmnElement,
  _: number,
  elements: BpmnElement[],
) => {
  if (isConnection(element)) {
    const { sourceRef, targetRef } = element.businessObject;
    const connections = elements.filter(
      (el) =>
        el.type !== "label" &&
        [sourceRef.name, targetRef.name].includes(el.businessObject.name),
    );
    if (connections.length !== 2) {
      return false;
    }
  }
  return true;
};

/**
 * Takes elements in a flow chart and generates agent JSON.
 * Assumes the elements have been put through validateChart first
 */
export const elementsToProcessAgent = (
  elements: BpmnElement[],
): ProcessModelAgent => {
  let json: ProcessModelAgent = {
    agent_name: "process_model",
    behaviors: ["@hash/age/age.rs"],
    process_labels: [""],
    process_parameters: {},
    position: [0, 0, 0],
  };
  const startingBlocks = elements.filter(
    (element) => isSource(element) || isEnter(element),
  );

  const filteredElements = elements.filter(filterInvalidConnections);

  const connectionCount: { [blockName: string]: number } = {};

  for (const starter of startingBlocks) {
    let next: BpmnElement | undefined = starter;
    while (next) {
      if (next.incoming.length > 1) {
        // multiple incoming connections means many branches join here.
        // track how many have arrived, and let the last one take up the path.
        const name = getPropertyValue(next, "name");
        connectionCount[name] = (connectionCount[name] ?? 0) + 1;
        if (connectionCount[name] < next.incoming.length) {
          break;
        }
      }
      ({ json, next } = registerElementInJson(next, filteredElements, json));
    }
  }

  const root = elements.find((element) => isRoot(element));
  const resources = root && getPropertyValue(root, "process_resources");
  if (resources) {
    const resourcesParsed = JSON.parse(resources);
    Object.assign(json, resourcesParsed);
    json.process_parameters.max_resources = resourcesParsed;
    json.behaviors.push("@hash/process/resource_data.js");
    json.process_labels.push("");
  }

  return json;
};

const onwardElementsNames = (element: BpmnElement) =>
  element.outgoing.map((connection) => onwardElementName(connection));

const onwardElementName = (connection: Connection) =>
  connection.businessObject.targetRef.name;

const registerElementInJson = (
  currentElement: BpmnElement,
  elements: BpmnElement[],
  json: ProcessModelAgent,
): {
  json: ProcessModelAgent;
  next?: BpmnElement;
} => {
  let next;
  const type = elementType(currentElement);
  if (!type) {
    throw new Error(
      `Unrecognised type ${currentElement.businessObject.name} in flow`,
    );
  }
  const { name, parameters, behavior } = elementProperties(currentElement!);

  if (json.process_labels.includes(name)) {
    // We've reached a node that's already been connected
    // i.e. this branch has rejoined another
    return { json };
  }

  // What onward nodes are connected to from this one?
  const connected = elements.filter(
    (el) =>
      el.type !== "label" &&
      onwardElementsNames(currentElement).includes(el.businessObject.name),
  );

  if (connected[0] && definesNextBlock(type)) {
    // We need to add next_block for those blocks that can specify it
    (parameters as any).next_block = connected[0].businessObject.name;
    next = connected[0];
  }
  json.behaviors.push(behavior);
  json.process_labels.push(name);
  json.process_parameters[name] = parameters;

  if (connected[1]) {
    // We have a gateway - need to exhaust both paths
    if (!isGateway(currentElement)) {
      throw new Error("Non-gateway block has 2+ connections");
    }
    const truePathName = getPropertyValue(currentElement, "true_block");
    const falsePathName = getPropertyValue(currentElement, "false_block");

    // exhaust the true path first
    let truePathEl = connected.find((el) =>
      truePathName
        ? el.businessObject.name === truePathName
        : el.businessObject.name !== falsePathName,
    );
    while (truePathEl) {
      if (truePathEl.incoming.length > 1) {
        // two incoming connections which means the false path rejoins here.
        // we stop to avoid racing ahead - the false path will pick it up.
        break;
      }
      ({ json, next: truePathEl } = registerElementInJson(
        truePathEl,
        elements,
        json,
      ));
    }

    let falsePathEl = elements.find(
      (el) => el.businessObject.name === falsePathName,
    );
    while (falsePathEl) {
      ({ json, next: falsePathEl } = registerElementInJson(
        falsePathEl,
        elements,
        json,
      ));
    }
  }

  return {
    json,
    next,
  };
};

const elementProperties = (
  element: BpmnElement,
): {
  behavior: string;
  name: string;
  parameters: ProcessParameters;
} => {
  const type = elementType(element);
  if (!type) {
    throw new Error("Unreecognised element type");
  }

  const name = element.businessObject.name!;
  const behavior =
    type === "custom"
      ? getPropertyValue(element, "behavior")
      : elementBehavior(type);

  /** @todo fix typing */
  const parameters = propertyDefinitions(element)!.properties.reduce(
    (propObject: any, { toArray, name, float, type }) => {
      if (name === "name" || name === "behavior") {
        return propObject;
      }
      let value = getPropertyValue(element, name);
      if (type === "number") {
        if (isNaN(parseFloat(value))) {
          value = undefined;
        } else {
          value = float ? parseFloat(value) : parseInt(value, 10);
        }
      }
      if (type === "string" && toArray) {
        value = commaSeparatedListToNumberArray(value);
      }
      if (
        (type === "string" || type === "code") &&
        !toArray &&
        !value?.trim()
      ) {
        value = undefined;
      }
      if (type === "object") {
        value = JSON.parse(value);
      }
      if (type === "boolean") {
        value = value === "true" || value === true ? true : false;
      }
      propObject[name] = value;
      return propObject;
    },
    {},
  );

  return {
    behavior,
    name,
    parameters,
  };
};
