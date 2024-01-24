import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { textAfterUpdateEntityHookCallback } from "./after-update-entity-hooks/text-after-update-entity-hook-callback";
import { userAfterUpdateEntityHookCallback } from "./after-update-entity-hooks/user-after-update-entity-hook";
import { UpdateEntityHook } from "./update-entity-hooks";

export const afterUpdateEntityHooks: UpdateEntityHook[] = [
  {
    entityTypeId: systemEntityTypes.text.entityTypeId,
    callback: textAfterUpdateEntityHookCallback,
  },
  {
    entityTypeId: systemEntityTypes.user.entityTypeId,
    callback: userAfterUpdateEntityHookCallback,
  },
];
