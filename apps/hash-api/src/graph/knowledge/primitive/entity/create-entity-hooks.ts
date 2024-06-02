import type { VersionedUrl } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";

import type { ImpureGraphContext } from "../../../context-types";

export type BeforeCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  properties: Entity["properties"];
}) => Promise<{ properties: Entity["properties"] }>;

export type BeforeCreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: BeforeCreateEntityHookCallback;
};

export type AfterCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: Entity;
}) => Promise<void>;

export type AfterCreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: AfterCreateEntityHookCallback;
};
