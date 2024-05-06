import { SectionLabel } from "./section-label";
import { Stack } from "@mui/material";
import { EntityResultTable } from "./outputs/entity-result-table";
import { PersistedEntityGraph } from "./outputs/persisted-entity-graph";
import { Deliverables } from "./outputs/deliverables";
import { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { Entity } from "@local/hash-subgraph";
import { useFlowRunsContext } from "./shared/flow-runs-context";

type OutputsProps = {
  persistedEntities: Entity[];
  proposedEntities: ProposedEntity[];
};

export const Outputs = ({
  persistedEntities,
  proposedEntities,
}: OutputsProps) => {
  const { selectedFlowRun } = useFlowRunsContext();

  return (
    <>
      <SectionLabel text="Outputs" />
      <Stack direction="row" gap={1} sx={{ height: "100%", width: "100%" }}>
        <EntityResultTable
          persistedEntities={persistedEntities}
          proposedEntities={proposedEntities}
        />
        <PersistedEntityGraph persistedEntities={persistedEntities} />
        <Deliverables outputs={selectedFlowRun?.outputs ?? []} />
      </Stack>
    </>
  );
};
