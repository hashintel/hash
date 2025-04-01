import type {
  PropertyPatchOperation,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

import type { ImpureGraphContext } from "../../../context-types";

type UpdateEntityHookCallbackBaseParams = {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  previousEntity: HashEntity;
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
  params: UpdateEntityHookCallbackBaseParams & { updatedEntity: HashEntity },
) => Promise<void>;

export type AfterUpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: AfterUpdateEntityHookCallback;
};
