import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  entityTypesToParseTextFrom,
  parseTextFromFileAfterUpdateEntityHookCallback,
} from "./after-update-entity-hooks/file-document-after-update-entity-hook-callback.js";
import { textAfterUpdateEntityHookCallback } from "./after-update-entity-hooks/text-after-update-entity-hook-callback.js";
import { userAfterUpdateEntityHookCallback } from "./after-update-entity-hooks/user-after-update-entity-hook.js";
import type { AfterUpdateEntityHook } from "./update-entity-hooks.js";

export const afterUpdateEntityHooks: AfterUpdateEntityHook[] = [
  {
    entityTypeId: systemEntityTypes.text.entityTypeId,
    callback: textAfterUpdateEntityHookCallback,
  },
  {
    entityTypeId: systemEntityTypes.user.entityTypeId,
    callback: userAfterUpdateEntityHookCallback,
  },
  ...entityTypesToParseTextFrom.map((entityTypeId) => ({
    entityTypeId,
    callback: parseTextFromFileAfterUpdateEntityHookCallback,
  })),
];
