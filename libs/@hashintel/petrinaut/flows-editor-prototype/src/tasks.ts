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
  entityTypeOf,
  flattenSteps,
  type QueryDraft,
} from "./document";
import { findPropertyType, mockEntities, mockEntityTypes } from "./mock-graph";

import type { StepInputSource } from "./engine";

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

/** The quality lead in the world (mock graph): Maya Patel. */
const qualityLead = mockEntities.find((entity) =>
  entity.label.toLowerCase().includes("quality lead"),
);

/** Whether one recipient source reaches the quality lead: her entity, her name or role typed, or an input named so. */
const isQualityLead = (document: EditorDocument, source: StepInputSource) => {
  if (source.kind === "constant") {
    const value = String(source.payload.value).toLowerCase();
    return (
      (!!qualityLead && value === qualityLead.entityId.toLowerCase()) ||
      value.includes("maya") ||
      value.includes("quality lead")
    );
  }
  if (source.kind === "flow-input") {
    const input = document.inputs.find(
      (candidate) => candidate.name === source.inputName,
    );
    return /quality lead|maya/i.test(input?.label ?? input?.name ?? "");
  }
  return false;
};

/** Task 1 needs the notice addressed to the quality lead, not just to someone. */
const goesToQualityLead = (document: EditorDocument, stepId: string) => {
  const step = findStep(document, stepId)?.step;
  const sources = [
    ...(document.lists[fieldKey(stepId, "to")] ?? []),
    ...(step?.kind === "action" && step.inputs.to ? [step.inputs.to] : []),
  ];
  const typed = document.templates[fieldKey(stepId, "to")];
  return (
    sources.some((source) => isQualityLead(document, source)) ||
    (typed ?? []).some(
      (part) =>
        (part.kind === "text" && /quality lead|maya/i.test(part.text)) ||
        (part.kind === "ref" && isQualityLead(document, part.source)),
    )
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

  // A trigger on purity checks whose condition matches failed ones gates the whole flow (field kinds v2: the trigger's
  // condition is a condition builder now, so it can be graded).
  const failedOnly = document.triggers.some(
    (trigger) =>
      trigger.settings.entityTypeBaseUrl === checks &&
      failedPort(document.queries[fieldKey(trigger.id, "condition")]) ===
        "true",
  );
  if (failedOnly) {
    return notifies.some((notify) => goesToQualityLead(document, notify.stepId))
      ? "complete"
      : "major";
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
        // Right branch; the notice must reach the quality lead, or the job is not done (major).
        if ((onTrue && port === "true") || (onFalse && port === "false")) {
          return goesToQualityLead(document, notify.stepId)
            ? "complete"
            : "major";
        }
      } else if (
        port !== null &&
        reachableFrom(document, gate.stepId).has(notify.stepId)
      ) {
        return goesToQualityLead(document, notify.stepId)
          ? "complete"
          : "major";
      }
    }
  }
  return "major";
};

/**
 * Task 2: one row per supplier with shipments in and failed checks, then shared. Outcome, not path: any per-supplier
 * group (a For each over suppliers, however the list is found) holding two counts passes. A count is an Aggregate,
 * a Find entities (it gives a count), or a Filter list (its matching list counts the failures).
 */
const countingSteps = ["aggregate", "queryEntities", "filterList"];
const sharingSteps = [
  "sendEmail",
  "createEntity",
  "updateEntity",
  "requestReview",
];

const gradeMonthlySummary = (document: EditorDocument): Grade => {
  const suppliers = typeBaseUrl("Supplier");
  const counts = (steps: DraftStep[]) =>
    flattenSteps(steps).filter(
      ({ step }) =>
        step.kind === "action" &&
        countingSteps.includes(step.actionDefinitionId),
    ).length;
  const perSupplier = flattenSteps(document.steps)
    .map(({ step }) => step)
    .filter(
      (step) =>
        step.kind === "for-each" &&
        !!step.over &&
        entityTypeOf(document, step.over, step.stepId) === suppliers,
    );
  const best = Math.max(
    0,
    ...perSupplier.map((group) =>
      group.kind === "for-each" ? counts(group.steps) : 0,
    ),
  );
  const shared = actionSteps(document).some((step) =>
    sharingSteps.includes(step.actionDefinitionId),
  );
  if (best === 0) {
    // Counts that exist only for the whole month are totals, not per supplier.
    const anyCount = actionSteps(document).some(
      (step) => step.actionDefinitionId === "aggregate",
    );
    return anyCount ? "major" : "fail";
  }
  if (best === 1) {
    return "minor";
  }
  return shared ? "complete" : "minor";
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
