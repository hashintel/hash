import type { ReadOnlyReason } from "@hashintel/petrinaut/react";
import type { PluginEdits } from "@hashintel/petrinaut/ui/plugin";

/**
 * TEMPORARY (FE-2048): a copy of Petrinaut's `simulateModeAllowedMutationNames`
 * (`libs/@hashintel/petrinaut/src/react/state/simulate-mode-allowed-mutation-names.ts`),
 * which is not public. These edits stay available outside edit mode; only a
 * read-only host refuses them. Delete with this adapter once the plugin API
 * answers per-operation refusal itself; until then a change there must be
 * mirrored here.
 */
const editsAllowedOutsideEditMode: ReadonlySet<keyof PluginEdits> = new Set([
  "addScenario",
  "updateScenario",
  "removeScenario",
  "addMetric",
  "updateMetric",
  "removeMetric",
]);

/**
 * TEMPORARY (FE-2048): the refusal `operation` would meet now, or `null`, from
 * the editor's current read-only `reason`. Mirrors Petrinaut's private
 * `mutationBlockedBy`; operations it does not exempt, such as
 * `applyAutoLayout`, are refused by any reason.
 */
export const editRefusalFor = (
  operation: keyof PluginEdits,
  reason: ReadOnlyReason | null,
): ReadOnlyReason | null =>
  reason !== null &&
  (reason.kind === "host-readonly" ||
    !editsAllowedOutsideEditMode.has(operation))
    ? reason
    : null;
