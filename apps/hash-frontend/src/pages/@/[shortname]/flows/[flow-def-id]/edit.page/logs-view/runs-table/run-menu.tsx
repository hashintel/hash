import { useApolloClient } from "@apollo/client";
import { useState } from "react";

import { Button, Menu } from "@hashintel/ds-components";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { useSnackbar } from "../../../../../../../../components/hooks/use-snackbar";
import { isInTab } from "../run-list";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../../graphql/api-types.gen";
import type { RunRow } from "../run-list";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

/**
 * A run's ⋮: Open run, and Re-run, which reads the run's inputs for the run form, as in the run's top bar. As there,
 * a run that hasn't ended can't be re-run.
 */
export const RunMenu = ({
  row,
  rerunBlocker,
  onOpen,
  onRerunPick,
  onRerun,
}: {
  row: RunRow;
  /** Why the flow can't be run, if it can't. */
  rerunBlocker: string | null;
  onOpen: () => void;
  /** Called when Re-run is picked, before the run's inputs are read. */
  onRerunPick: () => void;
  onRerun: (flowInputs: FlowInputValues) => void;
}) => {
  const client = useApolloClient();
  const { triggerSnackbar } = useSnackbar();
  /* The ⋮ spins while the run's inputs are read. */
  const [reading, setReading] = useState(false);
  const blocker = isInTab(row, "running")
    ? "This run hasn't ended yet"
    : rerunBlocker;

  /* The table's runs don't carry their inputs. */
  const rerun = async () => {
    onRerunPick();
    setReading(true);

    try {
      const { data } = await client.query<
        GetFlowRunByIdQuery,
        GetFlowRunByIdQueryVariables
      >({
        query: getFlowRunById,
        variables: { flowRunEntityId: row.flowRunEntityId },
      });

      onRerun(data.getFlowRunById.flowInputs);
    } catch (error) {
      triggerSnackbar.error(
        `Couldn't read the run's inputs: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setReading(false);
    }
  };

  return (
    <Menu
      position="bottom-end"
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
      trigger={
        <Button
          size="xs"
          variant="ghost"
          iconName="ellipsisVertical"
          loading={reading}
          aria-label={`Run ${row.shortId} actions`}
        />
      }
    />
  );
};
