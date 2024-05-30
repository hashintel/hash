import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  EntityPropertiesObject,
  SimpleEntity,
} from "@local/hash-graph-types/entity";

import type { AuthenticationContext } from "../../../../graphql/authentication-context";
import type { ImpureGraphContext } from "../../../context-types";

export type UpdateEntityHookCallback = (params: {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  entity: SimpleEntity;
  updatedProperties: EntityPropertiesObject;
}) => Promise<void>;

export type UpdateEntityHook = {
  entityTypeId: VersionedUrl;
  callback: UpdateEntityHookCallback;
};
