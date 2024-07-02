import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { userBeforeEntityUpdateHookCallback } from "./before-update-entity-hooks/user-before-update-entity-hook-callback";
import type { BeforeUpdateEntityHook } from "./update-entity-hooks";

export const beforeUpdateEntityHooks: BeforeUpdateEntityHook[] = [
  {
    entityTypeId: systemEntityTypes.user.entityTypeId,
    callback: userBeforeEntityUpdateHookCallback,
  },
];
