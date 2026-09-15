import { createContext, use, useEffect, useRef, useState } from "react";

import { Button, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../react";
import { ActiveNetContext } from "../../react/state/active-net-context";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { usePetrinautPresentation } from "../views/shared/presentation-context";
import { CodeEditor, type CodeEditorProps } from "./code-editor";
import { getCodeEntries, type CodeEntry } from "./code-workspace/entries";
import { CodeWorkspaceSurface } from "./code-workspace/surface";

import type { editor } from "monaco-editor";
import type { PropsWithChildren } from "react";

export type CodeEditorPlacement = "fullscreen" | "properties";

export const codeEditorPlacements: {
  value: CodeEditorPlacement;
  label: string;
}[] = [
  { value: "fullscreen", label: "Full screen" },
  { value: "properties", label: "Properties panel" },
];

type CodeWorkspace = {
  enabled: boolean;
  modelsReady: boolean;
  entries: CodeEntry[];
  activePath: string | null;
  placement: CodeEditorPlacement;
  open: (path: string, placement?: CodeEditorPlacement) => void;
  close: () => void;
  retainModel: (model: editor.ITextModel | null) => void;
};

const CodeWorkspaceContext = createContext<CodeWorkspace>({
  enabled: false,
  modelsReady: true,
  entries: [],
  activePath: null,
  placement: "properties",
  open: () => {},
  close: () => {},
  retainModel: () => {},
});

export const CodeWorkspaceProvider = ({ children }: PropsWithChildren) => {
  const { activeNet, activeSubnetId } = use(ActiveNetContext);
  const { petriNetDefinition, petriNetId, extensions } = use(SDCPNContext);
  const scope = `${petriNetId ?? "unsaved"}/${activeSubnetId ?? "root"}`;
  const [previousScope, setPreviousScope] = useState(scope);
  const [modelScope, setModelScope] = useState(scope);
  const { selectItem } = use(EditorContext);
  const { subViewPanels, updateSubViewSection } = use(UserSettingsContext);
  const { showSourceCode } = usePetrinautPresentation();
  const mutations = usePetrinautMutations();
  const [activePath, setActivePath] = useState<string | null>(null);
  const [placement, setPlacement] = useState<CodeEditorPlacement>("properties");
  const models = useRef(new Set<editor.ITextModel>());
  const entries = getCodeEntries(
    activeNet,
    petriNetDefinition,
    extensions,
    mutations,
  );
  const enabled = showSourceCode;
  const activeEntry = enabled
    ? entries.find((entry) => entry.path === activePath)
    : undefined;

  if (scope !== previousScope) {
    setPreviousScope(scope);
    setActivePath(null);
    setPlacement("properties");
  }

  if (activePath !== null && !activeEntry) {
    setActivePath(null);
    setPlacement("properties");
  }

  const showProperties = (entry: CodeEntry) => {
    if (entry.selection.type === "transition") {
      const sectionId =
        entry.label === "Transition kernel"
          ? "transition-results"
          : "transition-firing-time";
      updateSubViewSection("transition-properties", sectionId, {
        ...subViewPanels["transition-properties"]?.[sectionId],
        collapsed: false,
      });
    } else if (entry.selection.type === "place") {
      updateSubViewSection("place-properties", "place-visualizer", {
        ...subViewPanels["place-properties"]?.["place-visualizer"],
        collapsed: false,
      });
    }
    selectItem(entry.selection);
  };

  useEffect(() => {
    if (modelScope === scope) return;
    for (const model of models.current) {
      if (!model.isDisposed() && !model.isAttachedToEditor()) model.dispose();
    }
    models.current.clear();
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- mount new editors only after the previous scope's Monaco models are disposed
    setModelScope(scope);
  }, [modelScope, scope]);

  useEffect(() => {
    const retainedModels = models.current;
    return () => {
      // Monaco's editor must detach before its retained model is disposed.
      queueMicrotask(() => {
        for (const model of retainedModels) {
          if (!model.isDisposed() && !model.isAttachedToEditor())
            model.dispose();
        }
        retainedModels.clear();
      });
    };
  }, []);

  return (
    <CodeWorkspaceContext
      value={{
        enabled,
        modelsReady: modelScope === scope,
        entries,
        activePath: activeEntry?.path ?? null,
        placement,
        open: (path, nextPlacement = placement) => {
          const entry = entries.find((candidate) => candidate.path === path);
          if (!enabled || !entry) return;
          setPlacement(nextPlacement);
          showProperties(entry);
          setActivePath(path);
        },
        close: () => {
          if (activeEntry) {
            showProperties(activeEntry);
          }
          setPlacement("properties");
          setActivePath(null);
        },
        retainModel: (model) => {
          if (model) models.current.add(model);
        },
      }}
    >
      {children}
    </CodeWorkspaceContext>
  );
};

export const useCodeWorkspace = () => use(CodeWorkspaceContext);

export const useCodeEditorMenuItems = (path: string): MenuItem[] => {
  const { enabled, open } = useCodeWorkspace();
  return enabled
    ? codeEditorPlacements.map((placement) => ({
        id: `code-${placement.value}`,
        text: `Open in ${placement.label.toLowerCase()}`,
        onClick: () => open(path, placement.value),
      }))
    : [];
};

const inlineStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  height: "full",
});
const inlineHeaderStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  paddingBottom: "1",
});

export const SourceCodeEditor = (props: CodeEditorProps) => {
  const { enabled, modelsReady, activePath, placement, open, retainModel } =
    useCodeWorkspace();
  const expanded =
    placement === "fullscreen" &&
    props.path !== undefined &&
    props.path === activePath;
  if (expanded || !modelsReady) return null;
  return (
    <div className={inlineStyle}>
      {enabled && props.path && (
        <div className={inlineHeaderStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="expand"
            onClick={() => {
              if (props.path) open(props.path, "fullscreen");
            }}
          >
            Full screen
          </Button>
        </div>
      )}
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          flex: "[1]",
          minHeight: "[0]",
        })}
      >
        <CodeEditor
          {...props}
          keepCurrentModel={enabled || props.keepCurrentModel}
          onMount={(instance, monaco) => {
            retainModel(instance.getModel());
            instance.onDidChangeModel(() => retainModel(instance.getModel()));
            props.onMount?.(instance, monaco);
          }}
        />
      </div>
    </div>
  );
};

export const CodeWorkspacePanel = () => {
  const workspace = useCodeWorkspace();
  const entry = workspace.entries.find(
    (candidate) => candidate.path === workspace.activePath,
  );
  return entry &&
    workspace.modelsReady &&
    workspace.placement === "fullscreen" ? (
    <CodeWorkspaceSurface
      entry={entry}
      entries={workspace.entries}
      onOpen={workspace.open}
      onClose={workspace.close}
      retainModel={workspace.retainModel}
    />
  ) : null;
};
