import { createContext, use, useEffect, useRef, useState } from "react";

import { Button, Menu, type MenuItem } from "@hashintel/ds-components";
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

import type { CodeEditorPlacement } from "../../react/state/user-settings-context";
import type { editor } from "monaco-editor";
import type { PropsWithChildren } from "react";

export const codeEditorPlacements: {
  value: CodeEditorPlacement;
  label: string;
}[] = [
  { value: "fullscreen", label: "Full screen" },
  { value: "properties", label: "Properties panel" },
  { value: "bottom", label: "Bottom dock" },
];

type CodeWorkspace = {
  enabled: boolean;
  entries: CodeEntry[];
  activePath: string | null;
  open: (path: string, placement?: CodeEditorPlacement) => void;
  close: () => void;
  retainModel: (model: editor.ITextModel | null) => void;
};

const CodeWorkspaceContext = createContext<CodeWorkspace>({
  enabled: false,
  entries: [],
  activePath: null,
  open: () => {},
  close: () => {},
  retainModel: () => {},
});

export const CodeWorkspaceProvider = ({ children }: PropsWithChildren) => {
  const { activeNet, activeSubnetId } = use(ActiveNetContext);
  const { petriNetDefinition, petriNetId, extensions } = use(SDCPNContext);
  const scope = `${petriNetId ?? "unsaved"}/${activeSubnetId ?? "root"}`;
  const [previousScope, setPreviousScope] = useState(scope);
  const { selectItem } = use(EditorContext);
  const {
    enableCodeEditorWorkspace,
    setCodeEditorPlacement,
    updateSubViewSection,
  } = use(UserSettingsContext);
  const { showSourceCode } = usePetrinautPresentation();
  const mutations = usePetrinautMutations();
  const [activePath, setActivePath] = useState<string | null>(null);
  const models = useRef(new Set<editor.ITextModel>());
  const entries = getCodeEntries(
    activeNet,
    petriNetDefinition,
    extensions,
    mutations,
  );
  const enabled = enableCodeEditorWorkspace && showSourceCode;
  const activeEntry = enabled
    ? entries.find((entry) => entry.path === activePath)
    : undefined;

  if (scope !== previousScope) {
    setPreviousScope(scope);
    setActivePath(null);
  }

  if (activePath !== null && !activeEntry) {
    setActivePath(null);
  }

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
        entries,
        activePath: activeEntry?.path ?? null,
        open: (path, placement) => {
          const entry = entries.find((candidate) => candidate.path === path);
          if (!enabled || !entry) return;
          if (placement) setCodeEditorPlacement(placement);
          selectItem(entry.selection);
          setActivePath(path);
        },
        close: () => {
          if (activeEntry) {
            if (activeEntry.selection.type === "transition") {
              updateSubViewSection(
                "transition-properties",
                activeEntry.label === "Transition kernel"
                  ? "transition-results"
                  : "transition-firing-time",
                { collapsed: false },
              );
            } else if (activeEntry.selection.type === "place") {
              updateSubViewSection("place-properties", "place-visualizer", {
                collapsed: false,
              });
            }
            selectItem(activeEntry.selection);
          }
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
  const { enabled, activePath, open, retainModel } = useCodeWorkspace();
  const expanded = props.path !== undefined && props.path === activePath;
  if (expanded) return null;
  return (
    <div className={inlineStyle}>
      {enabled && props.path && (
        <div className={inlineHeaderStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="expand"
            onClick={() => {
              if (props.path) open(props.path);
            }}
          >
            Open code editor
          </Button>
        </div>
      )}
      <div className={css({ flex: "[1]", minHeight: "[0]" })}>
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
  return entry ? (
    <CodeWorkspaceSurface
      entry={entry}
      entries={workspace.entries}
      onOpen={workspace.open}
      onClose={workspace.close}
      retainModel={workspace.retainModel}
      placements={codeEditorPlacements}
    />
  ) : null;
};

export const CodeWorkspaceMenu = () => {
  const { enabled, entries, open } = useCodeWorkspace();
  if (!enabled || entries.length === 0) return null;
  return (
    <Menu
      trigger={
        <Button
          size="sm"
          variant="subtle"
          iconName="code"
          aria-label="Open code"
        >
          Code
        </Button>
      }
      items={entries.map((entry) => ({
        id: entry.path,
        text: `${entry.owner} / ${entry.label}`,
        onClick: () => open(entry.path),
      }))}
    />
  );
};
