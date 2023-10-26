import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity, EntityPropertiesObject } from "@local/hash-subgraph";

import { ImpureGraphContext } from "../../../../graph/index";
import { AuthenticationContext } from "../../../context";

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
