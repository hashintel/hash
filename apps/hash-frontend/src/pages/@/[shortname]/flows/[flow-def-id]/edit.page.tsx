import { ApolloError, useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  entityIdFromComponents,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { generateFlowEditorPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

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
import { useFlowSchedules } from "../../../../shared/use-flow-schedules";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { Canvas } from "./edit.page/canvas";
import { FlowNotEditable } from "./edit.page/flow-not-editable";
import { LeftPanel } from "./edit.page/left-panel";
import { LogsView } from "./edit.page/logs-view";
import { generateRunViewPath, parseRunParam } from "./edit.page/run-path";
import { RunView } from "./edit.page/run-view";
import { SaveBanners } from "./edit.page/save-banners";
import { findStep } from "./edit.page/shared/find-step";
import { toScheduleTriggerRow } from "./edit.page/shared/flow-triggers";
import { editorRunDataSources } from "./edit.page/shared/run-form";
import { sidePanelWidth } from "./edit.page/shared/side-panel";
import { useFlowRuns } from "./edit.page/shared/use-flow-runs";
import { StepPanel } from "./edit.page/step-panel";
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
import type { CanvasHandle, CanvasSelection } from "./edit.page/canvas";
import type { FlowSchedules } from "./edit.page/shared/flow-triggers";
import type { StepPanelSubject } from "./edit.page/step-panel";
import type { FlowEditorView } from "./edit.page/top-bar";
import type { JsonObject } from "@blockprotocol/core";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

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

/** The API's refusal of a definition, e.g. because it would stop the flow's active schedules from running. */
const getRefusal = (error: unknown) =>
  error instanceof ApolloError
    ? error.graphQLErrors.find(
        ({ extensions }) => extensions.code === "BAD_REQUEST",
      )
    : undefined;

const noSelection: CanvasSelection = {
  stepIds: [],
  start: false,
  trigger: null,
};

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
    saveRefusal,
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

        const refusal = getRefusal(error);

        throw refusal === undefined
          ? error
          : new FlowSaveRefusedError(refusal.message, {
              blockedBySchedules:
                refusal.extensions.blockedBySchedules === true,
            });
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

  const {
    schedulesByEntityUuid,
    loaded: schedulesLoaded,
    error: schedulesError,
  } = useFlowSchedules({ flowDefinitionEntityId });
  /* A flow isn't shown as having no schedules before that's known. */
  const schedules = useMemo(
    (): FlowSchedules =>
      schedulesLoaded
        ? Array.from(schedulesByEntityUuid.values(), toScheduleTriggerRow)
        : schedulesError
          ? "unavailable"
          : "loading",
    [schedulesByEntityUuid, schedulesLoaded, schedulesError],
  );

  /*
   * Replacing the editor after a conflict remounts the run form and the canvas, e.g. closing a run form filled in for
   * the flow as it was, and clears the selection.
   */
  const [session, setSession] = useState<{
    editor: typeof editor;
    key: number;
    selection: CanvasSelection;
    focusRequest: { stepId: string } | null;
  }>({ editor, key: 0, selection: noSelection, focusRequest: null });

  if (session.editor !== editor) {
    setSession({
      editor,
      key: session.key + 1,
      selection: noSelection,
      focusRequest: null,
    });
  }

  const { selection, focusRequest } = session;
  const canvasRef = useRef<CanvasHandle>(null);
  const setSelection = (nextSelection: CanvasSelection) =>
    setSession((current) => ({ ...current, selection: nextSelection }));

  const [selectedStepId] = selection.stepIds;
  const selectedCount =
    selection.stepIds.length +
    (selection.start ? 1 : 0) +
    (selection.trigger === null ? 0 : 1);
  /* Only one thing selected opens a panel. */
  const panelSubject: StepPanelSubject | null =
    selectedCount !== 1
      ? null
      : selection.trigger !== null
        ? { triggers: true }
        : selection.start
          ? { start: true }
          : /* A selection can briefly outlive its step, e.g. one just deleted: no panel then. */
            selectedStepId !== undefined &&
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

  /* Selects one step and brings it into view on the canvas. A step in a collapsed for-each step isn't drawn, so the
   * for-each step is expanded first. */
  const selectAndFocusStep = (stepId: string) => {
    const collapsedParent = flowDefinition.steps.find(
      (step) =>
        step.kind === "for-each" &&
        collapsedStepIds.has(step.stepId) &&
        findStep(step.steps, stepId),
    );

    if (collapsedParent) {
      toggleCollapsed(collapsedParent.stepId);
    }

    setSession((current) => ({
      ...current,
      selection: { ...noSelection, stepIds: [stepId] },
      focusRequest: { stepId },
    }));
  };

  /* The web the flow is in, which the editor's path names. */
  const webId = extractWebIdFromEntityId(flowDefinitionEntityId);
  const getRunPath = (flowRunEntityId: EntityId) =>
    generateRunViewPath({ shortname, flowDefinitionEntityId, flowRunEntityId });

  /* As a run in Logs opens, so Back returns to the run shown before. */
  const openRun = (flowRunEntityId: EntityId) => {
    void router.push(getRunPath(flowRunEntityId), undefined, { shallow: true });
  };

  /* A run starts the flow as saved, so the edits not saved yet are saved first. */
  const runFlow = async (flowInputs: FlowInputValues) => {
    if (!(await flush())) {
      throw new Error("Your latest edits couldn't be saved.");
    }

    const { data } = await startFlow({
      variables: {
        flowDefinitionEntityId,
        flowInputs,
        webId,
        dataSources: editorRunDataSources,
      },
    });

    if (!data) {
      throw new Error("The run didn't start.");
    }

    await router.push(getRunPath(data.startFlow), undefined, {
      shallow: true,
    });
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

  /* In the URL, so a view or a run can be linked to and Back returns to the one before. */
  const view: FlowEditorView = router.query.view === "logs" ? "logs" : "editor";
  const flowRunEntityId =
    view === "logs"
      ? parseRunParam(router.query.run, flowDefinitionEntityId)
      : null;
  /* One read of the flow's runs for the Logs table and the run switcher, so they agree. */
  const { flowRuns, retry: retryFlowRuns } = useFlowRuns(
    view === "logs" ? flowDefinitionEntityId : null,
  );
  const showView = (nextView: FlowEditorView) => {
    const editorPath = generateFlowEditorPath({
      shortname,
      flowDefinitionEntityId,
    });

    void router.push(
      nextView === "logs" ? `${editorPath}?view=logs` : editorPath,
      undefined,
      { shallow: true },
    );
  };

  const leaveWithoutSaving = () => {
    discardUnsavedEdits();
    void router.push("/flows");
  };

  /* In every view, as an edit made in one can be refused, or overwritten, after another opens. */
  const saveBanners =
    saveRefusal !== null || changedElsewhere ? (
      <SaveBanners
        flowDefinitionEntityId={flowDefinitionEntityId}
        saveRefusal={saveRefusal}
        onSaveAgain={() => {
          void flush();
        }}
        changedElsewhere={changedElsewhere}
        onDismissChangedElsewhere={dismissChangedElsewhere}
      />
    ) : null;

  return (
    <DsComponentsScope
      sx={{ display: "flex", flexDirection: "column", height: editorHeight }}
    >
      <TopBar
        editorKey={session.key}
        webId={webId}
        shortname={shortname}
        editorState={editorState}
        flowDefinitionEntityId={flowDefinitionEntityId}
        view={view}
        flowRunEntityId={flowRunEntityId}
        flowRuns={flowRuns}
        onViewChange={showView}
        onOpenRun={openRun}
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
      {view === "logs" ? (
        flowRunEntityId ? (
          <RunView
            key={flowRunEntityId}
            flowRunEntityId={flowRunEntityId}
            flowDefinitionEntityId={flowDefinitionEntityId}
            currentDefinition={flowDefinition}
            schedules={schedules}
            notices={saveBanners}
            onBackToLogs={() => showView("logs")}
          />
        ) : (
          <LogsView
            flowRuns={flowRuns}
            notices={saveBanners}
            onRetry={retryFlowRuns}
            getRunPath={getRunPath}
            runner={{
              webId,
              editorState,
              saveRefusedReason,
              onRun: runFlow,
            }}
          />
        )
      ) : (
        <div className={editorBody}>
          <LeftPanel
            flowDefinition={flowDefinition}
            selectedStepIds={selection.stepIds}
            onStepClick={selectAndFocusStep}
            collapsedGroupIds={collapsedStepIds}
            onToggleGroup={toggleCollapsed}
            onCollapseAll={(stepIds) => setCollapsedStepIds(new Set(stepIds))}
            onAddStep={(actionDefinitionId) =>
              canvasRef.current?.addStepInView(actionDefinitionId)
            }
          />
          <div className={canvasArea}>
            {saveBanners && (
              <div
                className={notices}
                style={
                  panelSubject ? { right: sidePanelWidth + 16 } : undefined
                }
              >
                {saveBanners}
              </div>
            )}
            <Canvas
              key={session.key}
              ref={canvasRef}
              editor={editor}
              selectedStepIds={selection.stepIds}
              startSelected={selection.start}
              selectedTrigger={selection.trigger}
              onSelectionChange={setSelection}
              focusRequest={focusRequest}
              collapsedStepIds={collapsedStepIds}
              onToggleCollapsed={toggleCollapsed}
              coveredRight={panelSubject ? sidePanelWidth : 0}
              schedules={schedules}
            />
            {panelSubject && (
              <StepPanel
                editor={editor}
                flowDefinitionEntityId={flowDefinitionEntityId}
                subject={panelSubject}
                schedules={schedules}
                onSelectStart={() =>
                  setSelection({ ...noSelection, start: true })
                }
                onSelectStep={selectAndFocusStep}
              />
            )}
          </div>
        </div>
      )}
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
