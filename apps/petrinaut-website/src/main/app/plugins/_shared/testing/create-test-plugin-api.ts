import {
  createJsonDocHandle,
  createPetrinaut,
  createReadableStore,
  type LanguageClient,
  type Petrinaut,
} from "@hashintel/petrinaut-core";

import type {
  AccessApi,
  AddNotificationInput,
  EditRefusal,
  EditResult,
  ExperimentRecord,
  PetrinautRevealTarget,
  PluginEdits,
  PluginExperiments,
} from "@hashintel/petrinaut/ui";

interface TestPluginApiOptions {
  /** The title store's first value. */
  readonly title?: string;
  /** The host's title setter; omitted, `setTitle` is refused. */
  readonly setTitle?: (title: string) => void;
  /** Read when an edit is called: a refusal refuses every edit. */
  readonly refusal?: () => EditRefusal | null;
  readonly requestDiagnostics?: LanguageClient["requestDiagnostics"];
  readonly reveal?: (target: PetrinautRevealTarget) => void;
  readonly runExperiment?: PluginExperiments["run"];
  readonly records?: readonly ExperimentRecord[];
  readonly notify?: (input: AddNotificationInput) => string;
  readonly capture?: AccessApi["errors"]["capture"];
}

const noDiagnostics: LanguageClient["requestDiagnostics"] = () =>
  Promise.resolve({ byUri: new Map(), total: 0, errorCount: 0 });

/** A core instance over an empty net, for a test's `api`. */
export const createEmptyTestInstance = (id?: string): Petrinaut =>
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
 * A plugin `api` for tests, over a core instance: edits run its mutations and
 * commands, the net is its definition, and every other member is a harmless
 * stand-in the options replace.
 */
export const createTestPluginApi = (
  instance: Petrinaut,
  {
    title = "Untitled",
    setTitle,
    refusal = () => null,
    requestDiagnostics = noDiagnostics,
    reveal = () => {},
    runExperiment = () =>
      Promise.reject(new Error("Experiment host unavailable")),
    records = [],
    notify = () => "",
    capture = () => {},
  }: TestPluginApiOptions = {},
): AccessApi<{ document: "write"; experiments: "write" }> => {
  const titleStore = createReadableStore(title);
  const refused = (apply: () => void): EditResult => {
    const reason = refusal();
    if (reason !== null) {
      return { applied: false, reason };
    }
    apply();

    return { applied: true, value: undefined };
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
      diagnose: async () => {
        const net = instance.definition.get();

        return { ...(await requestDiagnostics(net, instance.extensions)), net };
      },
      reveal,
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
    },
    experiments: {
      records: createReadableStore(records),
      optimizationUnavailableReason: createReadableStore<string | null>(null),
      run: runExperiment,
    },
  };
};
