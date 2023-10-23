import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity, EntityPropertiesObject } from "@local/hash-subgraph";

import { ImpureGraphContext } from "../../../../graph/index";

export type UpdateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  entity: Entity;
  updatedProperties: EntityPropertiesObject;
}) => Promise<void>;

export type UpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: UpdateEntityHookCallback;
};
