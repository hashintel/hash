import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { generateFlowEditorPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useSnackbar } from "../../components/hooks/use-snackbar";
import { createFlowDefinitionMutation } from "../../graphql/queries/knowledge/flow.queries";
import { DsComponentsScope } from "../shared/ds-components-scope";
import { useActiveWorkspace } from "../shared/workspace-context";

import type {
  CreateFlowDefinitionMutation,
  CreateFlowDefinitionMutationVariables,
} from "../../graphql/api-types.gen";
import type { JsonObject } from "@blockprotocol/core";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** A flow with nothing in it yet. It isn't valid until it has steps, which is fine: an invalid flow can be saved. */
const newFlowDefinition: FlowDefinition<string> = {
  name: "Untitled flow",
  description: "",
  inputs: [],
  steps: [],
  outputs: [],
};

/**
 * Creates a flow in the active web and opens it in the editor.
 */
export const NewFlowButton = () => {
  const router = useRouter();
  const { activeWorkspace, activeWorkspaceWebId } = useActiveWorkspace();
  const { triggerSnackbar } = useSnackbar();

  const [createFlowDefinition] = useMutation<
    CreateFlowDefinitionMutation,
    CreateFlowDefinitionMutationVariables
  >(createFlowDefinitionMutation);

  /* Until the editor opens, not only until the flow is created, so that a second click doesn't create another. */
  const [creating, setCreating] = useState(false);

  const shortname = activeWorkspace?.shortname;

  const createFlow = async () => {
    if (!activeWorkspaceWebId || !shortname) {
      return;
    }

    setCreating(true);

    try {
      const { data } = await createFlowDefinition({
        variables: {
          webId: activeWorkspaceWebId,
          /* A definition is plain JSON, but its types have no index signature to say so. */
          definition: newFlowDefinition as unknown as JsonObject,
        },
      });

      if (data) {
        await router.push(
          generateFlowEditorPath({
            shortname,
            flowDefinitionEntityId:
              data.createFlowDefinition.flowDefinitionEntityId,
          }),
        );
      }
    } catch (error) {
      triggerSnackbar.error(`Couldn't create the flow: ${String(error)}`);
      setCreating(false);
    }
  };

  return (
    <DsComponentsScope sx={{ display: "contents" }}>
      <Button
        variant="solid"
        tone="brand"
        size="md"
        iconName="plus"
        loading={creating}
        disabled={!activeWorkspaceWebId || !shortname}
        onClick={() => {
          void createFlow();
        }}
      >
        New flow
      </Button>
    </DsComponentsScope>
  );
};
