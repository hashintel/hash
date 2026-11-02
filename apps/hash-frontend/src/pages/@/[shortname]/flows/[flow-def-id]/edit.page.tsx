import { ApolloError, useMutation } from "@apollo/client";
import { Box, Stack } from "@mui/material";
import { useRouter } from "next/router";
import { useSyncExternalStore } from "react";

import { entityIdFromComponents } from "@blockprotocol/type-system";
import { Banner, LoadingSpinner } from "@hashintel/ds-components";

import {
  archiveFlowDefinitionMutation,
  updateFlowDefinitionMutation,
} from "../../../../../graphql/queries/knowledge/flow.queries";
import { getPlainLayout } from "../../../../../shared/layout";
import { DsComponentsScope } from "../../../../shared/ds-components-scope";
import { NotFound } from "../../../../shared/not-found";
import { useFlowDefinitionToEdit } from "../../../../shared/use-flow-definitions";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { Canvas } from "./edit.page/canvas";
import { LeftPanel } from "./edit.page/left-panel";
import { TopBar } from "./edit.page/top-bar";
import {
  FlowChangedElsewhereError,
  useAutosavedFlowEditor,
} from "./edit.page/use-autosaved-flow-editor";

import type {
  ArchiveFlowDefinitionMutation,
  ArchiveFlowDefinitionMutationVariables,
  UpdateFlowDefinitionMutation,
  UpdateFlowDefinitionMutationVariables,
} from "../../../../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../../../../shared/layout";
import type { FlowDefinitionToEdit } from "../../../../shared/use-flow-definitions";
import type { JsonObject } from "@blockprotocol/core";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";

const isConflictError = (error: unknown) =>
  error instanceof ApolloError &&
  error.graphQLErrors.some(({ extensions }) => extensions.code === "CONFLICT");

const FlowEditor = ({
  flowDefinitionEntityId,
  flow,
  reloadFlow,
}: {
  flowDefinitionEntityId: EntityId;
  flow: FlowDefinitionToEdit;
  reloadFlow: () => Promise<FlowDefinitionToEdit | null>;
}) => {
  const router = useRouter();

  const [updateFlowDefinition] = useMutation<
    UpdateFlowDefinitionMutation,
    UpdateFlowDefinitionMutationVariables
  >(updateFlowDefinitionMutation);

  const [archiveFlowDefinition] = useMutation<
    ArchiveFlowDefinitionMutation,
    ArchiveFlowDefinitionMutationVariables
  >(archiveFlowDefinitionMutation);

  const { editor, status, changedElsewhere, dismissChangedElsewhere, flush } =
    useAutosavedFlowEditor({
      flow,
      saveFlowDefinition: async (flowDefinition, expectedEditionId) => {
        try {
          const { data } = await updateFlowDefinition({
            variables: {
              flowDefinitionEntityId,
              expectedEditionId,
              /* A definition is plain JSON, but its types have no index signature to say so. */
              definition: flowDefinition as unknown as JsonObject,
            },
          });

          if (!data) {
            throw new Error("The flow wasn't saved");
          }

          return data.updateFlowDefinition.editionId;
        } catch (error) {
          throw isConflictError(error)
            ? new FlowChangedElsewhereError()
            : error;
        }
      },
      reloadFlow,
    });

  const { flowDefinition } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
  );

  const archiveFlow = async () => {
    /* Saving first, so that no save is made after the flow is archived, which would be refused. */
    await flush();
    await archiveFlowDefinition({ variables: { flowDefinitionEntityId } });
    await router.push("/flows");
  };

  return (
    <DsComponentsScope
      sx={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <TopBar
        name={flowDefinition.name}
        saveStatus={status}
        onRetrySave={() => {
          void flush();
        }}
        onArchive={archiveFlow}
      />
      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        <LeftPanel steps={flowDefinition.steps} />
        <Box sx={{ position: "relative", flex: 1 }}>
          {changedElsewhere && (
            <Box
              sx={{
                position: "absolute",
                zIndex: 10,
                top: 16,
                left: 16,
                right: 16,
                maxWidth: 560,
                mx: "auto",
              }}
            >
              <Banner
                tone="warning"
                dismissible={{ onDismiss: dismissChangedElsewhere }}
              >
                <Banner.Title>This flow changed elsewhere</Banner.Title>
                <Banner.Description>
                  It was saved from somewhere else, so it now shows the latest
                  version. Your latest edits weren't saved.
                </Banner.Description>
              </Banner>
            </Box>
          )}
          <Canvas />
        </Box>
      </Stack>
    </DsComponentsScope>
  );
};

const EditorLoading = () => (
  <DsComponentsScope
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
    }}
  >
    <LoadingSpinner size="lg" />
  </DsComponentsScope>
);

const FlowEditorLoader = ({
  flowDefinitionEntityId,
}: {
  flowDefinitionEntityId: EntityId;
}) => {
  const { flow, loading, reload } = useFlowDefinitionToEdit(
    flowDefinitionEntityId,
  );

  if (flow) {
    return (
      <FlowEditor
        flowDefinitionEntityId={flowDefinitionEntityId}
        flow={flow}
        reloadFlow={reload}
      />
    );
  }

  return loading ? <EditorLoading /> : <NotFound />;
};

/** Edits a flow definition, saving each edit as it's made. */
const FlowEditorPage: NextPageWithLayout = () => {
  const { query } = useRouter();

  /* The path has the uuid of the definition's entity, and its shortname names the web the definition is in. */
  const { loading, routeNamespace } = useRouteNamespace();

  if (!routeNamespace) {
    return loading ? <EditorLoading /> : <NotFound />;
  }

  const flowDefinitionEntityId = entityIdFromComponents(
    routeNamespace.webId,
    query["flow-def-id"] as EntityUuid,
  );

  return (
    <FlowEditorLoader
      key={flowDefinitionEntityId}
      flowDefinitionEntityId={flowDefinitionEntityId}
    />
  );
};

FlowEditorPage.getLayout = getPlainLayout;

export default FlowEditorPage;
