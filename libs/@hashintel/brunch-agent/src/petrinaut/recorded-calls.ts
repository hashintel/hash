/**
 * Reads the Petrinaut calls a conversation recorded before a component was
 * called a component. The tools that define one were then named after the
 * subnet, HASH's tools for an instance had the names its tools for a
 * component have today, and inputs carried `subnetId` and `targetSubnetId`.
 * Nothing writes these names or keys: this module is the one place in the
 * assistant that knows them.
 */

import { z } from "zod";

import { migrateLegacyComponentKeys } from "@hashintel/petrinaut-core";

import {
  hashPetrinautPrimaryOperation,
  hashPetrinautTools,
  isHashPetrinautToolName,
  type HashPetrinautToolName,
} from "../hash/petrinaut-tools";
import {
  canonicalCallsOf,
  type CanonicalPetrinautCall,
} from "./browser-executed-tools";

import type { PetrinautAiToolName } from "@hashintel/petrinaut-core/ai";

/** A call of a tool, by the tool's name and the call's input. */
export interface RecordedCall {
  readonly toolName: string;
  readonly input: unknown;
}

/** Today's tools that define a component, by the name each was recorded under. */
const definitionToolNames: ReadonlyMap<
  string,
  PetrinautAiToolName | HashPetrinautToolName
> = new Map([
  ["addSubnet", "addComponent"],
  ["updateSubnet", "updateComponent"],
  ["removeSubnet", "removeComponent"],
  ["petrinaut_create_subnet", "petrinaut_create_component"],
  ["petrinaut_update_subnet", "petrinaut_update_component"],
  ["petrinaut_remove_subnet", "petrinaut_remove_component"],
]);

/**
 * HASH's tools for an instance, by the name each was recorded under: today
 * the name of its tool for a component.
 */
const instanceToolNames: ReadonlyMap<string, HashPetrinautToolName> = new Map([
  ["petrinaut_create_component", "petrinaut_create_component_instance"],
  ["petrinaut_update_component", "petrinaut_update_component_instance"],
  ["petrinaut_remove_component", "petrinaut_remove_component_instance"],
]);

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `fields` with the value under `key` moved under `newKey`, when it has `key`. */
const renameKey = (fields: Fields, key: string, newKey: string): Fields => {
  if (!Object.hasOwn(fields, key)) {
    return fields;
  }
  const { [key]: value, ...rest } = fields;
  return { ...rest, [newKey]: value };
};

/** An instance as `migrateLegacyComponentKeys` leaves one in a document: `subnetId` as `component: { id }`. */
const readInstance = (instance: unknown): unknown =>
  migrateLegacyComponentKeys({ componentInstances: [instance] })
    .componentInstances[0];

const readDefinitionId = (input: Fields): Fields =>
  renameKey(input, "subnetId", "componentId");

/** What an operation's input said differently, beyond the net it targets. */
const inputReaders: Partial<
  Record<PetrinautAiToolName, (input: Fields) => unknown>
> = {
  // The instances the new component holds, as a document's are read.
  addComponent: migrateLegacyComponentKeys,
  updateComponent: readDefinitionId,
  removeComponent: readDefinitionId,
  addComponentInstance: readInstance,
  updateComponentInstance: (input) =>
    Object.hasOwn(input, "update")
      ? { ...input, update: readInstance(input.update) }
      : input,
};

/**
 * `input` in the keys `toolName` takes today. Takes whatever was recorded, so
 * it reads no more of the shape than the keys that changed, and returns an
 * input in today's keys as it is.
 */
const readInput = (toolName: string, input: unknown): unknown => {
  if (!isFields(input)) {
    return input;
  }
  const targeted = renameKey(input, "targetSubnetId", "targetComponentId");
  const operation = hashPetrinautPrimaryOperation(toolName) ?? toolName;
  return Object.hasOwn(inputReaders, operation)
    ? (inputReaders[operation as PetrinautAiToolName]?.(targeted) ?? targeted)
    : targeted;
};

const read = (toolName: string, input: unknown): RecordedCall => ({
  toolName,
  input: readInput(toolName, input),
});

const fits = ({ toolName, input }: RecordedCall): boolean =>
  isHashPetrinautToolName(toolName) &&
  hashPetrinautTools[toolName].inputSchema.safeParse(input).success;

/**
 * A call a conversation recorded, as the tool of today that takes it and in
 * that tool's keys. A name that passed from HASH's tool for an instance to
 * its tool for a component is read as today's tool when the input fits it,
 * and else as the instance tool it was when the input fits that.
 */
export const readRecordedCall = (
  toolName: string,
  input: unknown,
): RecordedCall => {
  const call = read(definitionToolNames.get(toolName) ?? toolName, input);
  const instanceToolName = instanceToolNames.get(toolName);
  if (instanceToolName === undefined || fits(call)) {
    return call;
  }
  const instanceCall = read(instanceToolName, input);
  return fits(instanceCall) ? instanceCall : call;
};

/**
 * The canonical Petrinaut calls a recorded call made, in order: those of the
 * tool it is read as, and none when no tool of today takes its input.
 */
export const recordedCanonicalCallsOf = (
  toolName: string,
  input: unknown,
): readonly CanonicalPetrinautCall[] => {
  const call = readRecordedCall(toolName, input);
  try {
    return canonicalCallsOf(call.toolName, call.input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return [];
    }
    throw error;
  }
};
