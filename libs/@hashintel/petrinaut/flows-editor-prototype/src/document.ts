/**
 * The editor's document: a flow definition in the engine's own shape, plus what the editor needs that the engine
 * has no place for. Each extra is named for the hole it fills (see the holes log).
 */
import { getCatalogEntry } from "./catalog";
import { findPropertyType } from "./mock-graph";

import type {
  EntityQuery,
  FilterCondition,
  FilterLeaf,
  FlowInputDefinition,
  PayloadKind,
  StepInputSource,
} from "./engine";
import type { MockTriggers } from "./mock-triggers";

export const START_ID = "start";

/**
 * A step as the editor holds it. The engine's step types need `over` and `collect` on a for-each, so a for-each
 * that's just been placed can't be one yet: the engine has no draft shape.
 */
export type DraftActionStep = {
  kind: "action";
  stepId: string;
  actionDefinitionId: string;
  description: string;
  inputs: Record<string, StepInputSource>;
};

export type DraftForEachStep = {
  kind: "for-each";
  stepId: string;
  description: string;
  over?: StepInputSource;
  steps: DraftStep[];
  collect?: { stepId: string; outputName: string; as: string };
};

export type DraftStep = DraftActionStep | DraftForEachStep;

/** A source that a person picks: anything but a typed constant. */
export type RefSource = Exclude<StepInputSource, { kind: "constant" }>;

/** MOCK: a free-text value mixing typed text and references. The engine takes one source per input. */
export type TemplatePart =
  | { kind: "text"; text: string }
  | { kind: "ref"; source: RefSource };

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "isEmpty"
  | "isNotEmpty";

export type ConditionRow = {
  id: number;
  propertyBaseUrl: string;
  operator: ConditionOperator | null;
  value: string | number | null;
};

/** A condition row about the value itself rather than one of its entity's properties. */
export const VALUE_SUBJECT = "value";

/** The query builder's state for a Find entities step: a type and rows joined by AND. */
export type QueryDraft = {
  entityTypeBaseUrl?: string;
  conditions: ConditionRow[];
};

/** MOCK: one change to a property for Update entity, before it becomes a `PropertyPatch` (#10060). */
export type PatchDraft = {
  id: number;
  propertyBaseUrl: string;
  source: StepInputSource | null;
};

/** Order on the canvas. These are not data wires: the engine orders steps by the values they take. */
export type Wire = {
  id: string;
  source: string;
  /** "next", or the output a branch port stands for (an If's `true` or `false`). */
  sourcePort: string;
  target: string;
};

export type EditorDocument = {
  name: string;
  inputs: FlowInputDefinition[];
  steps: DraftStep[];
  positions: Record<string, { x: number; y: number }>;
  wires: Wire[];
  /** MOCK: free-text fields, keyed `stepId.inputName`. */
  templates: Record<string, TemplatePart[]>;
  /** MOCK: list fields holding several sources, keyed `stepId.inputName`. */
  lists: Record<string, StepInputSource[]>;
  /** Query builder state, keyed `stepId.inputName`; compiled into a constant `EntityQuery` or `FilterCondition`. */
  queries: Record<string, QueryDraft>;
  /** MOCK: Update entity's changes, keyed by step id. */
  patches: Record<string, PatchDraft[]>;
  triggers: MockTriggers;
  /** MOCK: the entity type of each `EntityId` flow input. `FlowInputDefinition` has no field for it. */
  inputEntityTypes: Record<string, string>;
};

export const fieldKey = (stepId: string, inputName: string) =>
  `${stepId}.${inputName}`;

export const emptyDocument = (name = "Untitled flow"): EditorDocument => ({
  name,
  inputs: [],
  steps: [],
  positions: { [START_ID]: { x: 80, y: 220 } },
  wires: [],
  templates: {},
  lists: {},
  queries: {},
  patches: {},
  triggers: { schedule: null, entity: null },
  inputEntityTypes: {},
});

/** Every step, with the id of the for-each it sits in, outer steps first. */
export const flattenSteps = (
  steps: DraftStep[],
  parentId: string | null = null,
): { step: DraftStep; parentId: string | null }[] =>
  steps.flatMap((step) => [
    { step, parentId },
    ...(step.kind === "for-each" ? flattenSteps(step.steps, step.stepId) : []),
  ]);

export const findStep = (document: EditorDocument, stepId: string) =>
  flattenSteps(document.steps).find(({ step }) => step.stepId === stepId);

export const mapSteps = (
  steps: DraftStep[],
  update: (step: DraftStep) => DraftStep,
): DraftStep[] =>
  steps.map((step) => {
    const updated = update(step);
    return updated.kind === "for-each"
      ? { ...updated, steps: mapSteps(updated.steps, update) }
      : updated;
  });

const removeFromSteps = (steps: DraftStep[], stepId: string): DraftStep[] =>
  steps
    .filter((step) => step.stepId !== stepId)
    .map((step) =>
      step.kind === "for-each"
        ? { ...step, steps: removeFromSteps(step.steps, stepId) }
        : step,
    );

export const stepTitle = (step: DraftStep) =>
  step.kind === "for-each"
    ? "For each"
    : (getCatalogEntry(step.actionDefinitionId)?.title ??
      step.actionDefinitionId);

/** A step id from its title, unique in the document, as the engine's builder writes them (`findSuppliers`). */
export const newStepId = (document: EditorDocument, title: string) => {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, next: string | undefined) =>
      next ? next.toUpperCase() : "",
    );
  const taken = new Set(
    flattenSteps(document.steps).map(({ step }) => step.stepId),
  );
  let candidate = base;
  for (let index = 2; taken.has(candidate) || candidate === START_ID; index++) {
    candidate = `${base}${index}`;
  }
  return candidate;
};

export type Placement = {
  /** Wire the new step after this step (or Start), on this port. */
  after?: { stepId: string; port: string };
  /** Put the new step inside this for-each. */
  parentId?: string | null;
  position?: { x: number; y: number };
};

const stepWidth = 240;
const columnGap = 80;

export const addStep = (
  document: EditorDocument,
  catalogId: string,
  placement: Placement,
): { document: EditorDocument; stepId: string } => {
  const entry = getCatalogEntry(catalogId);
  const title = entry?.title ?? catalogId;
  const stepId = newStepId(document, title);

  const step: DraftStep =
    catalogId === "forEach"
      ? { kind: "for-each", stepId, description: "For each item", steps: [] }
      : {
          kind: "action",
          stepId,
          actionDefinitionId: catalogId,
          description: title,
          inputs: {},
        };

  const parentId =
    placement.parentId !== undefined
      ? placement.parentId
      : placement.after
        ? (findStep(document, placement.after.stepId)?.parentId ?? null)
        : null;

  const afterPosition = placement.after
    ? document.positions[placement.after.stepId]
    : undefined;
  const siblingsAfter = placement.after
    ? document.wires.filter(
        (wire) =>
          wire.source === placement.after?.stepId &&
          wire.sourcePort === placement.after.port,
      ).length
    : 0;
  const portIndex = placement.after && placement.after.port === "false" ? 1 : 0;

  const position =
    placement.position ??
    (afterPosition
      ? {
          x:
            afterPosition.x +
            (placement.after?.stepId === parentId ? 32 : stepWidth + columnGap),
          y: afterPosition.y + (siblingsAfter + portIndex) * 120,
        }
      : { x: 120, y: 80 });

  const insert = (steps: DraftStep[]): DraftStep[] =>
    parentId === null
      ? [...steps, step]
      : steps.map((candidate) =>
          candidate.kind === "for-each"
            ? candidate.stepId === parentId
              ? { ...candidate, steps: [...candidate.steps, step] }
              : { ...candidate, steps: insert(candidate.steps) }
            : candidate,
        );

  const wires =
    placement.after && placement.after.stepId !== parentId
      ? [
          ...document.wires,
          {
            id: `${placement.after.stepId}:${placement.after.port}->${stepId}`,
            source: placement.after.stepId,
            sourcePort: placement.after.port,
            target: stepId,
          },
        ]
      : document.wires;

  return {
    stepId,
    document: {
      ...document,
      steps:
        parentId === null ? [...document.steps, step] : insert(document.steps),
      positions: { ...document.positions, [stepId]: position },
      wires,
    },
  };
};

export const removeStep = (
  document: EditorDocument,
  stepId: string,
): EditorDocument => {
  const removed = findStep(document, stepId);
  const removedIds = new Set(
    removed
      ? flattenSteps([removed.step]).map(({ step }) => step.stepId)
      : [stepId],
  );
  const referencesRemoved = (source: StepInputSource | undefined) =>
    source?.kind === "step-output" && removedIds.has(source.stepId);

  return {
    ...document,
    steps: mapSteps(removeFromSteps(document.steps, stepId), (step) =>
      step.kind === "action"
        ? {
            ...step,
            inputs: Object.fromEntries(
              Object.entries(step.inputs).filter(
                ([, source]) => !referencesRemoved(source),
              ),
            ),
          }
        : step,
    ),
    wires: document.wires.filter(
      (wire) => !removedIds.has(wire.source) && !removedIds.has(wire.target),
    ),
  };
};

export const updateStep = (
  document: EditorDocument,
  stepId: string,
  update: (step: DraftStep) => DraftStep,
): EditorDocument => ({
  ...document,
  steps: mapSteps(document.steps, (step) =>
    step.stepId === stepId ? update(step) : step,
  ),
});

export const setInputSource = (
  document: EditorDocument,
  stepId: string,
  inputName: string,
  source: StepInputSource | null,
): EditorDocument =>
  updateStep(document, stepId, (step) => {
    if (step.kind !== "action") {
      return step;
    }
    const inputs = { ...step.inputs };
    if (source) {
      inputs[inputName] = source;
    } else {
      delete inputs[inputName];
    }
    return { ...step, inputs };
  });

/** Steps that come before `stepId` on the canvas, nearest first: what its inputs may take values from. */
export const earlierStepIds = (
  document: EditorDocument,
  stepId: string,
): string[] => {
  const incoming = (target: string) =>
    document.wires
      .filter((wire) => wire.target === target)
      .map((wire) => wire.source);

  const seen = new Set<string>();
  const order: string[] = [];
  let frontier = [stepId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const current of frontier) {
      const parentId = findStep(document, current)?.parentId;
      // A step inside a for-each comes after whatever comes before the for-each.
      const before = [...incoming(current), ...(parentId ? [parentId] : [])];
      for (const candidate of before) {
        if (!seen.has(candidate) && candidate !== START_ID) {
          seen.add(candidate);
          order.push(candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next;
  }

  return order;
};

/** Which steps read an output, for the "used by" chips (D26 A). */
export const usersOf = (
  document: EditorDocument,
  match: (source: StepInputSource) => boolean,
): string[] => {
  const users = new Set<string>();
  for (const { step } of flattenSteps(document.steps)) {
    if (step.kind === "action") {
      for (const source of Object.values(step.inputs)) {
        if (match(source)) {
          users.add(step.stepId);
        }
      }
    } else if (step.over && match(step.over)) {
      users.add(step.stepId);
    }
  }
  for (const [key, parts] of Object.entries(document.templates)) {
    if (parts.some((part) => part.kind === "ref" && match(part.source))) {
      users.add(key.split(".")[0]!);
    }
  }
  for (const [key, items] of Object.entries(document.lists)) {
    if (items.some(match)) {
      users.add(key.split(".")[0]!);
    }
  }
  for (const [stepId, patches] of Object.entries(document.patches)) {
    if (patches.some((patch) => patch.source && match(patch.source))) {
      users.add(stepId);
    }
  }
  return [...users];
};

/**
 * The engine input a free-text value stands for. One reference and no text is a real connection; text alone is a
 * constant. Text with references has no engine shape, so it returns `null` and the field is marked as mock.
 */
export const templateToSource = (
  parts: TemplatePart[],
): StepInputSource | null | undefined => {
  const meaningful = parts.filter(
    (part) => part.kind === "ref" || part.text.trim() !== "",
  );
  if (meaningful.length === 0) {
    return undefined;
  }
  if (meaningful.length === 1 && meaningful[0]!.kind === "ref") {
    return meaningful[0]!.source;
  }
  if (meaningful.every((part) => part.kind === "text")) {
    return {
      kind: "constant",
      payload: {
        kind: "Text",
        value: parts
          .map((part) => (part.kind === "text" ? part.text : ""))
          .join(""),
      },
    };
  }
  return null;
};

/** The engine input a list field stands for, or `null` when it mixes sources, which the engine can't hold. */
export const listToSource = (
  items: StepInputSource[],
  kind: PayloadKind,
): StepInputSource | null | undefined => {
  if (items.length === 0) {
    return undefined;
  }
  if (items.every((item) => item.kind === "constant")) {
    return {
      kind: "constant",
      payload: {
        kind,
        value: items.map(
          (item) => (item as { payload: { value: unknown } }).payload.value,
        ),
      },
    };
  }
  if (items.length === 1) {
    const [only] = items;
    return only!.kind === "constant" ? only : { ...only!, wrap: true };
  }
  return null;
};

const graphOperator: Partial<Record<ConditionOperator, string>> = {
  equals: "equal",
  notEquals: "notEqual",
  greaterThan: "greater",
  greaterThanOrEqual: "greaterOrEqual",
  lessThan: "less",
  lessThanOrEqual: "lessOrEqual",
};

/**
 * The graph filter a query draft stands for, in the shape `queryEntities` takes. The graph has no plain "contains"
 * for text, so that row is dropped here (a hole: two condition languages).
 */
export const queryDraftToEntityQuery = (draft: QueryDraft): EntityQuery => {
  const clauses: unknown[] = [];
  if (draft.entityTypeBaseUrl) {
    clauses.push({
      equal: [
        { path: ["type", "baseUrl"] },
        { parameter: draft.entityTypeBaseUrl },
      ],
    });
  }
  for (const row of draft.conditions) {
    const path = { path: ["properties", row.propertyBaseUrl] };
    if (row.operator === "isEmpty" || row.operator === "isNotEmpty") {
      const exists = { exists: path };
      clauses.push(row.operator === "isEmpty" ? { not: exists } : exists);
      continue;
    }
    const operator = row.operator ? graphOperator[row.operator] : undefined;
    if (operator && row.value !== null) {
      clauses.push({ [operator]: [path, { parameter: row.value }] });
    }
  }
  return { filter: { all: clauses } } as unknown as EntityQuery;
};

/** The engine condition a condition draft stands for, reading entity properties or the value itself. */
export const queryDraftToFilterCondition = (
  draft: QueryDraft,
  valueKind: PayloadKind = "Text",
): FilterCondition | null => {
  const leaves: FilterLeaf[] = [];
  for (const row of draft.conditions) {
    if (!row.operator) {
      continue;
    }
    const property = findPropertyType(row.propertyBaseUrl);
    const readsEntity = row.propertyBaseUrl !== VALUE_SUBJECT;
    const payloadKind = property?.payloadKind ?? valueKind;
    const subject = readsEntity
      ? {
          kind: "entityProperty" as const,
          propertyTypeBaseUrl: row.propertyBaseUrl,
          payloadKind,
        }
      : { kind: "input" as const, payloadKind };
    if (row.operator === "isEmpty" || row.operator === "isNotEmpty") {
      leaves.push({
        kind: "condition",
        subject,
        operator: row.operator,
      } as FilterLeaf);
    } else if (row.value !== null) {
      leaves.push({
        kind: "condition",
        subject,
        operator: row.operator,
        value: { kind: payloadKind, value: row.value },
      } as FilterLeaf);
    }
  }
  return leaves.length > 0 ? { kind: "all", conditions: leaves } : null;
};
