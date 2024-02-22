import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  entityTypesToParseTextFrom,
  parseTextFromFileAfterUpdateEntityHookCallback,
} from "./after-update-entity-hooks/file-document-after-update-entity-hook-callback";
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
  ...entityTypesToParseTextFrom.map((entityTypeId) => ({
    entityTypeId,
    callback: parseTextFromFileAfterUpdateEntityHookCallback,
  })),
];
