import { useApolloClient } from "@apollo/client";

import { EllipsisMenu } from "@hashintel/ds-components";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { useSnackbar } from "../../../../../../../../components/hooks/use-snackbar";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../../graphql/api-types.gen";
import type { RunRow } from "../run-list";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

/** A run's ⋮: Open run, and Re-run, which reads the run's inputs for the run form, as in the run's top bar. */
export const RunMenu = ({
  row,
  rerunBlocker,
  onOpen,
  onRerun,
}: {
  row: RunRow;
  /** Why the flow can't be run, if it can't. */
  rerunBlocker: string | null;
  onOpen: () => void;
  onRerun: (flowInputs: FlowInputValues) => void;
}) => {
  const client = useApolloClient();
  const { triggerSnackbar } = useSnackbar();

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

      onRerun(data.getFlowRunById.flowInputs);
    } catch (error) {
      triggerSnackbar.error(
        `Couldn't read the run's inputs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <EllipsisMenu
      iconName="ellipsisVertical"
      variant="ghost"
      size="xs"
      items={[
        { id: "open", text: "Open run", onClick: onOpen },
        {
          id: "rerun",
          text: "Re-run",
          disabled: rerunBlocker !== null,
          description: rerunBlocker ?? undefined,
          onClick: () => {
            void rerun();
          },
        },
      ]}
    />
  );
};
