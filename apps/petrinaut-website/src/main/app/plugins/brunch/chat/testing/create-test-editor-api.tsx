import {
  createJsonDocHandle,
  createPetrinaut,
  createReadableStore,
  type LanguageClient,
  type Petrinaut,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import { AiAssistantEditorApiContext } from "../ai-assistant-panel/editor-api";

import type { AiAssistantEditorApi } from "../ai-assistant-panel/editor-api";
import type { ExperimentRecord } from "@hashintel/petrinaut/react";
import type { PetrinautNavigationState } from "@hashintel/petrinaut/ui";
import type {
  AddNotificationInput,
  DiagnosticsSnapshot,
  EditRefusal,
  EditRefusals,
  EditResult,
  PetrinautRevealTarget,
  PluginEdits,
  PluginExperiments,
} from "@hashintel/petrinaut/ui/plugin";
import type { ReactNode } from "react";

interface TestEditorApiOptions {
  /** The title store's first value. */
  readonly title?: string;
  /** The editor's title setter; omitted, `setTitle` is refused. */
  readonly setTitle?: (title: string) => void;
  /** Read when an edit is called: a refusal refuses every edit. */
  readonly refusal?: () => EditRefusal | null;
  readonly requestDiagnostics?: LanguageClient["requestDiagnostics"];
  readonly reveal?: (target: PetrinautRevealTarget) => void;
  readonly runExperiment?: PluginExperiments["run"];
  /** The experiment records; a store lets a test change them. */
  readonly records?: ReadableStore<readonly ExperimentRecord[]>;
  readonly notify?: (input: AddNotificationInput) => string;
  readonly capture?: AiAssistantEditorApi["errors"]["capture"];
}

/** The editor at rest: Edit mode on the canvas, nothing selected. */
const restingNavigation: PetrinautNavigationState = {
  mode: "edit",
  editView: "canvas",
  simulateView: "experiments",
  simulateResource: null,
  scenarioId: undefined,
  subnetId: null,
  selection: [],
  expandedSubView: null,
  overlay: null,
};

const noDiagnostics: LanguageClient["requestDiagnostics"] = () =>
  Promise.resolve({ byUri: new Map(), total: 0, errorCount: 0 });

/** A core instance over an empty net, for a test's `api`. */
const createEmptyTestInstance = (id?: string): Petrinaut =>
  createPetrinaut({
    document: createJsonDocHandle({
      id,
      initial: {
        places: [],
        transitions: [],
        types: [],
        parameters: [],
        differentialEquations: [],
      },
    }),
  });

/**
 * A plugin `api` for renderer tests of Brunch's chat, over a core instance:
 * edits run its mutations and commands behind `refusal`, as the editor's
 * plugin access does, and every other member is a stand-in the options
 * replace. Tests of the wiring render the real editor instead.
 */
export const createTestEditorApi = (
  instance: Petrinaut = createEmptyTestInstance(),
  {
    title = "Untitled",
    setTitle,
    refusal = () => null,
    requestDiagnostics = noDiagnostics,
    reveal = () => {},
    runExperiment = () => Promise.reject(new Error("Experiments unavailable")),
    records = createReadableStore<readonly ExperimentRecord[]>([]),
    notify = () => "",
    capture = () => {},
  }: TestEditorApiOptions = {},
): AiAssistantEditorApi => {
  const titleStore = createReadableStore(title);
  const refused = (apply: () => void): EditResult => {
    const reason = refusal();
    if (reason !== null) {
      return { applied: false, reason };
    }
    apply();

    return { applied: true, value: undefined };
  };
  // Read at each call, like the edits, so a changed `refusal` shows at once.
  const refusals: ReadableStore<EditRefusals> = {
    get: () =>
      Object.fromEntries([
        ...[...Object.keys(instance.mutations), "applyAutoLayout"].map(
          (name) => [name, refusal()],
        ),
        [
          "setTitle",
          setTitle === undefined ? { kind: "no-title-setter" } : refusal(),
        ],
      ]) as EditRefusals,
    subscribe: () => () => {},
  };
  const mutations = Object.fromEntries(
    Object.entries(instance.mutations).map(
      ([name, mutate]: [string, (input: never) => void]) => [
        name,
        (input: never) => refused(() => mutate(input)),
      ],
    ),
  );

  return {
    errors: { capture },
    notifications: { add: notify },
    document: {
      id: instance.handle.id,
      net: instance.definition,
      title: titleStore,
      extensions: instance.extensions,
      diagnostics: createReadableStore<DiagnosticsSnapshot>({
        byUri: new Map(),
        total: 0,
        errorCount: 0,
      }),
      diagnose: async () => {
        const net = instance.definition.get();

        return { ...(await requestDiagnostics(net, instance.extensions)), net };
      },
      edit: {
        ...mutations,
        applyAutoLayout: async () => {
          const reason = refusal();

          return reason === null
            ? {
                applied: true,
                value: await instance.commands.applyAutoLayout(),
              }
            : { applied: false, reason };
        },
      } as PluginEdits,
      setTitle: (nextTitle) =>
        setTitle === undefined
          ? { applied: false, reason: { kind: "no-title-setter" } }
          : refused(() => {
              setTitle(nextTitle);
              titleStore.set(nextTitle);
            }),
      refusals,
    },
    editor: {
      navigation: createReadableStore(restingNavigation),
      navigate: () => {},
      reveal,
    },
    experiments: {
      records,
      optimizationUnavailableReason: createReadableStore<string | null>(null),
      run: runExperiment,
    },
  };
};

/** Provides `api` to chat components rendered outside `AiAssistantPanel`. */
export const TestEditorApi = ({
  api = createTestEditorApi(),
  children,
}: {
  api?: AiAssistantEditorApi;
  children: ReactNode;
}) => (
  <AiAssistantEditorApiContext value={api}>
    {children}
  </AiAssistantEditorApiContext>
);
