import {
  extractEntityUuidFromEntityId,
  type EntityId,
} from "@blockprotocol/type-system";

export const generateFlowDefinitionPath = ({
  shortname,
  flowDefinitionId,
}: {
  shortname: string;
  flowDefinitionId: string;
}) => `/@${shortname}/flows/${flowDefinitionId}`;

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
  flowDefinitionIds,
}: {
  flowDefinitionIds: string[];
}) =>
  `/workers?${flowDefinitionIds.map((flowDefinitionId) => `${workerFlowFilterParam}=${flowDefinitionId}`).join("&")}`;
