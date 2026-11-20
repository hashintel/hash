/**
 * Recovery for deleted steps (ledger L1019, L945): which steps read the outputs of the steps being deleted, and the
 * words the "Step deleted" toast and the "Delete <step>?" dialog use for them.
 *
 * `?deleteused=named|ask|toast` (URL only) picks what deleting one step that others use does:
 * - named (default, provisional): the step goes at once; the toast names the damage in one line.
 * - ask: the confirm dialog first, naming the steps that use it (Figma J5.13).
 * - toast: a plain "Step deleted" with Undo.
 */
import { flattenSteps, type EditorDocument, stepLabel } from "./document";
import { inputLabels } from "./catalog";
import { humanize } from "./source-menu";

export type DeleteUsedTake = "named" | "ask" | "toast";

export const deleteUsedTake = (search: URLSearchParams): DeleteUsedTake => {
  const value = search.get("deleteused");
  return value === "ask" || value === "toast" ? value : "named";
};

/** True when the value, however deep, reads an output of one of `ids`. */
const readsOutputOf = (value: unknown, ids: Set<string>): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => readsOutputOf(entry, ids));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      record.kind === "step-output" &&
      typeof record.stepId === "string" &&
      ids.has(record.stepId)
    ) {
      return true;
    }
    return Object.values(record).some((entry) => readsOutputOf(entry, ids));
  }
  return false;
};

export type StepUse = { stepId: string; label: string; inputs: string[] };

/**
 * The steps outside `removed` (and their children) that read an output of one of them, with the inputs that do. A
 * field's references live in the document's own maps (templates, lists, patches) as well as in `step.inputs`.
 */
export const stepsUsing = (
  document: EditorDocument,
  removed: string[],
): StepUse[] => {
  const all = flattenSteps(document.steps);
  const gone = new Set(
    all
      .filter(
        ({ step, parentId }) =>
          removed.includes(step.stepId) || (parentId !== null && removed.includes(parentId)),
      )
      .map(({ step }) => step.stepId),
  );
  const found = new Map<string, Set<string>>();
  const note = (stepId: string, input: string) => {
    if (!gone.has(stepId)) {
      found.set(stepId, (found.get(stepId) ?? new Set()).add(input));
    }
  };
  const inputLabel = (stepId: string, name: string) => {
    const step = all.find((entry) => entry.step.stepId === stepId)?.step;
    return (
      (step?.kind === "action" ? inputLabels[`${step.actionDefinitionId}.${name}`] : undefined) ??
      humanize(name)
    );
  };
  for (const { step } of all) {
    if (step.kind === "action") {
      for (const [name, source] of Object.entries(step.inputs)) {
        if (readsOutputOf(source, gone)) {
          note(step.stepId, inputLabel(step.stepId, name));
        }
      }
    } else if (readsOutputOf(step.over, gone)) {
      note(step.stepId, "List");
    }
  }
  for (const map of [document.templates, document.lists]) {
    for (const [key, value] of Object.entries(map)) {
      if (readsOutputOf(value, gone)) {
        const [stepId = "", name = ""] = key.split(".");
        note(stepId, inputLabel(stepId, name));
      }
    }
  }
  for (const [stepId, patches] of Object.entries(document.patches)) {
    if (readsOutputOf(patches, gone)) {
      note(stepId, "Properties");
    }
  }
  return all.flatMap(({ step }) => {
    const inputs = found.get(step.stepId);
    return inputs ? [{ stepId: step.stepId, label: stepLabel(step), inputs: [...inputs] }] : [];
  });
};

const joinWords = (words: string[]) =>
  words.length < 2
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** "Step deleted. Send review email has 1 to fix", or "Step deleted. 3 steps have things to fix". */
export const namedToastText = (uses: StepUse[]) => {
  const [first] = uses;
  if (!first) {
    return "Step deleted";
  }
  return uses.length === 1
    ? `Step deleted. ${first.label} has ${first.inputs.length} to fix`
    : `Step deleted. ${uses.length} steps have things to fix`;
};

/** The dialog's line (Figma J5.13): "Send review email uses it in To and Body. Those references will break." */
export const usedDialogBody = (uses: StepUse[]) => {
  const inputs = uses.reduce((total, use) => total + use.inputs.length, 0);
  const where = uses.map((use) => `${use.label} uses it in ${joinWords(use.inputs)}`);
  return `${joinWords(where).replace(/ and ([^,]*) uses it/g, "; $1 uses it")}. ${inputs === 1 ? "That reference will break." : "Those references will break."}`;
};
