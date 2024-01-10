import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-subgraph";

import type { AuthenticationContext } from "../../../../graphql/authentication-context";
import type { ImpureGraphContext } from "../../../context-types";

export type CreateEntityHookCallback = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  entity: Entity;
}) => Promise<Entity>;

export type CreateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: CreateEntityHookCallback;
};
