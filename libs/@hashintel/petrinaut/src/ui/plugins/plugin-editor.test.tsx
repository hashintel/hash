/** @vitest-environment jsdom */
import { act, cleanup, screen } from "@testing-library/react";
import { type ReactNode, use, useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../react/lsp/context";
import {
  defaultPetrinautNavigationState,
  type PetrinautNavigationIntent,
} from "../../react/navigation";
import { EditorContext } from "../../react/state/editor-context";
import { useStore } from "../../react/use-store";
import {
  definePetrinautPlugin,
  pluginService,
  type PluginHook,
} from "./define-petrinaut-plugin";
import { useCanvasRegistration } from "./plugin-editor";
import { usePluginService } from "./plugins-provider";
import { renderPlugins } from "./plugins-test-harness";

import type { CanvasController } from "../views/SDCPN/canvas-renderer";
import type { PluginDocument, PluginEditor } from "./plugin-access";
import type {
  Diagnostic,
  DiagnosticsSnapshot,
} from "@hashintel/petrinaut-core";

const place = {
  id: "p1",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

const DocumentPlugin = definePetrinautPlugin({
  id: "test.document",
  name: "Document",
  access: { document: "write" },
  provides: pluginService<PluginDocument>(),
});

const useDocumentPlugin: PluginHook<typeof DocumentPlugin> = (api) => ({
  provides: api.document,
});

const documentPlugin = DocumentPlugin(useDocumentPlugin);

const EditorPlugin = definePetrinautPlugin({
  id: "test.editor",
  name: "Editor",
  access: { editor: "write" },
  provides: pluginService<PluginEditor>(),
});

const useEditorPlugin: PluginHook<typeof EditorPlugin> = (api) => ({
  provides: api.editor,
});

const editorPlugin = EditorPlugin(useEditorPlugin);

/** What the view's probe last saw: the plugins' services and the editor's mode setter. */
const probe: {
  document?: PluginDocument;
  editor?: PluginEditor;
  setGlobalMode?: (mode: "edit" | "simulate") => void;
} = {};

const Probe = () => {
  const document = usePluginService(DocumentPlugin);
  const editor = usePluginService(EditorPlugin);
  const { setGlobalMode } = use(EditorContext);
  useLayoutEffect(() => {
    probe.document = document;
    probe.editor = editor;
    probe.setGlobalMode = setGlobalMode;
  });

  return null;
};

const editorOf = () => {
  if (!probe.editor) {
    throw new Error("The editor plugin has not published yet.");
  }

  return probe.editor;
};

const documentOf = () => {
  if (!probe.document) {
    throw new Error("The document plugin has not published yet.");
  }

  return probe.document;
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe("plugin editor", () => {
  it("refuses a structural edit in Simulate mode and applies a scenario edit", () => {
    const { instance } = renderPlugins([documentPlugin], <Probe />);
    act(() => probe.setGlobalMode?.("simulate"));

    expect(documentOf().edit.addPlace(place)).toEqual({
      applied: false,
      reason: { kind: "simulate-mode" },
    });
    expect(
      documentOf().edit.addScenario({
        id: "scenario-1",
        name: "Default",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      }),
    ).toEqual({ applied: true, value: undefined });
    expect(instance.definition.get().places).toHaveLength(0);
    expect(instance.definition.get().scenarios).toHaveLength(1);
  });

  it("reports why each edit would be refused, as the edits do, and wakes a subscriber only when that changes", () => {
    renderPlugins([documentPlugin], <Probe />);
    const { refusals } = documentOf();
    expect(refusals.get()).toMatchObject({
      addPlace: null,
      addScenario: null,
      applyAutoLayout: null,
      setTitle: { kind: "no-title-setter" },
    });
    const listener = vi.fn();
    refusals.subscribe(listener);

    act(() => probe.setGlobalMode?.("simulate"));
    expect(listener).toHaveBeenCalledOnce();
    expect(refusals.get()).toMatchObject({
      addPlace: { kind: "simulate-mode" },
      addScenario: null,
      applyAutoLayout: { kind: "simulate-mode" },
    });
    expect(documentOf().edit.addPlace(place)).toEqual({
      applied: false,
      reason: refusals.get().addPlace,
    });

    act(() => probe.setGlobalMode?.("edit"));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(refusals.get().addPlace).toBeNull();
  });

  it("refuses a title without a host setter, or while the editor is read-only", () => {
    renderPlugins([documentPlugin], <Probe />);
    expect(documentOf().setTitle("Renamed")).toEqual({
      applied: false,
      reason: { kind: "no-title-setter" },
    });
    cleanup();

    const setTitle = vi.fn();
    renderPlugins([documentPlugin], <Probe />, { netManagement: { setTitle } });
    act(() => probe.setGlobalMode?.("simulate"));
    expect(documentOf().setTitle("Renamed")).toEqual({
      applied: false,
      reason: { kind: "simulate-mode" },
    });

    act(() => probe.setGlobalMode?.("edit"));
    expect(documentOf().setTitle("Renamed")).toEqual({
      applied: true,
      value: undefined,
    });
    expect(setTitle).toHaveBeenCalledWith("Renamed");
  });

  it("frames the net after the layout applies", async () => {
    const frame = vi.fn(() => Promise.resolve("framed" as const));
    const Canvas = () => {
      const { registerController } = useCanvasRegistration();
      useLayoutEffect(() => {
        registerController({
          frameSceneAfterRender: frame,
        } as Partial<CanvasController> as CanvasController);
      }, [registerController]);

      return null;
    };
    const { instance } = renderPlugins(
      [documentPlugin],
      <>
        <Probe />
        <Canvas />
      </>,
    );
    const layout = deferred<{ commitCount: number }>();
    vi.spyOn(instance.commands, "applyAutoLayout").mockReturnValue(
      layout.promise,
    );

    const result = documentOf().edit.applyAutoLayout();
    await Promise.resolve();
    expect(frame).not.toHaveBeenCalled();

    layout.resolve({ commitCount: 2 });
    expect(await result).toEqual({
      applied: true,
      value: { commitCount: 2 },
    });
    expect(frame).toHaveBeenCalledOnce();
  });

  it("returns the net it checked, which tells a caller the document changed meanwhile", async () => {
    const diagnostics = deferred<DiagnosticsSnapshot>();
    const requestDiagnostics = vi.fn(() => diagnostics.promise);
    const FakeLanguageClient = ({ children }: { children: ReactNode }) => (
      <LanguageClientContext
        value={{ ...use(LanguageClientContext), requestDiagnostics }}
      >
        {children}
      </LanguageClientContext>
    );
    renderPlugins([documentPlugin], <Probe />, { Around: FakeLanguageClient });
    const checked = documentOf().net.get();

    const result = documentOf().diagnose();
    documentOf().edit.addPlace(place);
    diagnostics.resolve({ byUri: new Map(), total: 0, errorCount: 0 });
    const { net } = await result;

    expect(requestDiagnostics).toHaveBeenCalledWith(
      checked,
      documentOf().extensions,
    );
    expect(net).toBe(checked);
    expect(net).not.toBe(documentOf().net.get());
  });

  it("follows the editor's diagnostics and wakes a subscriber only when they change", () => {
    const published = createReadableStore<DiagnosticsSnapshot>({
      byUri: new Map(),
      total: 0,
      errorCount: 0,
    });
    const FakeLanguageClient = ({ children }: { children: ReactNode }) => (
      <LanguageClientContext
        value={{
          ...use(LanguageClientContext),
          diagnostics: useStore(published),
        }}
      >
        {children}
      </LanguageClientContext>
    );
    renderPlugins([documentPlugin], <Probe />, { Around: FakeLanguageClient });
    const seen: DiagnosticsSnapshot[] = [];
    documentOf().diagnostics.subscribe((snapshot) => seen.push(snapshot));
    expect(documentOf().diagnostics.get()).toBe(published.get());

    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: "Cannot find name 'x'.",
      severity: 1,
    };
    const next: DiagnosticsSnapshot = {
      byUri: new Map([
        ["inmemory://sdcpn/transitions/t1/lambda.ts", [diagnostic]],
      ]),
      total: 1,
      errorCount: 1,
    };
    act(() => published.set(next));
    expect(documentOf().diagnostics.get()).toBe(next);

    // The editor renders again with the same snapshot.
    act(() => probe.setGlobalMode?.("simulate"));
    expect(seen).toEqual([next]);
  });

  it("reads where the editor is, wakes a subscriber only when it moves, and moves it", () => {
    const { instance } = renderPlugins([editorPlugin], <Probe />);
    const seen: string[] = [];
    editorOf().navigation.subscribe((state) => seen.push(state.mode));
    expect(editorOf().navigation.get().mode).toBe("edit");

    act(() => probe.setGlobalMode?.("simulate"));
    act(() => probe.setGlobalMode?.("simulate"));
    expect(seen).toEqual(["simulate"]);

    act(() => editorOf().navigate({ mode: "edit" }));
    expect(editorOf().navigation.get().mode).toBe("edit");
    act(() =>
      editorOf().navigate((current) => ({
        ...current,
        overlay: { type: "user-settings", section: "plugins" },
      })),
    );
    expect(editorOf().navigation.get().overlay).toEqual({
      type: "user-settings",
      section: "plugins",
    });

    act(() => instance.mutations.addPlace(place));
    const placeId = instance.definition.get().places[0]!.id;
    act(() =>
      editorOf().reveal({
        kind: "selection",
        item: { type: "place", id: placeId },
      }),
    );
    expect(editorOf().navigation.get().selection).toEqual([
      { type: "place", id: placeId },
    ]);
    expect(seen).toEqual(["simulate", "edit", "edit", "edit"]);
  });

  it("names the first field a navigation changes by value, so an equal new selection is no change", () => {
    const intents: PetrinautNavigationIntent[] = [];
    renderPlugins([editorPlugin], <Probe />, {
      navigation: {
        state: defaultPetrinautNavigationState,
        onNavigate: (_update, { intent }) => {
          intents.push(intent);
        },
      },
    });

    act(() => editorOf().navigate({ simulateView: "metrics", selection: [] }));
    act(() =>
      editorOf().navigate((current) => ({
        ...current,
        selection: [...current.selection],
        simulateView: "scenarios",
      })),
    );

    expect(intents).toEqual([
      { cause: "user", action: "simulation-view" },
      { cause: "user", action: "simulation-view" },
    ]);
  });

  it("gives a host's layout effect the read-only reason of the same commit", () => {
    const refusals: (string | null)[] = [];
    const ModePlugin = definePetrinautPlugin({
      id: "test.mode",
      name: "Mode",
      access: { document: "write" },
      provides: pluginService<() => void>(),
    });
    const useModePlugin: PluginHook<typeof ModePlugin> = (api) => {
      const [bumps, setBumps] = useState(0);
      useLayoutEffect(() => {
        if (bumps > 0) {
          const result = api.document.edit.addPlace(place);
          refusals.push(result.applied ? null : result.reason.kind);
        }
      }, [api, bumps]);

      return { provides: () => setBumps((count) => count + 1) };
    };
    const Switch = () => {
      const bump = usePluginService(ModePlugin);
      const { setGlobalMode } = use(EditorContext);

      return (
        <button
          type="button"
          onClick={() => {
            setGlobalMode("simulate");
            bump?.();
          }}
        >
          simulate
        </button>
      );
    };

    renderPlugins([ModePlugin(useModePlugin)], <Switch />);
    act(() => screen.getByRole("button", { name: "simulate" }).click());

    expect(refusals).toEqual(["simulate-mode"]);
  });
});
