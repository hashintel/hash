import type {
  PetrinautAiToolPresentation,
  PetrinautAiToolPresentationContext,
  PetrinautAiToolPresentationResolver,
  PetrinautAiToolPresentationState,
} from "@hashintel/petrinaut/ui";

/**
 * Visible ordinary tools mirrored from the Brunch browser catalogue. The
 * transport-only `brunch_mark_question` marker is deliberately absent.
 */
export const visibleOrdinaryBrunchToolNames = [
  "task",
  "activate_skill",
  "read_skill_resource",
  "mutate_workpiece",
  "read_petrinaut_docs",
  "read_petrinaut_net",
  "read_petrinaut_diagnostics",
  "mutate_petrinaut_net",
  "read_workpiece",
  "query_workpiece",
  "ping",
] as const;

export type VisibleOrdinaryBrunchToolName =
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
  activate_skill: {
    pending: "Activating skill",
    success: "Activated skill",
    error: "Could not activate skill",
  },
  read_skill_resource: {
    pending: "Reviewing modelling guidance",
    success: "Reviewed modelling guidance",
    error: "Could not review modelling guidance",
  },
  mutate_workpiece: {
    pending: "Updating ledger",
    success: "Updated ledger",
    error: "Could not update ledger",
  },
  read_petrinaut_docs: {
    pending: "Reading Petrinaut guidance",
    success: "Read Petrinaut guidance",
    error: "Could not read Petrinaut guidance",
  },
  read_petrinaut_net: {
    pending: "Reading current model",
    success: "Read current model",
    error: "Could not read current model",
  },
  read_petrinaut_diagnostics: {
    pending: "Checking model diagnostics",
    success: "Checked model diagnostics",
    error: "Could not check model diagnostics",
  },
  mutate_petrinaut_net: {
    pending: "Updating model",
    success: "Updated model",
    error: "Could not update model",
  },
  read_workpiece: {
    pending: "Reading ledger",
    success: "Read ledger",
    error: "Could not read ledger",
  },
  query_workpiece: {
    pending: "Checking recorded basis",
    success: "Checked recorded basis",
    error: "Could not check recorded basis",
  },
  ping: {
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

const readWorkpiecePurpose = (input: unknown): LifecycleTitles => {
  const record = asRecord(input) ?? {};
  const hasPassages = Array.isArray(record.locateTexts);
  const hasDraft = hasPassages && typeof record.markdown === "string";
  const includesSources = record.includeSources !== false;

  if (hasDraft && includesSources) {
    return {
      pending: "Reading conversation sources and draft passages",
      success: "Read conversation sources and draft passages",
      error: "Could not read conversation sources and draft passages",
    };
  }
  if (hasDraft) {
    return {
      pending: "Reading draft passages",
      success: "Read draft passages",
      error: "Could not read draft passages",
    };
  }
  if (hasPassages) {
    return {
      pending: "Reading settled passages",
      success: "Read settled passages",
      error: "Could not read settled passages",
    };
  }
  if (record.includeContent === false && includesSources) {
    return {
      pending: "Reading conversation sources",
      success: "Read conversation sources",
      error: "Could not read conversation sources",
    };
  }
  if (record.includeContent === false && !includesSources) {
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

    if (toolName === "activate_skill") {
      const skillName = stringProperty(context.input, "name");
      return { title: withSuffix(titles[context.state], skillName) };
    }

    if (toolName === "read_skill_resource") {
      const resource = resourceName(stringProperty(context.input, "path"));
      return { title: withSuffix(titles[context.state], resource) };
    }

    if (toolName === "read_workpiece") {
      titles = readWorkpiecePurpose(context.input);
    }

    if (toolName === "read_petrinaut_net") {
      const title = stringProperty(context.output, "title");
      detail = title ? `Model: ${title}` : undefined;
    }

    if (toolName === "task") {
      detail =
        stringProperty(context.input, "description") ??
        stringProperty(context.input, "task");
    }

    return { title: titles[context.state], detail };
  };

/** Compile-time witness that every visible ordinary name has lifecycle copy. */
export const brunchToolLifecycleTitles = lifecycleTitles;

export const resolvePresentationForTest = (
  context: PetrinautAiToolPresentationContext,
) => resolveBrunchToolPresentation(context);
