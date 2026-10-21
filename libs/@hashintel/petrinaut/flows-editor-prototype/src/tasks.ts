/**
 * Task testing (ops/research/prototype-task-testing-2026-10-21.md): one realistic scenario at a time, success detected
 * silently from the flow's state, graded complete / minor / major / fail. Never shown to the tester as a score.
 *
 * Predicates check outcomes, not paths: any flow that does the job passes.
 */
import {
  type DraftStep,
  type EditorDocument,
  fieldKey,
  findStep,
  flattenSteps,
  type QueryDraft,
} from "./document";
import { findPropertyType, mockEntityTypes } from "./mock-graph";

export type Grade = "complete" | "minor" | "major" | "fail";

export type TaskDefinition = {
  id: 1 | 2 | 3;
  /** The goal in the world's words: no steps, no UI words. */
  scenario: string;
  grade: (document: EditorDocument) => Grade;
};

const typeBaseUrl = (title: string) =>
  mockEntityTypes.find((type) => type.title === title)?.baseUrl;

const propertyBaseUrl = (typeTitle: string, propertyTitle: string) =>
  mockEntityTypes
    .find((type) => type.title === typeTitle)
    ?.properties.find((property) => property.title === propertyTitle)?.baseUrl;

const actionSteps = (document: EditorDocument) =>
  flattenSteps(document.steps).flatMap(({ step }) =>
    step.kind === "action" ? [step] : [],
  );

const conditionOf = (
  document: EditorDocument,
  step: DraftStep,
): QueryDraft | undefined =>
  step.kind === "action"
    ? document.queries[fieldKey(step.stepId, "condition")]
    : undefined;

/** Steps reachable from a node's port along the canvas wires, including everything inside a reached for-each. */
const reachableFrom = (
  document: EditorDocument,
  sourceId: string,
  port?: string,
): Set<string> => {
  const reached = new Set<string>();
  const visit = (id: string) => {
    if (reached.has(id)) {
      return;
    }
    reached.add(id);
    const found = findStep(document, id)?.step;
    if (found?.kind === "for-each") {
      for (const { step } of flattenSteps(found.steps)) {
        visit(step.stepId);
      }
    }
    for (const wire of document.wires) {
      if (wire.source === id) {
        visit(wire.target);
      }
    }
  };
  for (const wire of document.wires) {
    if (
      wire.source === sourceId &&
      (port === undefined || wire.sourcePort === port)
    ) {
      visit(wire.target);
    }
  }
  return reached;
};

const hasRecipient = (document: EditorDocument, stepId: string) => {
  const step = findStep(document, stepId)?.step;
  return (
    (document.lists[fieldKey(stepId, "to")]?.length ?? 0) > 0 ||
    (step?.kind === "action" && !!step.inputs.to)
  );
};

/** The If port a condition sends failing purity checks to, or null if the condition isn't about purity. */
const failedPort = (condition: QueryDraft | undefined): string | null => {
  const passed = propertyBaseUrl("Purity check", "Passed");
  const purity = propertyBaseUrl("Purity check", "Measured purity");
  for (const row of condition?.conditions ?? []) {
    if (row.propertyBaseUrl === passed) {
      const isTrue = ["true", "yes"].includes(String(row.value).toLowerCase());
      const matchesPassed =
        (row.operator === "equals" && isTrue) ||
        (row.operator === "notEquals" && !isTrue);
      return matchesPassed ? "false" : "true";
    }
    if (row.propertyBaseUrl === purity) {
      return row.operator === "lessThan" || row.operator === "lessThanOrEqual"
        ? "true"
        : "false";
    }
  }
  return null;
};

const isAboutSupplier = (condition: QueryDraft | undefined) =>
  !!condition?.conditions.some(
    (row) =>
      findPropertyType(row.propertyBaseUrl) &&
      mockEntityTypes[0].properties.some(
        (property) => property.baseUrl === row.propertyBaseUrl,
      ),
  );

/** Task 1: flag a bad batch. */
const gradeFlagBadBatch = (document: EditorDocument): Grade => {
  const checks = typeBaseUrl("Purity check");
  const steps = actionSteps(document);
  const notifies = steps.filter(
    (step) => step.actionDefinitionId === "sendEmail",
  );
  const readsChecks =
    steps.some(
      (step) =>
        step.actionDefinitionId === "queryEntities" &&
        document.queries[fieldKey(step.stepId, "query")]?.entityTypeBaseUrl ===
          checks,
    ) ||
    document.triggers.some(
      (trigger) => trigger.settings.entityTypeBaseUrl === checks,
    ) ||
    steps.some((step) => failedPort(conditionOf(document, step)) !== null);
  if (notifies.length === 0 || !readsChecks) {
    return "fail";
  }

  for (const notify of notifies) {
    for (const gate of steps.filter((step) =>
      ["if", "filterList"].includes(step.actionDefinitionId),
    )) {
      const condition = conditionOf(document, gate);
      const port = failedPort(condition);
      if (gate.actionDefinitionId === "if") {
        const onTrue = reachableFrom(document, gate.stepId, "true").has(
          notify.stepId,
        );
        const onFalse = reachableFrom(document, gate.stepId, "false").has(
          notify.stepId,
        );
        if (onTrue === onFalse) {
          continue;
        }
        if (port === null) {
          if (isAboutSupplier(condition)) {
            return "minor";
          }
          continue;
        }
        if ((onTrue && port === "true") || (onFalse && port === "false")) {
          return hasRecipient(document, notify.stepId) ? "complete" : "minor";
        }
      } else if (
        port !== null &&
        reachableFrom(document, gate.stepId).has(notify.stepId)
      ) {
        return hasRecipient(document, notify.stepId) ? "complete" : "minor";
      }
    }
  }
  return "major";
};

/** Task 2: one row per supplier with shipments in and failed checks. */
const gradeMonthlySummary = (document: EditorDocument): Grade => {
  const aggregates = actionSteps(document).filter(
    (step) => step.actionDefinitionId === "aggregate",
  );
  if (aggregates.length === 0) {
    return "fail";
  }
  const suppliers = typeBaseUrl("Supplier");
  const perSupplier = flattenSteps(document.steps).find(({ step }) => {
    if (step.kind !== "for-each" || step.over?.kind !== "step-output") {
      return false;
    }
    const producer = findStep(document, step.over.stepId)?.step;
    return (
      producer?.kind === "action" &&
      document.queries[fieldKey(producer.stepId, "query")]
        ?.entityTypeBaseUrl === suppliers
    );
  })?.step;
  const inside =
    perSupplier?.kind === "for-each"
      ? flattenSteps(perSupplier.steps).filter(
          ({ step }) =>
            step.kind === "action" && step.actionDefinitionId === "aggregate",
        ).length
      : 0;
  if (inside === 0) {
    return "major";
  }
  const shared = actionSteps(document).some((step) =>
    ["sendEmail", "createEntity", "updateEntity"].includes(
      step.actionDefinitionId,
    ),
  );
  return inside >= 2 && shared ? "complete" : "minor";
};

/** Task 3: hold shipments more than two days late for approval. */
const gradeHoldLateShipment = (document: EditorDocument): Grade => {
  const daysLate = propertyBaseUrl("Shipment", "Days late");
  const steps = actionSteps(document);
  const reviews = steps.filter(
    (step) => step.actionDefinitionId === "requestReview",
  );
  const gates = steps
    .filter((step) => step.actionDefinitionId === "if")
    .map((step) => ({
      step,
      row: conditionOf(document, step)?.conditions.find(
        (candidate) => candidate.propertyBaseUrl === daysLate,
      ),
    }))
    .filter(({ row }) => !!row);
  if (reviews.length === 0 || gates.length === 0) {
    return reviews.length > 0 ? "major" : "fail";
  }
  for (const { step: gate, row } of gates) {
    const latePort =
      row!.operator === "greaterThan" || row!.operator === "greaterThanOrEqual"
        ? "true"
        : "false";
    const onTimePort = latePort === "true" ? "false" : "true";
    const late = reachableFrom(document, gate.stepId, latePort);
    const onTime = reachableFrom(document, gate.stepId, onTimePort);
    const review = reviews.find(
      (candidate) =>
        late.has(candidate.stepId) && !onTime.has(candidate.stepId),
    );
    if (!review) {
      continue;
    }
    const afterReview = reachableFrom(document, review.stepId);
    const rejoins = [...onTime].some((id) => afterReview.has(id));
    const threshold = Number(row!.value);
    const rightThreshold =
      (row!.operator === "greaterThan" && threshold === 2) ||
      (row!.operator === "greaterThanOrEqual" && threshold === 3);
    if (!rejoins) {
      return "minor";
    }
    return rightThreshold ? "complete" : "minor";
  }
  return "major";
};

export const tasks: TaskDefinition[] = [
  {
    id: 1,
    scenario:
      "A shipment from Northfield Chemicals failed its purity check this morning. You want the quality lead to hear about it right away, and only for failed checks.",
    grade: gradeFlagBadBatch,
  },
  {
    id: 2,
    scenario:
      "At month end you want one row per supplier showing how many shipments came in and how many failed purity. You will share it with your manager.",
    grade: gradeMonthlySummary,
  },
  {
    id: 3,
    scenario:
      "Any shipment more than two days late should wait for a person to approve it before it joins this month's review. Shipments on time should go straight through.",
    grade: gradeHoldLateShipment,
  },
];

export const findTask = (id: number | null) =>
  tasks.find((task) => task.id === id);

/* ----------------------------------------------------------------------------------------------------------------
 * Session log, per browser, in localStorage. Every read and write is wrapped: private windows can throw.
 * ------------------------------------------------------------------------------------------------------------- */

export type TaskEvent = {
  type: "task shown" | "goal reached" | "done clicked" | "briefing reopened";
  at: string;
};

export type TaskSession = {
  id: string;
  taskId: number;
  startedAt: string;
  events: TaskEvent[];
  goalReachedAt?: string;
  doneAt?: string;
  /** The grade from the predicate when "I'm done" was clicked. */
  grade?: Grade;
};

const storageKey = "flows-editor-prototype:task-sessions";

export const readSessions = (): TaskSession[] => {
  try {
    const raw = globalThis.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as TaskSession[]) : [];
  } catch {
    return [];
  }
};

export const writeSession = (session: TaskSession) => {
  try {
    const others = readSessions().filter(
      (candidate) => candidate.id !== session.id,
    );
    globalThis.localStorage.setItem(
      storageKey,
      JSON.stringify([...others, session]),
    );
  } catch {
    // Storage can be blocked; the test still runs, it just isn't logged.
  }
};

export const clearSessions = () => {
  try {
    globalThis.localStorage.removeItem(storageKey);
  } catch {
    // Nothing to clear.
  }
};

export const newSession = (taskId: number): TaskSession => {
  const at = new Date().toISOString();
  return {
    id: `${taskId}-${Date.now().toString(36)}`,
    taskId,
    startedAt: at,
    events: [{ type: "task shown", at }],
  };
};
