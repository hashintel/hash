import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { userBeforeEntityUpdateHookCallback } from "./before-update-entity-hooks/user-before-update-entity-hook-callback";
import type { UpdateEntityHook } from "./update-entity-hooks";

export const beforeUpdateEntityHooks: UpdateEntityHook[] = [
  {
    entityTypeId: systemEntityTypes.user.entityTypeId,
    callback: userBeforeEntityUpdateHookCallback,
  },
];
