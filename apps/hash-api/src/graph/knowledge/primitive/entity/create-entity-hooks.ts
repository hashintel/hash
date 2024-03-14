import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-subgraph";

import type { AuthenticationContext } from "../../../../graphql/authentication-context";
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
