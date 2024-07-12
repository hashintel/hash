import type { EntityUuid } from "@local/hash-graph-types/entity";

export const generateFlowDefinitionPath = ({
  shortname,
  flowDefinitionId,
}: {
  shortname: string;
  flowDefinitionId: string;
}) => `/@${shortname}/flows/${flowDefinitionId}`;

export const generateWorkerRunPath = ({
  shortname,
  flowRunId,
}: {
  shortname: string;
  flowRunId: EntityUuid;
}) => `/@${shortname.replace(/^@/, "")}/workers/${flowRunId}`;

export const workerFlowFilterParam = "flow";

export const generatedFilteredWorkersPath = ({
  flowDefinitionIds,
}: {
  flowDefinitionIds: string[];
}) =>
  `/workers?${flowDefinitionIds.map((flowDefinitionId) => `${workerFlowFilterParam}=${flowDefinitionId}`).join("&")}`;
