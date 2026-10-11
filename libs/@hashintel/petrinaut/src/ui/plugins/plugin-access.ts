/**
 * The editor state a manifest's `access` grants, by family and level.
 *
 * `createAccessFamilies` builds one object per family and level, once per
 * document; each writer spreads its reader. `AccessApi` reads its member types
 * from that table, so the `api` type and the runtime object cannot drift.
 */

import {
  formatReadOnlyReason,
  mutationBlockedBy,
  type ReadOnlyReason,
} from "../../react/state/use-read-only-reason";

import type {
  ErrorTracker,
  ErrorTrackerCaptureContext,
} from "../../react/error-tracker-context";
import type { ExperimentRecord } from "../../react/experiments/context";
import type { PetrinautRevealTarget } from "../../react/hooks/use-reveal-in-editor";
import type {
  PetrinautNavigationAction,
  PetrinautNavigationIntent,
  PetrinautNavigationState,
  PetrinautNavigationUpdate,
} from "../../react/navigation";
import type { AddNotificationInput } from "../../react/notifications/context";
import type {
  ApplyAutoLayoutResult,
  DiagnosticsSnapshot,
  LanguageClient,
  Petrinaut,
  PetrinautExtensionSettings,
  PetrinautMutations,
  ReadableStore,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { PetrinautExperimentHost } from "@hashintel/petrinaut-core/experiments";

/** Why an edit did not apply. */
export type EditRefusal = ReadOnlyReason | { readonly kind: "no-title-setter" };

/** Whether an edit applied, with its value, or why it was refused. */
export type EditResult<Value = undefined> =
  | { readonly applied: true; readonly value: Value }
  | { readonly applied: false; readonly reason: EditRefusal };

/** A sentence explaining a refusal, e.g. for a toast or an AI tool's output. */
export const describeRefusal = (reason: EditRefusal): string =>
  reason.kind === "no-title-setter"
    ? "The host application does not provide title editing."
    : formatReadOnlyReason(reason);

/** Reports failures to the host's error tracker, tagged with the plugin's id. */
export interface PluginErrors {
  /** `source` defaults to `plugin.<id>`; tags hold ids and classifications, never user or model content. */
  capture(error: unknown, context?: ErrorTrackerCaptureContext): void;
}

/** Shows toasts. */
export interface PluginNotifications {
  /** Shows a toast and returns its id. */
  add(input: AddNotificationInput): string;
}

/** What every plugin's `api` holds. */
interface PluginBaseApi {
  readonly errors: PluginErrors;
  readonly notifications: PluginNotifications;
}

/** The checked net, with its diagnostics. */
type PluginDiagnostics = DiagnosticsSnapshot & { readonly net: SDCPN };

/** The document, read: `access: { document: "read" }`. */
export interface PluginDocumentReader {
  /** The handle's id; plugins remount for each document. */
  readonly id: string;
  /** The net without the data of disabled extensions; an empty net until the handle is ready. */
  readonly net: ReadableStore<SDCPN>;
  /** The title the host passed. */
  readonly title: ReadableStore<string>;
  readonly extensions: PetrinautExtensionSettings;
  /**
   * Checks the current net with the language service and returns the net it
   * checked: `net !== document.net.get()` afterwards means the document
   * changed meanwhile. Rejects while the language service is starting, just
   * after the editor mounts.
   */
  diagnose(): Promise<PluginDiagnostics>;
}

/**
 * One method per core mutation, refused while the editor is read-only, plus
 * `applyAutoLayout`. Never pass it where `PetrinautMutations` is expected:
 * the refusal would be lost.
 */
export type PluginEdits = {
  /** Edits the root net unless `input.targetSubnetId` is set. Scenario and metric edits are refused only on a read-only host. */
  readonly [Name in keyof PetrinautMutations]: (
    input: Parameters<PetrinautMutations[Name]>[0],
  ) => EditResult;
} & {
  /** Lays out the viewed subnet in one undo entry, then frames it once drawn. */
  readonly applyAutoLayout: () => Promise<EditResult<ApplyAutoLayoutResult>>;
};

/** The document, read and changed: `access: { document: "write" }`. */
export interface PluginDocument extends PluginDocumentReader {
  readonly edit: PluginEdits;
  /** Calls the host's `setTitle`; refused when the host passed none, or while the editor is read-only. */
  setTitle(title: string): EditResult;
}

/** The document's experiments, read: `access: { experiments: "read" }`. */
export interface PluginExperimentsReader {
  readonly records: ReadableStore<readonly ExperimentRecord[]>;
  /** Why optimization runs are unavailable, or `null`. */
  readonly optimizationUnavailableReason: ReadableStore<string | null>;
}

/** The document's experiments, read and run: `access: { experiments: "write" }`. */
export interface PluginExperiments extends PluginExperimentsReader {
  /** Runs an experiment on a snapshot of the net; not refused while the editor is read-only. */
  readonly run: PetrinautExperimentHost["runExperiment"];
}

/** Where the editor is, read: `access: { editor: "read" }`. */
export interface PluginEditorReader {
  /**
   * The editor's location, as the host's navigation state: mode, views, the
   * open Simulate record, scenario, subnet, selection and overlay. Changes
   * only when one of them does.
   */
  readonly navigation: ReadableStore<PetrinautNavigationState>;
}

/** Where the editor is, read and changed: `access: { editor: "write" }`. */
export interface PluginEditor extends PluginEditorReader {
  /**
   * Moves the editor: a partial state, or an updater of the current one.
   * Normalized as the host's own navigation is, and never refused: the
   * location is not part of the document.
   */
  navigate(update: PetrinautNavigationUpdate<PetrinautNavigationState>): void;
  /** Selects an item, or opens Simulate's scenarios, metrics or experiments with one record open. */
  reveal(target: PetrinautRevealTarget): void;
}

/** Editor state the actions read when called, copied after every commit. */
export interface PluginEditorState {
  readonly readOnlyReason: ReadOnlyReason | null;
  readonly activeSubnetId: string | null;
  readonly setTitle: ((title: string) => void) | undefined;
  readonly navigate: (
    update: PetrinautNavigationUpdate<PetrinautNavigationState>,
    intent: PetrinautNavigationIntent,
  ) => boolean;
  readonly reveal: (target: PetrinautRevealTarget) => void;
  readonly requestDiagnostics: LanguageClient["requestDiagnostics"];
  readonly runExperiment: PetrinautExperimentHost["runExperiment"];
  readonly addNotification: (input: AddNotificationInput) => string;
  readonly captureException: ErrorTracker["captureException"];
}

/** What the families are built from: the core instance and the editor's stores. */
interface PluginEditorPorts {
  readonly instance: Petrinaut;
  readonly latest: ReadableStore<PluginEditorState>;
  readonly title: ReadableStore<string>;
  readonly records: ReadableStore<readonly ExperimentRecord[]>;
  readonly optimizationUnavailableReason: ReadableStore<string | null>;
  readonly navigation: ReadableStore<PetrinautNavigationState>;
  readonly frameSceneAfterRender: () => Promise<unknown>;
}

const readDocument = ({
  instance,
  latest,
  title,
}: PluginEditorPorts): PluginDocumentReader => ({
  id: instance.handle.id,
  net: instance.definition,
  title,
  extensions: instance.extensions,
  diagnose: async () => {
    const net = instance.definition.get();
    const diagnostics = await latest
      .get()
      .requestDiagnostics(net, instance.extensions);

    return { ...diagnostics, net };
  },
});

type MutationEdits = Omit<PluginEdits, "applyAutoLayout">;

const guardMutations = ({ instance, latest }: PluginEditorPorts) =>
  Object.fromEntries(
    Object.entries(instance.mutations).map(
      ([name, mutate]: [string, (input: never) => void]) => [
        name,
        (input: never): EditResult => {
          const reason = mutationBlockedBy(
            name as keyof PetrinautMutations,
            latest.get().readOnlyReason,
          );
          if (reason !== null) {
            return { applied: false, reason };
          }
          mutate(input);

          return { applied: true, value: undefined };
        },
      ],
    ),
  ) as MutationEdits;

const writeDocument = (
  ports: PluginEditorPorts,
  reader: PluginDocumentReader,
): PluginDocument => {
  const { instance, latest, frameSceneAfterRender } = ports;

  return {
    ...reader,
    edit: {
      ...guardMutations(ports),
      applyAutoLayout: async () => {
        const { readOnlyReason, activeSubnetId } = latest.get();
        if (readOnlyReason !== null) {
          return { applied: false, reason: readOnlyReason };
        }
        const value = await instance.commands.applyAutoLayout({
          targetSubnetId: activeSubnetId,
        });
        await frameSceneAfterRender();

        return { applied: true, value };
      },
    },
    setTitle: (title) => {
      const { setTitle, readOnlyReason } = latest.get();
      if (setTitle === undefined) {
        return { applied: false, reason: { kind: "no-title-setter" } };
      }
      if (readOnlyReason !== null) {
        return { applied: false, reason: readOnlyReason };
      }
      setTitle(title);

      return { applied: true, value: undefined };
    },
  };
};

const readExperiments = ({
  records,
  optimizationUnavailableReason,
}: PluginEditorPorts): PluginExperimentsReader => ({
  records,
  optimizationUnavailableReason,
});

const writeExperiments = (
  { latest }: PluginEditorPorts,
  reader: PluginExperimentsReader,
): PluginExperiments => ({
  ...reader,
  run: (request, options) => latest.get().runExperiment(request, options),
});

/**
 * The action a plugin's update stands for, in the host's navigation intent:
 * the first field it changes, in this order. A host's history policy reads it.
 */
const navigationActions: readonly (readonly [
  keyof PetrinautNavigationState,
  PetrinautNavigationAction,
])[] = [
  ["selection", "selection"],
  ["overlay", "overlay"],
  ["simulateResource", "simulation-resource"],
  ["simulatePresentation", "simulation-presentation"],
  ["scenarioId", "scenario"],
  ["subnetId", "subnet"],
  ["expandedSubView", "subview"],
  ["simulateView", "simulation-view"],
  ["editView", "edit-view"],
  ["mode", "mode"],
];

const navigationActionFor = (
  current: PetrinautNavigationState,
  update: PetrinautNavigationUpdate<PetrinautNavigationState>,
): PetrinautNavigationAction => {
  const next =
    typeof update === "function" ? update(current) : { ...current, ...update };
  const changed = navigationActions.find(
    ([field]) => next[field] !== current[field],
  );

  return changed?.[1] ?? "mode";
};

const readEditor = ({ navigation }: PluginEditorPorts): PluginEditorReader => ({
  navigation,
});

const writeEditor = (
  { latest, navigation }: PluginEditorPorts,
  reader: PluginEditorReader,
): PluginEditor => ({
  ...reader,
  navigate: (update) => {
    latest.get().navigate(update, {
      cause: "user",
      action: navigationActionFor(navigation.get(), update),
    });
  },
  reveal: (target) => latest.get().reveal(target),
});

/** One object per family and level for one document; each writer spreads its reader. */
export const createAccessFamilies = (ports: PluginEditorPorts) => {
  const document = readDocument(ports);
  const experiments = readExperiments(ports);
  const editor = readEditor(ports);

  return {
    document: { read: document, write: writeDocument(ports, document) },
    experiments: {
      read: experiments,
      write: writeExperiments(ports, experiments),
    },
    editor: { read: editor, write: writeEditor(ports, editor) },
  };
};

export type AccessFamilies = ReturnType<typeof createAccessFamilies>;

/** A family of editor state a manifest's `access` can name. */
type PluginFamily = keyof AccessFamilies;

/** `"read"` gives a family's values, stores and reads; `"write"` also its actions. */
type AccessLevel = "read" | "write";

/** What a manifest's `access` declares: a level per family. */
export type PluginAccess = { readonly [F in PluginFamily]?: AccessLevel };

/**
 * An `api` holding the families `A` declares, at their levels. Type a
 * component by the least it needs, e.g. `AccessApi<{ document: "read" }>`; a
 * writer is assignable to its reader.
 */
export type AccessApi<A extends PluginAccess = Record<never, never>> =
  PluginBaseApi & {
    readonly [F in keyof A & PluginFamily as A[F] extends AccessLevel
      ? F
      : never]: AccessFamilies[F][A[F] & AccessLevel];
  };

/** The members `access` grants, picked from the document's families. */
export const accessApi = (families: AccessFamilies, access: PluginAccess) => ({
  ...(access.document && { document: families.document[access.document] }),
  ...(access.experiments && {
    experiments: families.experiments[access.experiments],
  }),
  ...(access.editor && { editor: families.editor[access.editor] }),
});
