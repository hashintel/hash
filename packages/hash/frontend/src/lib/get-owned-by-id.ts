import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
import { MinimalOrg } from "./org";
import { User } from "./user";

export const getOwnedById = (activeWorkspace: User | MinimalOrg) => {
  const { baseId } = activeWorkspace.entityEditionId;

  return activeWorkspace.kind === "user"
    ? extractEntityUuidFromEntityId(baseId)
    : /**
       * @todo  we should be using `extractEntityUuidFromEntityId` here instead,
       * but it's not possible for now
       * @see https://hashintel.slack.com/archives/C022217GAHF/p1669644710424819 (internal) for details
       */
      extractOwnedByIdFromEntityId(baseId);
};
