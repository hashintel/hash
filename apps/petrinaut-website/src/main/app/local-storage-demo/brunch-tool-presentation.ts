import { brunchTools } from "@hashintel/brunch-agent/constants";
import { isWorkpieceRefusedOutput } from "@hashintel/brunch-agent/workpiece";

import type {
  PetrinautAiToolPresentation,
  PetrinautAiToolPresentationContext,
  PetrinautAiToolPresentationResolver,
  PetrinautAiToolPresentationState,
} from "@hashintel/petrinaut/ui";

/**
 * Visible ordinary tools mirrored from the Brunch browser catalogue. The
 */
export const visibleOrdinaryBrunchToolNames = [
  "task",
  brunchTools.activateSkill,
  brunchTools.readSkillResource,
  brunchTools.mutateWorkpiece,
  brunchTools.readPetrinautDocs,
  brunchTools.readWorkpiece,
  brunchTools.queryWorkpiece,
  brunchTools.ping,
] as const;

type VisibleOrdinaryBrunchToolName =
  (typeof visibleOrdinaryBrunchToolNames)[number];

type LifecycleTitles = Readonly<
  Record<PetrinautAiToolPresentationState, string>
>;

const lifecycleTitles = {
  task: {
    pending: "Delegating task",
    success: "Completed task",
    error: "Could not complete task",
  },
  [brunchTools.activateSkill]: {
    pending: "Activating skill",
    success: "Activated skill",
    error: "Could not activate skill",
  },
  [brunchTools.readSkillResource]: {
    pending: "Reviewing modelling guidance",
    success: "Reviewed modelling guidance",
    error: "Could not review modelling guidance",
  },
  [brunchTools.mutateWorkpiece]: {
    pending: "Updating ledger",
    success: "Updated ledger",
    error: "Could not update ledger",
  },
  [brunchTools.readPetrinautDocs]: {
    pending: "Reading Petrinaut guidance",
    success: "Read Petrinaut guidance",
    error: "Could not read Petrinaut guidance",
  },
  [brunchTools.readWorkpiece]: {
    pending: "Reading ledger",
    success: "Read ledger",
    error: "Could not read ledger",
  },
  [brunchTools.queryWorkpiece]: {
    pending: "Checking recorded basis",
    success: "Checked recorded basis",
    error: "Could not check recorded basis",
  },
  [brunchTools.ping]: {
    pending: "Checking Brunch connection",
    success: "Checked Brunch connection",
    error: "Could not reach Brunch",
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

/**
 * Arguments may be a partial object while they stream; only a present,
 * non-empty `sourceIds` earns the sources label, and an unreadable input
 * keeps the neutral Ledger label.
 */
const readWorkpiecePurpose = (input: unknown): LifecycleTitles => {
  const record = asRecord(input) ?? {};
  const hasPassages = Array.isArray(record.locateTexts);
  const hasSources =
    Array.isArray(record.sourceIds) && record.sourceIds.length > 0;

  if (hasPassages && hasSources) {
    return {
      pending: "Reading settled passages and conversation sources",
      success: "Read settled passages and conversation sources",
      error: "Could not read settled passages and conversation sources",
    };
  }
  if (hasPassages) {
    return {
      pending: "Reading settled passages",
      success: "Read settled passages",
      error: "Could not read settled passages",
    };
  }
  if (hasSources) {
    return {
      pending: "Reading conversation sources",
      success: "Read conversation sources",
      error: "Could not read conversation sources",
    };
  }
  if (record.includeContent === false) {
    return {
      pending: "Checking Ledger revision",
      success: "Checked Ledger revision",
      error: "Could not check Ledger revision",
    };
  }
  return {
    pending: "Reading ledger",
    success: "Read ledger",
    error: "Could not read ledger",
  };
};

export const resolveBrunchToolPresentation: PetrinautAiToolPresentationResolver =
  (context): PetrinautAiToolPresentation | undefined => {
    if (!(context.toolName in lifecycleTitles)) return undefined;

    const toolName = context.toolName as VisibleOrdinaryBrunchToolName;
    let titles = lifecycleTitles[toolName];
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
      toolName === brunchTools.mutateWorkpiece &&
      isWorkpieceRefusedOutput(context.output)
    ) {
      return {
        title: "Ledger update needs correction",
        tone: "neutral",
        items: [context.output.message],
      };
    }

    if (toolName === brunchTools.readWorkpiece) {
      titles = readWorkpiecePurpose(context.input);
    }

    if (toolName === "task") {
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
