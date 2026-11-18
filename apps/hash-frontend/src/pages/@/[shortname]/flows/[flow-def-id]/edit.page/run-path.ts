import {
  ENTITY_ID_DELIMITER,
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
  isEntityId,
} from "@blockprotocol/type-system";
import { generateFlowEditorPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import type { EntityId, EntityUuid } from "@blockprotocol/type-system";

/**
 * The editor's path showing one of the flow's runs, in its Logs view. The `run` parameter is the uuid of the run's
 * entity when the run is in the flow's web, as runs started from the editor are, and its whole entity id otherwise.
 */
export const generateRunViewPath = ({
  shortname,
  flowDefinitionEntityId,
  flowRunEntityId,
}: {
  /** The shortname of the web the flow is in. */
  shortname: string;
  flowDefinitionEntityId: EntityId;
  flowRunEntityId: EntityId;
}) => {
  const runParam =
    extractWebIdFromEntityId(flowRunEntityId) ===
    extractWebIdFromEntityId(flowDefinitionEntityId)
      ? extractEntityUuidFromEntityId(flowRunEntityId)
      : flowRunEntityId;

  return `${generateFlowEditorPath({ shortname, flowDefinitionEntityId })}?view=logs&run=${encodeURIComponent(runParam)}`;
};

/** The run a `run` parameter of {@link generateRunViewPath} names, or `null` if it doesn't name one. */
export const parseRunParam = (
  runParam: string | string[] | undefined,
  flowDefinitionEntityId: EntityId,
): EntityId | null => {
  if (typeof runParam !== "string") {
    return null;
  }

  const flowRunEntityId = runParam.includes(ENTITY_ID_DELIMITER)
    ? runParam
    : entityIdFromComponents(
        extractWebIdFromEntityId(flowDefinitionEntityId),
        runParam as EntityUuid,
      );

  return isEntityId(flowRunEntityId) ? flowRunEntityId : null;
};
