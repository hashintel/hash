import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";

import { Button, Dialog, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { useSnackbar } from "../../../../../../../components/hooks/use-snackbar";
import { cancelFlowMutation } from "../../../../../../../graphql/queries/knowledge/flow.queries";
import { generateRunViewPath } from "../run-path";
import { RunFlow } from "../shared/run-flow";
import { getShortRunId } from "../shared/run-id";
import { isRunGoing } from "../shared/run-state";

import type {
  CancelFlowMutation,
  CancelFlowMutationVariables,
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { FlowEditorState } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

const dialogText = css({ textStyle: "sm" });
const runMenu = css({ minWidth: "[208px]" });

const RunMenu = ({
  shortname,
  flowDefinitionEntityId,
  flowRunEntityId,
}: {
  shortname: string;
  flowDefinitionEntityId: EntityId;
  flowRunEntityId: EntityId;
}) => {
  const { triggerSnackbar } = useSnackbar();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${frontendUrl}${generateRunViewPath({ shortname, flowDefinitionEntityId, flowRunEntityId })}`,
      );
      triggerSnackbar.success("Copied the run's link");
    } catch {
      triggerSnackbar.error("Couldn't copy the run's link");
    }
  };

  return (
    <Menu
      position="bottom-end"
      className={runMenu}
      items={[
        {
          id: "copy-link",
          text: "Copy run link",
          icon: "copy",
          onClick: () => {
            void copyLink();
          },
        },
      ]}
      trigger={
        <Button
          variant="subtle"
          size="sm"
          iconName="ellipsisVertical"
          tooltip="More for this run"
        />
      }
    />
  );
};

/**
 * Stop, which asks first, while the run shown is going, and Re-run once it has ended, then the run's menu. It reads the
 * run that the run view polls, so it shows nothing until that has loaded.
 */
export const RunActions = ({
  webId,
  shortname,
  flowRunEntityId,
  flowDefinitionEntityId,
  editorState,
  saveRefusedReason,
  onRun,
}: {
  /** The web the flow is in, which a re-run is in too, and whose entities the form offers. */
  webId: WebId;
  /** The shortname of the web the flow is in, for the run's link. */
  shortname: string;
  flowRunEntityId: EntityId;
  flowDefinitionEntityId: EntityId;
  editorState: FlowEditorState;
  saveRefusedReason: string | null;
  onRun: (flowInputs: FlowInputValues) => Promise<void>;
}) => {
  const { triggerSnackbar } = useSnackbar();

  /* A run cached as running may have ended since, so Stop waits for its status from the network. */
  const { data, loading } = useQuery<
    GetFlowRunByIdQuery,
    GetFlowRunByIdQueryVariables
  >(getFlowRunById, {
    variables: { flowRunEntityId },
    fetchPolicy: "cache-and-network",
  });
  const run = data?.getFlowRunById;

  const [cancelFlow] = useMutation<
    CancelFlowMutation,
    CancelFlowMutationVariables
  >(cancelFlowMutation);

  const [confirmingStop, setConfirmingStop] = useState(false);
  /* A run takes a moment to stop, so Stop stays busy until the run's status changes. */
  const [stopping, setStopping] = useState(false);

  const stop = async () => {
    setConfirmingStop(false);
    setStopping(true);

    try {
      await cancelFlow({ variables: { flowRunEntityId } });
    } catch (error) {
      triggerSnackbar.error(
        `Couldn't stop the run: ${error instanceof Error ? error.message : String(error)}`,
      );
      setStopping(false);
    }
  };

  /* The run view says when a run is missing or of another flow, and neither can be stopped or re-run here. */
  if (!run || run.flowDefinitionEntityId !== flowDefinitionEntityId) {
    return null;
  }

  const runMenuButton = (
    <RunMenu
      shortname={shortname}
      flowDefinitionEntityId={flowDefinitionEntityId}
      flowRunEntityId={flowRunEntityId}
    />
  );

  if (isRunGoing(run.status)) {
    return (
      <>
        <Button
          variant="subtle"
          size="sm"
          iconName="stop"
          disabled={loading}
          loading={stopping}
          onClick={() => setConfirmingStop(true)}
        >
          Stop
        </Button>
        {runMenuButton}
        {confirmingStop && (
          <Dialog size="xs" onClose={() => setConfirmingStop(false)}>
            <Dialog.Header
              title={`Stop run ${getShortRunId(flowRunEntityId)}?`}
            />
            <Dialog.Body>
              <p className={dialogText}>
                Steps that are running are cancelled. Finished steps keep their
                outputs. A stopped run can't be resumed.
              </p>
            </Dialog.Body>
            <Dialog.Footer
              actions={
                <>
                  <Button
                    variant="subtle"
                    onClick={() => setConfirmingStop(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    tone="error"
                    onClick={() => {
                      void stop();
                    }}
                  >
                    Stop run
                  </Button>
                </>
              }
            />
          </Dialog>
        )}
      </>
    );
  }

  return (
    <>
      <RunFlow
        webId={webId}
        editorState={editorState}
        ranInputs={run.flowInputs}
        saveRefusedReason={saveRefusedReason}
        onRun={onRun}
      />
      {runMenuButton}
    </>
  );
};
