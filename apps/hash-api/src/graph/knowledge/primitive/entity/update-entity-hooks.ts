import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity, EntityPropertiesObject } from "@local/hash-subgraph";

import { AuthenticationContext } from "../../../../graphql/authentication-context";
import { ImpureGraphContext } from "../../../context-types";

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
