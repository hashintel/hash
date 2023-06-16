import {
  BpmnElement,
  isCustom,
  isDelay,
  isEnter,
  isExit,
  isGateway,
  isRelease,
  isSeize,
  isService,
  isSink,
  isSource,
} from "../../types/bpmnElements";
import { ParameterName } from "../../types/properties";

export type PropertyDefinition = {
  arrayLength?: number;
  toArray?: boolean;
  description: string;
  float?: boolean;
  name: ParameterName;
  rate?: boolean;
  required: boolean;
  type: "code" | "boolean" | "number" | "object" | "string";
};

export type PropertyValue = boolean | number | string;

export const propertyDefinitions = (
  element: BpmnElement,
): {
  docRef: string;
  properties: PropertyDefinition[];
} | null => {
  let properties: PropertyDefinition[];
  let docRef;
  if (isSource(element)) {
    docRef = "process-blocks#source";
    properties = [
      {
        description:
          "The definition for each object sent through the process model.",
        name: "template",
        type: "object",
        required: true,
      },
      {
        description:
          "The number of time steps between each new object being generated.",
        name: "frequency",
        type: "number",
        required: false,
      },
      {
        description:
          "The number of objects that will be produced each time step (fractional allowed).",
        name: "rate",
        float: true,
        type: "number",
        required: false,
      },
      {
        description:
          "Generate a unique uuid and append it to each generated object.",
        name: "add_id",
        type: "boolean",
        required: false,
      },
      {
        description:
          "An executable string evaluated as JavaScript to create  the definition for each object sent through the process model.",
        name: "code_template",
        type: "code",
        required: false,
      },
    ];
  } else if (isSink(element)) {
    docRef = "process-blocks#sink";
    properties = [
      {
        description:
          "Record arrays of through-times for objects in 'state.process_data.through_times.<block_name>' and 'state.process_data.avg_through_times.<block_name>'",
        name: "record_through_time",
        type: "boolean",
        required: false,
      },
      {
        description:
          "Count the number of objects that arrive in 'state.process_data.counts.<block_name>'.",
        name: "record_count",
        type: "boolean",
        required: false,
      },
      {
        description:
          "Record arrays of wait times for objects in 'state.process_data.wait_times.<block_name>' and 'state.process_data.avg_wait_times.<block_name>'",
        name: "record_wait_times",
        type: "boolean",
        required: false,
      },
    ];
  } else if (isDelay(element)) {
    docRef = "process-blocks#delay";
    properties = [
      {
        name: "time",
        description: "The time an object will wait in the delay queue.",
        type: "number",
        required: false,
      },
      {
        name: "uniform_time",
        description:
          "Generate the delay time from a uniform distribution (two numbers separated by commas).",
        type: "string",
        required: false,
        toArray: true,
        arrayLength: 2,
      },
      {
        name: "triangular_time",
        description:
          "Generate the delay time from a triangular distribution (three numbers separated by commas)",
        type: "string",
        required: false,
        toArray: true,
        arrayLength: 3,
      },
      {
        name: "code_time",
        description:
          "Generate the delay time by executing a string as JavaScript code. Must return a number",
        type: "code",
        required: false,
      },
    ];
  } else if (isSeize(element)) {
    docRef = "process-blocks#seize";
    properties = [
      {
        description:
          "The name of the agent field which tracks the number of available resources. Define resource fields in settings. The field on the agent must contain a number.",
        name: "resource",
        type: "string",
        required: true,
      },
      {
        description:
          "If true, objects will track the amount of time they wait for resources to become available. There must be also at least one sink with 'record_wait_times' set.",
        name: "track_wait",
        type: "boolean",
        required: false,
      },
    ];
  } else if (isRelease(element)) {
    docRef = "process-blocks#release";
    properties = [
      {
        description:
          "The name of the agent field which tracks the number of available resources. Define resource fields in settings. The field on the agent must contain a number.",
        name: "resource",
        type: "string",
        required: true,
      },
    ];
  } else if (isEnter(element)) {
    docRef = "process-blocks#enter";
    properties = [];
  } else if (isExit(element)) {
    docRef = "process-blocks#exit";
    properties = [
      {
        description: "The agent_id of the recipient of the message.",
        name: "to",
        required: false,
        type: "string",
      },
      {
        description:
          "Use this field on the agent to determine the agent_id of the recipient.",
        name: "to_field",
        required: false,
        type: "string",
      },
      {
        description:
          "Evaluate a string as javascript code to determine the recipient. It must return a string, and can reference an `obj` variable.",
        name: "to_code",
        required: false,
        type: "string",
      },
      {
        description:
          "Optionally specify either (1) an enter block in another process to send the object to, or (2) a specific type for the sent message (e.g. specify 'create_agent' here and 'hash' under 'to' to create an agent from the object)",
        name: "next_block",
        required: false,
        type: "string",
      },
    ];
  } else if (isService(element)) {
    docRef = "process-blocks#service";
    properties = [
      {
        description:
          "The name of the agent field which tracks the number of available resources. Define resource fields in settings. The field on the agent must contain a number.",
        name: "resource",
        type: "string",
        required: true,
      },
      {
        name: "time",
        description: "The time an object will wait in the delay queue.",
        type: "number",
        required: false,
      },
      {
        name: "uniform_time",
        description:
          "Generate the delay time from a uniform distribution (two numbers separated by commas).",
        type: "string",
        required: false,
        toArray: true,
        arrayLength: 2,
      },
      {
        name: "triangular_time",
        description:
          "Generate the delay time from a triangular distribution (three numbers separated by commas)",
        type: "string",
        required: false,
        toArray: true,
        arrayLength: 3,
      },
      {
        name: "code_time",
        description:
          "Generate the delay time by executing a string as JavaScript code. Must return a number",
        type: "code",
        required: false,
      },
      {
        description:
          "If true, objects will track the amount of time they wait for resources to become available. There must be also at least one sink with 'record_wait_times' set.",
        name: "track_wait",
        type: "boolean",
        required: false,
      },
    ];
  } else if (isGateway(element)) {
    docRef = "process-blocks#select-output";
    properties = [
      {
        description:
          "Checks whether this field on the object is true or false to determine which path it will take.",
        name: "condition_field",
        type: "string",
        required: false,
      },
      {
        description:
          "If set, generates a random number between 0 & 1. If less than true_chance the object is sent to the true_block, else it's sent to the false_block.",
        float: true,
        name: "true_chance",
        type: "number",
        rate: true,
        required: false,
      },
      {
        name: "code_condition",
        description:
          "Evaluate a string as javascript code to determine the path taken. It must return a boolean, and can reference an `obj` variable.",
        type: "code",
        required: false,
      },
      {
        description:
          "Specify the block that objects failing the condition check will be sent to.",
        name: "false_block",
        type: "string",
        required: true,
      },
      {
        description:
          "Specify the block that objects passing the condition check will be sent to.",
        name: "true_block",
        type: "string",
        required: false,
      },
      {
        description:
          "If set, removes the field specified in condition_field from the object before passing it on.",
        name: "remove_condition_field",
        type: "boolean",
        required: false,
      },
    ];
  } else if (isCustom(element)) {
    docRef = "custom-behaviors";
    properties = [
      {
        description:
          "The filename of your custom behavior to run in this block (e.g. 'custom.js').",
        name: "behavior",
        type: "string",
        required: true,
      },
    ];
  } else {
    return null;
  }
  properties.unshift({
    description: "A name for the block, unique across all blocks in the model.",
    name: "name",
    required: true,
    type: "string",
  });
  return {
    docRef,
    properties,
  };
};
