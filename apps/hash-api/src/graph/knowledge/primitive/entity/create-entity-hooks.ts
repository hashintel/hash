import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity } from "@local/hash-subgraph";

import { AuthenticationContext } from "../../../../graphql/context";
import { ImpureGraphContext } from "../../../util";

export type CreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: Entity;
}) => Promise<Entity>;

export type CreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: CreateEntityHookCallback;
};
