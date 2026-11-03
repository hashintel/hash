import {
  brunchTools,
  isRefusedLedgerCommit,
  netReaderToolNames,
} from "@hashintel/brunch-agent";

import type {
  PetrinautAiToolPresentation,
  PetrinautAiToolPresentationContext,
  PetrinautAiToolPresentationResolver,
  PetrinautAiToolPresentationState,
} from "../chat/petrinaut";

/** Visible Brunch tools whose cards this host titles. */
export const visibleOrdinaryBrunchToolNames = [
  brunchTools.task,
  brunchTools.activateSkill,
  brunchTools.readSkillResource,
  brunchTools.ledgerCommit,
  brunchTools.ledgerCompile,
  brunchTools.ledgerQuery,
  brunchTools.queryBasis,
  brunchTools.ledgerQueryBasis,
  brunchTools.ping,
  brunchTools.hashQueryEntities,
  brunchTools.hashQueryEntityTypes,
  brunchTools.hashQueryWebs,
  brunchTools.appSaveNet,
  netReaderToolNames.outline,
  netReaderToolNames.structure,
] as const;

type VisibleOrdinaryBrunchToolName =
  (typeof visibleOrdinaryBrunchToolNames)[number];

const readingTheLedger = {
  pending: "Read the Ledger",
  success: "Read the Ledger",
  error: "Could not read the Ledger",
};
const checkingRecordedBasis = {
  pending: "Check recorded basis",
  success: "Checked recorded basis",
  error: "Could not check recorded basis",
};

type LifecycleTitles = Readonly<
  Record<PetrinautAiToolPresentationState, string>
>;

/**
 * A call without a result, still pending or ended by a failed response, names
 * the requested action; only a successful result claims it happened.
 */
const lifecycleTitles = {
  task: {
    pending: "Delegate task",
    success: "Completed task",
    error: "Could not complete task",
  },
  [brunchTools.activateSkill]: {
    pending: "Activate skill",
    success: "Activated skill",
    error: "Could not activate skill",
  },
  [brunchTools.readSkillResource]: {
    pending: "Review modelling guidance",
    success: "Reviewed modelling guidance",
    error: "Could not review modelling guidance",
  },
  [brunchTools.ledgerCommit]: {
    pending: "Record in the Ledger",
    success: "Recorded in the Ledger",
    error: "Could not record in the Ledger",
  },
  // The Petrinaut agent's name and the HASH agent's for the same tool.
  [brunchTools.ledgerCompile]: readingTheLedger,
  [brunchTools.ledgerQuery]: readingTheLedger,
  [netReaderToolNames.outline]: {
    pending: "Read the net outline",
    success: "Read the net outline",
    error: "Could not read the net outline",
  },
  [netReaderToolNames.structure]: {
    pending: "Read the net structure",
    success: "Read the net structure",
    error: "Could not read the net structure",
  },
  [brunchTools.queryBasis]: checkingRecordedBasis,
  [brunchTools.ledgerQueryBasis]: checkingRecordedBasis,
  [brunchTools.ping]: {
    pending: "Check connection to the AI assistant",
    success: "Checked connection to the AI assistant",
    error: "Could not reach the AI assistant",
  },
  [brunchTools.hashQueryEntities]: {
    pending: "Look up entities in HASH",
    success: "Looked up entities in HASH",
    error: "Could not look up entities in HASH",
  },
  [brunchTools.hashQueryEntityTypes]: {
    pending: "Look up entity types in HASH",
    success: "Looked up entity types in HASH",
    error: "Could not look up entity types in HASH",
  },
  [brunchTools.hashQueryWebs]: {
    pending: "List your HASH webs",
    success: "Listed your HASH webs",
    error: "Could not list your HASH webs",
  },
  [brunchTools.appSaveNet]: {
    pending: "Save the net",
    success: "Saved the net",
    error: "Could not save the net",
  },
} satisfies Record<VisibleOrdinaryBrunchToolName, LifecycleTitles>;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

const stringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  const candidate = asRecord(value)?.[property];
  return typeof candidate === "string" ? candidate : undefined;
};

const withPendingTone = (
  presentation: PetrinautAiToolPresentation,
  state: PetrinautAiToolPresentationContext["state"],
): PetrinautAiToolPresentation =>
  state === "pending" ? { ...presentation, tone: "pending" } : presentation;

const withSuffix = (title: string, suffix: string | undefined): string =>
  suffix ? `${title}: ${suffix}` : title;

const resourceName = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = path;
  }
  const skillMatch = decoded.match(/skill:([^:/]+):[^/]+\/(.+)$/u);
  const skillName = skillMatch?.[1];
  const resourcePath = skillMatch?.[2];
  return skillName && resourcePath
    ? `${skillName} / ${resourcePath}`
    : decoded.split("/").at(-1);
};

export const resolveBrunchToolPresentation: PetrinautAiToolPresentationResolver =
  (context): PetrinautAiToolPresentation | undefined => {
    if (!(context.toolName in lifecycleTitles)) return undefined;

    const toolName = context.toolName as VisibleOrdinaryBrunchToolName;
    const titles = lifecycleTitles[toolName];
    let detail: string | undefined;

    if (toolName === brunchTools.activateSkill) {
      const skillName = stringProperty(context.input, "name");
      return withPendingTone(
        { title: withSuffix(titles[context.state], skillName) },
        context.state,
      );
    }

    if (toolName === brunchTools.readSkillResource) {
      const resource = resourceName(stringProperty(context.input, "path"));
      return withPendingTone(
        { title: withSuffix(titles[context.state], resource) },
        context.state,
      );
    }

    if (
      toolName === brunchTools.ledgerCommit &&
      isRefusedLedgerCommit(context.output)
    ) {
      return {
        title: "Ledger commit needs correction",
        tone: "neutral",
        items: [context.output.message],
      };
    }

    if (toolName === brunchTools.appSaveNet) {
      // A save the page refused, or the person declined, saved nothing; one
      // whose result never came back may or may not have saved.
      const status = stringProperty(context.output, "status");
      if (status === "not-started") {
        return {
          title: "Did not save the net",
          detail: stringProperty(context.output, "reason"),
          tone: "neutral",
        };
      }
      if (status === "unconfirmed") {
        return {
          title: "Could not confirm the save",
          detail: stringProperty(context.output, "error"),
          tone: "danger",
        };
      }
    }

    if (toolName === brunchTools.task) {
      detail =
        stringProperty(context.input, "description") ??
        stringProperty(context.input, "task");
    }

    return withPendingTone(
      { title: titles[context.state], detail },
      context.state,
    );
  };

/** Compile-time witness that every visible ordinary name has lifecycle copy. */
export const brunchToolLifecycleTitles = lifecycleTitles;
