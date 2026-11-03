import { ApolloError, useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { entityIdFromComponents } from "@blockprotocol/type-system";
import { Banner, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  archiveFlowDefinitionMutation,
  updateFlowDefinitionMutation,
} from "../../../../../graphql/queries/knowledge/flow.queries";
import { getLayoutWithSidebar } from "../../../../../shared/layout";
import { HEADER_HEIGHT } from "../../../../../shared/layout/layout-with-header/page-header";
import { useSidebarContext } from "../../../../../shared/layout/layout-with-sidebar/page-sidebar";
import { DsComponentsScope } from "../../../../shared/ds-components-scope";
import { NotFound } from "../../../../shared/not-found";
import { useFlowDefinitionToEdit } from "../../../../shared/use-flow-definitions";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { Canvas } from "./edit.page/canvas";
import { FlowNotEditable } from "./edit.page/flow-not-editable";
import { LeftPanel } from "./edit.page/left-panel";
import { TopBar } from "./edit.page/top-bar";
import {
  FlowChangedElsewhereError,
  FlowSaveRefusedError,
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

const editorHeight = `calc(100vh - ${HEADER_HEIGHT}px)`;

const editorBody = css({ display: "flex", flex: "1", minHeight: "0" });
const canvasArea = css({ position: "relative", flex: "1" });
const notices = css({
  position: "absolute",
  zIndex: "docked",
  top: "4",
  left: "4",
  right: "4",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  maxWidth: "[560px]",
  mx: "auto",
});

/**
 * Collapses the app sidebar while the editor is open, and opens it again on leaving if it was open before. The
 * sidebar's state outlives the page, and its open and close functions change whenever it does.
 */
const useCollapsedSidebar = () => {
  const sidebar = useSidebarContext();
  const sidebarRef = useRef(sidebar);
  sidebarRef.current = sidebar;

  useEffect(() => {
    const wasOpen = sidebarRef.current.sidebarOpen;
    sidebarRef.current.closeSidebar();

    return () => {
      if (wasOpen) {
        sidebarRef.current.openSidebar();
      }
    };
  }, []);
};

const isConflictError = (error: unknown) =>
  error instanceof ApolloError &&
  error.graphQLErrors.some(({ extensions }) => extensions.code === "CONFLICT");

/** The API's reason for refusing a definition, e.g. because it would stop the flow's active schedules from running. */
const getRefusalReason = (error: unknown) =>
  error instanceof ApolloError
    ? error.graphQLErrors.find(
        ({ extensions }) => extensions.code === "BAD_REQUEST",
      )?.message
    : undefined;

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

  const {
    editor,
    status,
    saveRefusedReason,
    changedElsewhere,
    dismissChangedElsewhere,
    flush,
  } = useAutosavedFlowEditor({
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
        if (isConflictError(error)) {
          throw new FlowChangedElsewhereError();
        }

        const refusalReason = getRefusalReason(error);

        throw refusalReason === undefined
          ? error
          : new FlowSaveRefusedError(refusalReason);
      }
    },
    reloadFlow,
  });

  const { flowDefinition } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
  );

  const archiveFlow = async () => {
    /*
     * Saving first, so that no save is made after the flow is archived, which would be refused. Edits the API refused
     * can't be saved as they are, so they're dropped rather than keeping the flow from being archived.
     */
    if (!(await flush({ dropRefusedEdits: true }))) {
      throw new Error("Its latest edits couldn't be saved");
    }

    await archiveFlowDefinition({ variables: { flowDefinitionEntityId } });
    await router.push("/flows");
  };

  return (
    <DsComponentsScope
      sx={{ display: "flex", flexDirection: "column", height: editorHeight }}
    >
      <TopBar
        name={flowDefinition.name}
        saveStatus={status}
        editsRefused={saveRefusedReason !== null}
        onRetrySave={() => {
          void flush();
        }}
        onArchive={archiveFlow}
      />
      <div className={editorBody}>
        <LeftPanel steps={flowDefinition.steps} />
        <div className={canvasArea}>
          {(saveRefusedReason !== null || changedElsewhere) && (
            <div className={notices}>
              {saveRefusedReason !== null && (
                <Banner tone="error">
                  <Banner.Title>Your latest edits can't be saved</Banner.Title>
                  <Banner.Description as="div">
                    {saveRefusedReason.split("\n").map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </Banner.Description>
                </Banner>
              )}
              {changedElsewhere && (
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
              )}
            </div>
          )}
          <Canvas />
        </div>
      </div>
    </DsComponentsScope>
  );
};

const EditorLoading = () => (
  <DsComponentsScope
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: editorHeight,
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

  if (flow && !flow.userCanUpdate) {
    return <FlowNotEditable />;
  }

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

  useCollapsedSidebar();

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

FlowEditorPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true, grayBackground: false });

export default FlowEditorPage;
