import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity, EntityPropertiesObject } from "@local/hash-subgraph";

import { AuthenticationContext } from "../../../../graphql/context";
import { ImpureGraphContext } from "../../../util";

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
