import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity, EntityPropertiesObject } from "@local/hash-subgraph";

import type { AuthenticationContext } from "../../../../graphql/authentication-context";
import type { ImpureGraphContext } from "../../../context-types";

export type UpdateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: Entity;
  updatedProperties: EntityPropertiesObject;
}) => Promise<void>;

export type UpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: UpdateEntityHookCallback;
};
