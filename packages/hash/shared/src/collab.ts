// import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EntityStore } from "./entityStore";
import { EntityStorePluginAction } from "./entityStorePlugin";

export type ProsemirrorJson = { [key: string]: any };
export type ClientId = string | number;

export type DocumentChange = {
  steps: ProsemirrorJson[];
  clientIDs: ClientId[];
  store: EntityStore;
  actions: EntityStorePluginAction[];
};

/** Represents user position within a page, sent to collab clients */
export interface CollabPosition {
  userId: string;
  userShortname: string;
  userPreferredName: string;
  entityId: string;
}

export const SERVER_ERROR = "serverError" as const;
/** Server events are events that the server publishes */
export type ErrorEvent = {
  type: typeof SERVER_ERROR;
  error: string;
};

export const VERSION_CONFLICT = "versionConflict" as const;
/** Document version conflict */
export type VersionConflictEvent = {
  type: typeof VERSION_CONFLICT;
};

export const INITIAL_STATE = "initialDocument" as const;
/**
 * Used exclusively for sending a snapshot of the newest version when connecting initially
 */
export type InitialStateEvent = {
  type: typeof INITIAL_STATE;
  doc: ProsemirrorJson;
  store: EntityStore;
  version: number;
};

export const DOCUMENT_UPDATED = "documentUpdated" as const;
/** Any document update */
export type DocumentUpdatedEvent = {
  type: typeof DOCUMENT_UPDATED;
  version: number;
} & DocumentChange;

export const POSITION_UPDATED = "positionUpdated" as const;
/** Any position updates */
export type PositionUpdatedEvent = {
  type: typeof POSITION_UPDATED;
  positions: CollabPosition[];
};

export type ServerEvent =
  | ErrorEvent
  | VersionConflictEvent
  | InitialStateEvent
  | DocumentUpdatedEvent
  | PositionUpdatedEvent;

// Client action are requests that the user sends to the server

export const UPDATE_DOCUMENT = "updateDocument" as const;
export type UpdateAction = {
  type: typeof UPDATE_DOCUMENT;
  version: number;
  steps: ProsemirrorJson[];
  clientId: ClientId;
  blockIds: string[];
  actions: EntityStorePluginAction[];
};

export const FETCH_VERSION = "fetchVersion" as const;
export type FetchVersionAction = {
  type: typeof FETCH_VERSION;
  currentVersion: number;
};

export const REPORT_POSITION = "reportPosition" as const;
export type ReportPositionAction = {
  type: typeof REPORT_POSITION;
  entityId: string;
};

export type ClientAction =
  | UpdateAction
  | FetchVersionAction
  | ReportPositionAction;

export type UpdateDocumentCallback = {
  status: "success" | "versionConflict";
};

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
