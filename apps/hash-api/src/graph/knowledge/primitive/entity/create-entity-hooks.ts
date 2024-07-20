import type { VersionedUrl } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { PropertyObjectWithMetadata } from "@local/hash-graph-types/entity";

import type { ImpureGraphContext } from "../../../context-types";

export type BeforeCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  properties: PropertyObjectWithMetadata;
}) => Promise<{ properties: PropertyObjectWithMetadata }>;

export interface BeforeCreateEntityHook {
  entityTypeId: VersionedUrl;
  callback: BeforeCreateEntityHookCallback;
}

export type AfterCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: Entity;
}) => Promise<void>;

export interface AfterCreateEntityHook {
  entityTypeId: VersionedUrl;
  callback: AfterCreateEntityHookCallback;
}
