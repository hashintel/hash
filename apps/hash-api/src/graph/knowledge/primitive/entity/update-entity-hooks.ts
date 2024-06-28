import type { VersionedUrl } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { PropertyObject } from "@local/hash-graph-types/entity";

import type { ImpureGraphContext } from "../../../context-types";

export type UpdateEntityHookCallback = (params: {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  previousEntity: Entity;
  updatedProperties: PropertyObject;
}) => Promise<void>;

export type UpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: UpdateEntityHookCallback;
};
