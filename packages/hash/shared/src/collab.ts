import { EntityStore } from "./entityStore";
import { EntityStorePluginAction } from "./entityStorePlugin";

type ProsemirrorJson = { [key: string]: any };

/**
 * Represents user position within a page, sent to collab clients
 */
export interface CollabPosition {
  userId: string;
  userShortname: string;
  userPreferredName: string;
  entityId: string;
}

// Server events are events that the server publishes
export const SERVER_ERROR = "serverError" as const;
export type ErrorEvent = {
  type: typeof SERVER_ERROR;
  error: string;
};

export const INITIAL_DOCUMENT = "initialDocument" as const;
export type InitialDocumentEvent = {
  type: typeof INITIAL_DOCUMENT;
  doc: ProsemirrorJson;
  store: EntityStore;
  version: number;
};

export type ServerEvent = ErrorEvent | InitialDocumentEvent;

// Client action are requests that the user sends to the server
export const UPDATE_DOCUMENT = "updateDocument" as const;
export type UpdateAction = {
  type: typeof UPDATE_DOCUMENT;
  version: number;
  steps: ProsemirrorJson[];
  clientId: string | number;
  blockIds: string[];
  actions: EntityStorePluginAction[];
};

export type ClientAction = UpdateAction;

export const initialConnectionDataValues = [
  "accountId",
  "pageEntityId",
] as const;

export type InitialConnectionData = Record<
  typeof initialConnectionDataValues[number],
  string
>;

const assertInitialValues = (
  values: any,
): asserts values is InitialConnectionData => {
  if (
    !initialConnectionDataValues.every(
      (variant) => variant in values && typeof values[variant] === "string",
    )
  ) {
    throw new Error(
      `Initial connection data is invalid. Please make sure to include ${initialConnectionDataValues}`,
    );
  }
};
export const checkInitialConnectionDataValues = (
  values: any,
): InitialConnectionData => {
  // i don't know why we have to do an assignment here..
  const _ = assertInitialValues(values);
  return values;
};

export const parseVersion = (rawValue: any) => {
  const num = Number(rawValue);
  if (!Number.isNaN(num) && Math.floor(num) === num && num >= 0) return num;

  throw new Error(`Invalid version ${rawValue}`);
};
