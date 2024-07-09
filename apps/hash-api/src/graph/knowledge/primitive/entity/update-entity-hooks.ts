import type { VersionedUrl } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { PropertyPatchOperation } from "@local/hash-graph-types/entity";

import type { ImpureGraphContext } from "../../../context-types";

type UpdateEntityHookCallbackBaseParams = {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  previousEntity: Entity;
  propertyPatches: PropertyPatchOperation[];
};

export type BeforeUpdateEntityHookCallback = (
  params: UpdateEntityHookCallbackBaseParams,
) => Promise<void>;

export type BeforeUpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: BeforeUpdateEntityHookCallback;
};

export type AfterUpdateEntityHookCallback = (
  params: UpdateEntityHookCallbackBaseParams & { updatedEntity: Entity },
) => Promise<void>;

export type AfterUpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: AfterUpdateEntityHookCallback;
};
