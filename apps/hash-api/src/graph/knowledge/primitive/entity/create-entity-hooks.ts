import type { VersionedUrl } from "@blockprotocol/type-system";
import type { SimpleEntity } from "@local/hash-graph-types/entity";

import type { AuthenticationContext } from "../../../../graphql/authentication-context";
import type { ImpureGraphContext } from "../../../context-types";

export type BeforeCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  properties: SimpleEntity["properties"];
}) => Promise<{ properties: SimpleEntity["properties"] }>;

export type BeforeCreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: BeforeCreateEntityHookCallback;
};

export type AfterCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: SimpleEntity;
}) => Promise<void>;

export type AfterCreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: AfterCreateEntityHookCallback;
};
