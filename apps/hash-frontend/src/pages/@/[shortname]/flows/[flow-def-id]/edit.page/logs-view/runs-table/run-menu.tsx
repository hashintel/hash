import { useApolloClient } from "@apollo/client";
import { useState } from "react";

import { EllipsisMenu } from "@hashintel/ds-components";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { useSnackbar } from "../../../../../../../../components/hooks/use-snackbar";
import { RunFlowDialog } from "../../shared/run-flow";
import { getRunBlocker } from "../../shared/run-form";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../../graphql/api-types.gen";
import type { FlowRunner } from "../../shared/run-flow";
import type { RunRow } from "../run-list";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

/** A run's ⋮: Open run, and Re-run, which opens the run form with the run's inputs, as in the run's top bar. */
export const RunMenu = ({
  row,
  runner,
  onOpen,
}: {
  row: RunRow;
  runner: FlowRunner;
  onOpen: () => void;
}) => {
  const client = useApolloClient();
  const { triggerSnackbar } = useSnackbar();
  const [ranInputs, setRanInputs] = useState<FlowInputValues | null>(null);
  const blocker = getRunBlocker(runner.editorState);

  /* The table's runs don't carry their inputs. */
  const rerun = async () => {
    try {
      const { data } = await client.query<
        GetFlowRunByIdQuery,
        GetFlowRunByIdQueryVariables
      >({
        query: getFlowRunById,
        variables: { flowRunEntityId: row.flowRunEntityId },
      });

      setRanInputs(data.getFlowRunById.flowInputs);
    } catch (error) {
      triggerSnackbar.error(
        `Couldn't read the run's inputs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <>
      <EllipsisMenu
        iconName="ellipsisVertical"
        variant="ghost"
        size="xs"
        items={[
          { id: "open", text: "Open run", onClick: onOpen },
          {
            id: "rerun",
            text: "Re-run",
            disabled: blocker !== null,
            description: blocker ?? undefined,
            onClick: () => {
              void rerun();
            },
          },
        ]}
      />
      {ranInputs && (
        <RunFlowDialog
          webId={runner.webId}
          name={runner.editorState.flowDefinition.name}
          inputs={runner.editorState.flowDefinition.inputs}
          ranInputs={ranInputs}
          saveRefusedReason={runner.saveRefusedReason}
          onRun={runner.onRun}
          onClose={() => setRanInputs(null)}
        />
      )}
    </>
  );
};
