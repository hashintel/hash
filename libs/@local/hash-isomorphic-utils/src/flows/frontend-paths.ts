import {
  extractEntityUuidFromEntityId,
  type EntityId,
} from "@blockprotocol/type-system";

/**
 * The page of a flow definition. The shortname names the definition's web, so the path only needs the uuid of its
 * entity.
 */
export const generateFlowDefinitionPath = ({
  shortname,
  flowDefinitionEntityId,
}: {
  shortname: string;
  flowDefinitionEntityId: EntityId;
}) =>
  `/@${shortname.replace(/^@/, "")}/flows/${extractEntityUuidFromEntityId(flowDefinitionEntityId)}`;

/**
 * The page that edits a flow definition.
 */
export const generateFlowEditorPath = (params: {
  shortname: string;
  flowDefinitionEntityId: EntityId;
}) => `${generateFlowDefinitionPath(params)}/edit`;

/**
 * The page of a flow run. The shortname names the run's web, so the path only needs the uuid of its entity.
 */
export const generateWorkerRunPath = ({
  shortname,
  flowRunEntityId,
}: {
  shortname: string;
  flowRunEntityId: EntityId;
}) =>
  `/@${shortname.replace(/^@/, "")}/workers/${extractEntityUuidFromEntityId(flowRunEntityId)}`;

export const workerFlowFilterParam = "flow";

export const generatedFilteredWorkersPath = ({
  flowDefinitionEntityIds,
}: {
  flowDefinitionEntityIds: EntityId[];
}) =>
  `/workers?${flowDefinitionEntityIds.map((flowDefinitionEntityId) => `${workerFlowFilterParam}=${encodeURIComponent(flowDefinitionEntityId)}`).join("&")}`;

export const flowTriggersFlowFilterParam = "flow";

/**
 * The page that lists the flow triggers the user can see: all of them, or only those of one flow.
 */
export const generateFlowTriggersPath = ({
  flowDefinitionEntityId,
}: {
  flowDefinitionEntityId?: EntityId;
} = {}) =>
  flowDefinitionEntityId
    ? `/flows/triggers?${flowTriggersFlowFilterParam}=${encodeURIComponent(flowDefinitionEntityId)}`
    : "/flows/triggers";
