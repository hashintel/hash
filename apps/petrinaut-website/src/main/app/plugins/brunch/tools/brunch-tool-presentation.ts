import { netReaderToolNames } from "@hashintel/brunch-agent-plugin-sdcpn";
import { brunchTools } from "@hashintel/brunch-agent/constants";
import { isRefusedLedgerCommit } from "@hashintel/brunch-agent/ledger";

import type {
  PetrinautAiToolPresentation,
  PetrinautAiToolPresentationContext,
  PetrinautAiToolPresentationResolver,
  PetrinautAiToolPresentationState,
} from "@hashintel/petrinaut/ui";

/** Visible Brunch tools whose cards this host titles. */
export const visibleOrdinaryBrunchToolNames = [
  "task",
  brunchTools.activateSkill,
  brunchTools.readSkillResource,
  brunchTools.ledgerCommit,
  brunchTools.ledgerCompile,
  brunchTools.queryBasis,
  brunchTools.ping,
  netReaderToolNames.outline,
  netReaderToolNames.structure,
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
  [brunchTools.ledgerCommit]: {
    pending: "Recording in the Ledger",
    success: "Recorded in the Ledger",
    error: "Could not record in the Ledger",
  },
  [brunchTools.ledgerCompile]: {
    pending: "Reading the Ledger",
    success: "Read the Ledger",
    error: "Could not read the Ledger",
  },
  [netReaderToolNames.outline]: {
    pending: "Reading the net outline",
    success: "Read the net outline",
    error: "Could not read the net outline",
  },
  [netReaderToolNames.structure]: {
    pending: "Reading the net structure",
    success: "Read the net structure",
    error: "Could not read the net structure",
  },
  [brunchTools.queryBasis]: {
    pending: "Checking recorded basis",
    success: "Checked recorded basis",
    error: "Could not check recorded basis",
  },
  [brunchTools.ping]: {
    pending: "Checking connection to the AI assistant",
    success: "Checked connection to the AI assistant",
    error: "Could not reach the AI assistant",
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

    if (toolName === brunchTools.ledgerCompile) {
      return withPendingTone(
        {
          title: withSuffix(
            titles[context.state],
            stringProperty(context.input, "address"),
          ),
        },
        context.state,
      );
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
