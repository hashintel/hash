import {
  BpmnElement,
  elementType,
  isEnter,
  isExit,
  isSeize,
  isService,
  isSink,
  isSource,
} from "../../types/bpmnElements";
import { getPropertyValue } from "../getPropertyValue";
import {
  commaSeparatedListToNumberArray,
  filterInvalidConnections,
} from "./elementsToProcessAgent";
import { propertyDefinitions } from "./propertyDefinitions";

type PropertyError = {
  propertyName: string;
  message: string;
};

export type ChartError = {
  propertyName?: string;
  element?: BpmnElement;
  message: string;
};

const trueBooleanOrString = (boolean: string | boolean) =>
  [true, "true"].includes(boolean);

const propertiesErrors = (element: BpmnElement): PropertyError[] | null => {
  const properties = propertyDefinitions(element)?.properties;
  if (!properties) {
    return null;
  }

  const errors: PropertyError[] = [];
  for (const {
    toArray,
    arrayLength,
    name,
    float,
    required,
    type,
  } of Object.values(properties)) {
    const value = getPropertyValue(element, name);
    if (required) {
      if (!value) {
        errors.push({ propertyName: name, message: `${name} is required` });
      }
    }
    if (type === "string") {
      if (toArray && value) {
        const parsed = commaSeparatedListToNumberArray(value);
        if (arrayLength && parsed?.length !== arrayLength) {
          let message = `${name} should be a comma,separated,list of numbers`;
          if (arrayLength) {
            message += ` with exactly ${arrayLength} entries`;
          }
          errors.push({
            propertyName: name,
            message,
          });
        }
      }
    }
    if (type === "object") {
      try {
        JSON.parse(value);
      } catch (err) {
        errors.push({
          propertyName: name,
          message:
            `${name} is invalid JSON: ` +
            err.message.replace("Syntax error: ", ""),
        });
      }
    }
    if (type === "number") {
      if (value?.includes(".") && !float) {
        errors.push({
          propertyName: name,
          message: `${name} should be an integer`,
        });
      }
    }
  }
  return errors;
};

export const validateChart = (
  unfilteredElements: BpmnElement[],
): ChartError[] => {
  const chartErrors: ChartError[] = [];

  const elements = unfilteredElements.filter(filterInvalidConnections);

  const hasStart = elements.filter(
    (element) => isSource(element) || isEnter(element),
  );
  if (!hasStart.length) {
    chartErrors.push({ message: "Chart must have a Source or Enter block" });
  }

  const hasSink = elements.filter(
    (element) => isSink(element) || isExit(element),
  );
  if (!hasSink.length) {
    chartErrors.push({ message: "Chart must have a Sink or Exit block" });
  }

  const names = new Set();

  for (const element of elements) {
    const type = elementType(element);
    if (!type) {
      continue;
    }

    if (type === "root") {
      const resources = getPropertyValue(element, "process_resources");
      if (resources) {
        try {
          JSON.parse(resources);
        } catch (err) {
          chartErrors.push({
            element,
            message:
              `Chart 'resources' definition must be valid JSON: ` +
              err.message.replace("Syntax error: ", ""),
          });
        }
      }
    }

    const name = element.businessObject.name;
    if (!name && type !== "root") {
      chartErrors.push({
        element,
        message: `${type} block requires a name`,
      });
    } else if (names.has(name)) {
      chartErrors.push({
        element,
        message: `Block name '${name}' is not unique`,
      });
    } else {
      names.add(name);
    }

    // Check the element has the right number of connections
    if ((type === "source" || type === "enter") && !element.outgoing.length) {
      chartErrors.push({
        element,
        message: `${name} must have an outgoing connection`,
      });
    } else if (
      [
        "custom",
        "delay",
        "release",
        "seize",
        "service",
        "select_output",
      ].includes(type)
    ) {
      if (!element.incoming.length || !element.outgoing.length) {
        chartErrors.push({
          element,
          message: `${name} must have an incoming and outgoing connection`,
        });
      }
    } else if (
      (type === "sink" || type === "exit") &&
      !element.incoming.length
    ) {
      chartErrors.push({
        element,
        message: `${name} must have an incoming connection`,
      });
    }
    if (element.outgoing.length > 1 && type !== "select_output") {
      chartErrors.push({
        element,
        message: `${name} must have only one outgoing connection`,
      });
    }

    if (type === "source") {
      const rate = getPropertyValue(element, "rate");
      const frequency = getPropertyValue(element, "frequency");
      if (!rate && !frequency) {
        chartErrors.push({
          element,
          message: `One of 'rate' or 'frequency' must be defined.`,
        });
      }
    }

    if (type === "delay" || type === "service") {
      const time = getPropertyValue(element, "time");
      const uniform_time = getPropertyValue(element, "uniform_time");
      const triangular_time = getPropertyValue(element, "triangular_time");
      const code_time = getPropertyValue(element, "code_time");
      const defined = [time, uniform_time, triangular_time, code_time].filter(
        Boolean,
      );
      if (defined.length !== 1) {
        chartErrors.push({
          element,
          message: `Exactly one of 'time', 'uniform_time', 'triangular_time' or 'code_time' should be defined.`,
        });
      }
    }

    if (type === "exit") {
      const to = getPropertyValue(element, "to");
      const to_field = getPropertyValue(element, "to_field");
      const to_code = getPropertyValue(element, "to_code");
      const defined = [to, to_field, to_code].filter(Boolean);
      if (defined.length !== 1) {
        chartErrors.push({
          element,
          message: `Exactly one of 'to', 'to_field', or 'to_code' should be defined.`,
        });
      }
    }

    if (type === "select_output") {
      if (element.outgoing.length !== 2) {
        chartErrors.push({
          element,
          message: `${name} must have exactly two outgoing connections`,
        });
      }
      const outgoings = element.outgoing.map(
        (el) => el.businessObject.targetRef.name,
      );
      const falseBlock = getPropertyValue(element, "false_block");
      if (!outgoings.includes(falseBlock)) {
        chartErrors.push({
          element,
          message: `false_block '${falseBlock}' does not match a connected node`,
        });
      }
      const trueBlock = getPropertyValue(element, "true_block");
      if (trueBlock && !outgoings.includes(trueBlock)) {
        chartErrors.push({
          element,
          message: `true_block '${trueBlock}' does not match a connected node`,
        });
      }
      const chanceField = getPropertyValue(element, "true_chance");
      const conditionField = getPropertyValue(element, "condition_field");
      if (!chanceField && !conditionField) {
        chartErrors.push({
          element,
          message: `Either true_chance or condition_field must be specified`,
        });
      }
      if (chanceField && conditionField) {
        {
          chartErrors.push({
            element,
            message: `Only ONE of true_chance or condition_field must be specified`,
          });
        }
      }
    }

    if (type === "release") {
      const seizes = elements.filter((element) => isSeize(element));
      const resource = getPropertyValue(element, "resource");
      const matchingSeizes = seizes.filter(
        (element) => getPropertyValue(element, "resource") === resource,
      );
      if (!matchingSeizes.length) {
        chartErrors.push({
          element,
          message: `${name} 'resource' field must match a 'resource' field reserved in a seize block`,
        });
      }
    }

    if (type === "custom") {
      const behavior = getPropertyValue(element, "behavior");
      if (
        !behavior?.endsWith(".js") &&
        !behavior?.endsWith(".rs") &&
        !behavior?.endsWith(".py")
      ) {
        chartErrors.push({
          element,
          message: `${name} 'behavior' filename must include the extension (e.g. '.js')`,
        });
      }
    }

    if (type === "sink") {
      const recordWaitTimes = getPropertyValue(element, "record_wait_times");
      if (trueBooleanOrString(recordWaitTimes)) {
        const seizeOrServiceTrackingWait = elements.find(
          (element) =>
            (isSeize(element) || isService(element)) &&
            trueBooleanOrString(getPropertyValue(element, "track_wait")),
        );
        if (!seizeOrServiceTrackingWait) {
          chartErrors.push({
            element,
            message: `${name} sets 'record_wait_times' to track arriving objects but no service or seize block with 'track_wait' enabled is present in the chart.`,
          });
        }
      }
    }
    if (
      (type === "seize" || type === "service") &&
      trueBooleanOrString(getPropertyValue(element, "track_wait"))
    ) {
      const sinksRecordingWaitTimes = elements.find(
        (element) =>
          isSink(element) &&
          trueBooleanOrString(getPropertyValue(element, "record_wait_times")),
      );
      if (!sinksRecordingWaitTimes) {
        chartErrors.push({
          element,
          message: `${name} sets 'track_wait' but no sink block with 'record_wait_times' is enabled in the chart.`,
        });
      }
    }

    // Are all the required properties defined, and are values valid?
    const errors = propertiesErrors(element);
    if (errors?.length) {
      chartErrors.push(...errors.map((error) => ({ ...error, element })));
    }
  }

  return chartErrors;
};
