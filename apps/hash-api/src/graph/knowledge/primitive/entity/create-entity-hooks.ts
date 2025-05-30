import type {
  PropertyObjectWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

import type { ImpureGraphContext } from "../../../context-types";

export type BeforeCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  properties: PropertyObjectWithMetadata;
}) => Promise<{ properties: PropertyObjectWithMetadata }>;

export type BeforeCreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: BeforeCreateEntityHookCallback;
};

export type AfterCreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: HashEntity;
}) => Promise<void>;

export type AfterCreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: AfterCreateEntityHookCallback;
};
