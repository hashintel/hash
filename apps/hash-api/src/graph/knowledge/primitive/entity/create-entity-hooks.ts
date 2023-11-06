import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity } from "@local/hash-subgraph";

import { AuthenticationContext } from "../../../../graphql/authentication-context";
import { ImpureGraphContext } from "../../../context-types";

export type CreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: Entity;
}) => Promise<Entity>;

export type CreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: CreateEntityHookCallback;
};
