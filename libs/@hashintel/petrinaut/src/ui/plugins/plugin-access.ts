/**
 * The editor state a manifest's `access` grants, by family and level.
 *
 * `createAccessFamilies` builds one object per family and level, once per
 * document; each writer spreads its reader. `AccessApi` reads its member types
 * from that table, so the `api` type and the runtime object cannot drift.
 */

import { petrinautNavigationStatesMatch } from "../../react/navigation";
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

/** What `diagnose()` resolves to: the diagnostics of the net it checked, and that net. */
export type PluginDiagnostics = DiagnosticsSnapshot & { readonly net: SDCPN };

/** The document, read: `access: { document: "read" }`. */
export interface PluginDocumentReader {
  /** The handle's id; plugins remount for each document. */
  readonly id: string;
  /** The net without the data of disabled extensions; an empty net until the handle is ready. */
  readonly net: ReadableStore<SDCPN>;
  /** The title the host passed, or "Untitled" when it passes none. */
  readonly title: ReadableStore<string>;
  readonly extensions: PetrinautExtensionSettings;
  /**
   * The diagnostics the editor shows, as the language service last pushed
   * them. `byUri` is keyed by document URI: `parseDocumentUri` gives
   * `{ itemType, itemId }`, and `null` for open editor sessions. It lags `net`
   * by a worker round trip; `diagnose()` checks a specific net.
   */
  readonly diagnostics: ReadableStore<DiagnosticsSnapshot>;
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

/** Why each edit would be refused now, or `null` where it would apply. */
export type EditRefusals = {
  readonly [Name in keyof PluginEdits | "setTitle"]: EditRefusal | null;
};

/** The document, read and changed: `access: { document: "write" }`. */
export interface PluginDocument extends PluginDocumentReader {
  readonly edit: PluginEdits;
  /** Calls the host's `setTitle`; refused when the host passed none, or while the editor is read-only. */
  setTitle(title: string): EditResult;
  /**
   * Why each of `edit`'s methods and `setTitle` would be refused now, or
   * `null` where it would apply: the check they run when called. It changes
   * with the editor's mode and simulation, e.g. to offer an action only while
   * it can apply.
   */
  readonly refusals: ReadableStore<EditRefusals>;
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

/** The editor state that decides which edits are refused. */
type EditPolicyState = Pick<PluginEditorState, "readOnlyReason" | "setTitle">;

/**
 * Why each edit is refused in `state`: scenario and metric edits only by a
 * read-only host, every other edit by any read-only reason, and `setTitle`
 * also while the host passes no setter.
 */
export const editRefusals = (
  mutationNames: readonly (keyof PetrinautMutations)[],
  { readOnlyReason, setTitle }: EditPolicyState,
): EditRefusals =>
  ({
    ...Object.fromEntries(
      mutationNames.map((name) => [
        name,
        mutationBlockedBy(name, readOnlyReason),
      ]),
    ),
    applyAutoLayout: readOnlyReason,
    setTitle:
      setTitle === undefined ? { kind: "no-title-setter" } : readOnlyReason,
  }) as EditRefusals;

/** Equal for two states that refuse the same edits. */
export const editPolicyKey = ({ readOnlyReason, setTitle }: EditPolicyState) =>
  [
    readOnlyReason?.kind,
    readOnlyReason?.kind === "simulation-active" && readOnlyReason.state,
    setTitle !== undefined,
  ].join(":");

/** What the families are built from: the core instance and the editor's stores. */
interface PluginEditorPorts {
  readonly instance: Petrinaut;
  readonly latest: ReadableStore<PluginEditorState>;
  readonly refusals: ReadableStore<EditRefusals>;
  readonly title: ReadableStore<string>;
  readonly diagnostics: ReadableStore<DiagnosticsSnapshot>;
  readonly records: ReadableStore<readonly ExperimentRecord[]>;
  readonly optimizationUnavailableReason: ReadableStore<string | null>;
  readonly navigation: ReadableStore<PetrinautNavigationState>;
  readonly frameSceneAfterRender: () => Promise<unknown>;
}

const readDocument = ({
  instance,
  latest,
  title,
  diagnostics,
}: PluginEditorPorts): PluginDocumentReader => ({
  id: instance.handle.id,
  net: instance.definition,
  title,
  extensions: instance.extensions,
  diagnostics,
  diagnose: async () => {
    const net = instance.definition.get();
    const checked = await latest
      .get()
      .requestDiagnostics(net, instance.extensions);

    return { ...checked, net };
  },
});

type MutationEdits = Omit<PluginEdits, "applyAutoLayout">;

const guardMutations = ({ instance, refusals }: PluginEditorPorts) =>
  Object.fromEntries(
    Object.entries(instance.mutations).map(
      ([name, mutate]: [string, (input: never) => void]) => [
        name,
        (input: never): EditResult => {
          const reason = refusals.get()[name as keyof PetrinautMutations];
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
  const { instance, latest, refusals, frameSceneAfterRender } = ports;

  return {
    ...reader,
    edit: {
      ...guardMutations(ports),
      applyAutoLayout: async () => {
        const reason = refusals.get().applyAutoLayout;
        if (reason !== null) {
          return { applied: false, reason };
        }
        const value = await instance.commands.applyAutoLayout({
          targetSubnetId: latest.get().activeSubnetId,
        });
        await frameSceneAfterRender();

        return { applied: true, value };
      },
    },
    setTitle: (title) => {
      const reason = refusals.get().setTitle;
      if (reason !== null) {
        return { applied: false, reason };
      }
      latest.get().setTitle?.(title);

      return { applied: true, value: undefined };
    },
    refusals,
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
    ([field]) =>
      !petrinautNavigationStatesMatch(current, {
        ...current,
        [field]: next[field],
      }),
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
    readonly [
      F in keyof A & PluginFamily as A[F] extends AccessLevel ? F : never
    ]: AccessFamilies[F][A[F] & AccessLevel];
  };

/** The members `access` grants, picked from the document's families. */
export const accessApi = (families: AccessFamilies, access: PluginAccess) => ({
  ...(access.document && { document: families.document[access.document] }),
  ...(access.experiments && {
    experiments: families.experiments[access.experiments],
  }),
  ...(access.editor && { editor: families.editor[access.editor] }),
});
