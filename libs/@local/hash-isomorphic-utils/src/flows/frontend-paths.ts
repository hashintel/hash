export const generateFlowDefinitionPath = ({
  shortname,
  flowDefinitionId,
}: {
  shortname: string;
  flowDefinitionId: string;
}) => `/@${shortname}/flows/${flowDefinitionId}`;

export const generateWorkerRunPath = ({
  namespace,
  flowRunId,
}: {
  namespace: string;
  flowRunId: string;
}) => `/@${namespace}/workers/${flowRunId}`;
