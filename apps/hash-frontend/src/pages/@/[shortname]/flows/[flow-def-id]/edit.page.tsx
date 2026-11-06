import { ApolloError, useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  entityIdFromComponents,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { Banner, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useSnackbar } from "../../../../../components/hooks/use-snackbar";
import {
  archiveFlowDefinitionMutation,
  startFlowMutation,
  updateFlowDefinitionMutation,
} from "../../../../../graphql/queries/knowledge/flow.queries";
import { getLayoutWithSidebar } from "../../../../../shared/layout";
import { HEADER_HEIGHT } from "../../../../../shared/layout/layout-with-header/page-header";
import { useSidebarContext } from "../../../../../shared/layout/layout-with-sidebar/page-sidebar";
import { DsComponentsScope } from "../../../../shared/ds-components-scope";
import { NotFound } from "../../../../shared/not-found";
import {
  flowDefinitionsQuery,
  useFlowDefinitionToEdit,
} from "../../../../shared/use-flow-definitions";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { Canvas } from "./edit.page/canvas";
import { FlowNotEditable } from "./edit.page/flow-not-editable";
import { LeftPanel } from "./edit.page/left-panel";
import { StepPanel, stepPanelWidth } from "./edit.page/step-panel";
import { findStep } from "./edit.page/step-panel/shared/find-step";
import { TopBar } from "./edit.page/top-bar";
import {
  FlowChangedElsewhereError,
  FlowSaveRefusedError,
  useAutosavedFlowEditor,
} from "./edit.page/use-autosaved-flow-editor";

import type {
  ArchiveFlowDefinitionMutation,
  ArchiveFlowDefinitionMutationVariables,
  StartFlowMutation,
  StartFlowMutationVariables,
  UpdateFlowDefinitionMutation,
  UpdateFlowDefinitionMutationVariables,
} from "../../../../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../../../../shared/layout";
import type { FlowDefinitionToEdit } from "../../../../shared/use-flow-definitions";
import type { CanvasHandle } from "./edit.page/canvas";
import type { StepPanelSubject } from "./edit.page/step-panel";
import type { JsonObject } from "@blockprotocol/core";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type {
  FlowDataSources,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";

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

/**
 * The API requires data sources to run a flow with an AI action. Nothing in the editor picks files or turns on internet
 * access, so a run from it has neither.
 */
const editorRunDataSources: FlowDataSources = {
  files: { fileEntityIds: [] },
  internetAccess: {
    enabled: false,
    browserPlugin: { enabled: false, domains: [] },
  },
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
  shortname,
  flow,
  reloadFlow,
}: {
  flowDefinitionEntityId: EntityId;
  /** The shortname of the web the flow is in, for the paths of its runs. */
  shortname: string;
  flow: FlowDefinitionToEdit;
  reloadFlow: () => Promise<FlowDefinitionToEdit | null>;
}) => {
  const router = useRouter();
  const { triggerSnackbar } = useSnackbar();

  const [updateFlowDefinition] = useMutation<
    UpdateFlowDefinitionMutation,
    UpdateFlowDefinitionMutationVariables
  >(updateFlowDefinitionMutation);

  const [startFlow] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

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
    discardUnsavedEdits,
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
    onLeftUnsaved: () => {
      triggerSnackbar.error(
        `Your latest edits to “${editor.getState().flowDefinition.name}” couldn't be saved`,
      );
    },
  });

  const editorState = useSyncExternalStore(editor.subscribe, editor.getState);
  const { flowDefinition } = editorState;

  /*
   * Replacing the editor after a conflict remounts the top bar and the canvas, e.g. closing a run form filled in for the
   * flow as it was, and clears the selection.
   */
  const [session, setSession] = useState<{
    editor: typeof editor;
    key: number;
    selectedStepIds: string[];
    startSelected: boolean;
    focusRequest: { stepId: string } | null;
  }>({
    editor,
    key: 0,
    selectedStepIds: [],
    startSelected: false,
    focusRequest: null,
  });

  if (session.editor !== editor) {
    setSession({
      editor,
      key: session.key + 1,
      selectedStepIds: [],
      startSelected: false,
      focusRequest: null,
    });
  }

  const { selectedStepIds, startSelected, focusRequest } = session;
  const canvasRef = useRef<CanvasHandle>(null);
  const setSelection = ({
    stepIds,
    start,
  }: {
    stepIds: string[];
    start: boolean;
  }) =>
    setSession((current) => ({
      ...current,
      selectedStepIds: stepIds,
      startSelected: start,
    }));

  const [selectedStepId] = selectedStepIds;
  const panelSubject: StepPanelSubject | null =
    startSelected && selectedStepIds.length === 0
      ? { start: true }
      : /* A selection can briefly outlive its step, e.g. one just deleted: no panel then. */
        !startSelected &&
          selectedStepId !== undefined &&
          selectedStepIds.length === 1 &&
          findStep(flowDefinition.steps, selectedStepId)
        ? { stepId: selectedStepId }
        : null;

  /* For-each steps collapsed in the Steps tab and on the canvas. */
  const [collapsedStepIds, setCollapsedStepIds] = useState(
    () => new Set<string>(),
  );
  const toggleCollapsed = (stepId: string) =>
    setCollapsedStepIds((collapsed) => {
      const next = new Set(collapsed);

      if (!next.delete(stepId)) {
        next.add(stepId);
      }

      return next;
    });

  /* A run starts the flow as saved, so the edits not saved yet are saved first. */
  const runFlow = async (flowInputs: FlowInputValues) => {
    if (!(await flush())) {
      throw new Error("Your latest edits couldn't be saved.");
    }

    const { data } = await startFlow({
      variables: {
        flowDefinitionEntityId,
        flowInputs,
        /* The web the flow is in, which the editor's path names. */
        webId: extractWebIdFromEntityId(flowDefinitionEntityId),
        dataSources: editorRunDataSources,
      },
    });

    if (!data) {
      throw new Error("The run didn't start.");
    }

    await router.push(
      generateWorkerRunPath({ shortname, flowRunEntityId: data.startFlow }),
    );
  };

  const archiveFlow = async () => {
    /*
     * Saving first, so that no save is made after the flow is archived, which would be refused. Edits the API refused
     * can't be saved as they are, so they don't keep the flow from being archived, and are dropped once it is.
     */
    if (!(await flush({ acceptRefusedEdits: true }))) {
      throw new Error("Its latest edits couldn't be saved");
    }

    await archiveFlowDefinition({
      variables: { flowDefinitionEntityId },
      refetchQueries: [flowDefinitionsQuery],
      awaitRefetchQueries: true,
    });
    discardUnsavedEdits();
    await router.push("/flows");
  };

  const leave = async () => {
    if (!(await flush())) {
      return false;
    }

    void router.push("/flows");
    return true;
  };

  const leaveWithoutSaving = () => {
    discardUnsavedEdits();
    void router.push("/flows");
  };

  return (
    <DsComponentsScope
      sx={{ display: "flex", flexDirection: "column", height: editorHeight }}
    >
      <TopBar
        key={session.key}
        editorState={editorState}
        onRename={editor.setName}
        saveStatus={status}
        saveRefusedReason={saveRefusedReason}
        onRetrySave={() => {
          void flush();
        }}
        onRun={runFlow}
        onArchive={archiveFlow}
        onLeave={leave}
        onLeaveWithoutSaving={leaveWithoutSaving}
      />
      <div className={editorBody}>
        <LeftPanel
          steps={flowDefinition.steps}
          selectedStepIds={selectedStepIds}
          onStepClick={(stepId) =>
            setSession((current) => ({
              ...current,
              selectedStepIds: [stepId],
              startSelected: false,
              focusRequest: { stepId },
            }))
          }
          collapsedGroupIds={collapsedStepIds}
          onToggleGroup={toggleCollapsed}
          onCollapseAll={(stepIds) => setCollapsedStepIds(new Set(stepIds))}
          onAddStep={(actionDefinitionId) =>
            canvasRef.current?.addStepInView(actionDefinitionId)
          }
        />
        <div className={canvasArea}>
          {(saveRefusedReason !== null || changedElsewhere) && (
            <div
              className={notices}
              style={panelSubject ? { right: stepPanelWidth + 16 } : undefined}
            >
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
          <Canvas
            key={session.key}
            ref={canvasRef}
            editor={editor}
            selectedStepIds={selectedStepIds}
            startSelected={startSelected}
            onSelectionChange={setSelection}
            focusRequest={focusRequest}
            collapsedStepIds={collapsedStepIds}
            onToggleCollapsed={toggleCollapsed}
            coveredRight={panelSubject ? stepPanelWidth : 0}
          />
          {panelSubject && (
            <StepPanel
              editor={editor}
              subject={panelSubject}
              onSelectStart={() => setSelection({ stepIds: [], start: true })}
            />
          )}
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
  shortname,
}: {
  flowDefinitionEntityId: EntityId;
  shortname: string;
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
        shortname={shortname}
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

  if (!routeNamespace?.shortname) {
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
      shortname={routeNamespace.shortname}
    />
  );
};

FlowEditorPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true, grayBackground: false });

export default FlowEditorPage;
