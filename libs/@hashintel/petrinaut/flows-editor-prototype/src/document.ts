/**
 * The editor's document: a flow definition in the engine's own shape, plus what the editor needs that the engine
 * has no place for. Each extra is named for the hole it fills (see the holes log).
 */
import { getCatalogEntry } from "./catalog";
import { findPropertyType } from "./mock-graph";
import {
  type TriggerKind,
  type TriggerNode,
  triggerDefinitions,
} from "./mock-triggers";

import type {
  EntityQuery,
  FilterCondition,
  FilterLeaf,
  FlowInputDefinition,
  PayloadKind,
  StepInputSource,
} from "./engine";

/** The Start block: always on the canvas, holds the flow's inputs, and can't be deleted. */
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
  | "isNotEmpty"
  /** A date in a month (Journey 3: "Received date is in October 2026"). */
  | "isIn"
  /** A link to any of a list of entities (Journey 3: "Shipment is any of …"). */
  | "isAnyOf";

export type ConditionRow = {
  id: number;
  propertyBaseUrl: string;
  operator: ConditionOperator | null;
  value: string | number | null;
  /** MOCK: the picked values of a list operator ("is any of"), by label. */
  values?: string[];
  /** MOCK, editor side: a date relative to the run ("Today", "3 days ago"). The engine stores fixed dates only. */
  relative?: RelativeDate;
  /** MOCK: the value comes from an earlier step or a flow input. The engine's condition values are constants. */
  valueSource?: StepInputSource;
};

/** MOCK: a date relative to the run (Attio's date menu). No engine shape. */
export type RelativeDate =
  | { kind: "today" | "yesterday" | "weekAgo" | "monthAgo" }
  | { kind: "daysAgo"; days: number };

/** A group of conditions inside the builder: its own and/or (J3 A1's grey box). */
export type QueryGroup = {
  id: number;
  conjunction: "and" | "or";
  conditions: ConditionRow[];
};

/** A condition row about the value itself rather than one of its entity's properties. */
export const VALUE_SUBJECT = "value";

/** The query builder's state for a Find entities step: a type and rows joined by AND. */
export type QueryDraft = {
  entityTypeBaseUrl?: string;
  /** MOCK: the entity type comes from an earlier step or a flow input. The engine's query is one constant. */
  entityTypeSource?: StepInputSource;
  conditions: ConditionRow[];
  /** How the top-level rows combine; "and" when unset. */
  conjunction?: "and" | "or";
  /** Grouped rows, each a nested and/or. */
  groups?: QueryGroup[];
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
  /** Trigger nodes left of Start (editor layer: the engine definition has inputs, not triggers). */
  triggers: TriggerNode[];
  startDescription: string;
  /** MOCK: the entity type of each `EntityId` flow input. `FlowInputDefinition` has no field for it. */
  inputEntityTypes: Record<string, string>;
  /** MOCK: each flow input's default for the run form. `FlowInputDefinition` has no default. */
  inputDefaults?: Record<string, string>;
};

export const fieldKey = (stepId: string, inputName: string) =>
  `${stepId}.${inputName}`;

export const emptyDocument = (name = "Untitled flow"): EditorDocument => ({
  name,
  inputs: [],
  steps: [],
  positions: { [START_ID]: { x: 360, y: 220 } },
  wires: [],
  templates: {},
  lists: {},
  queries: {},
  patches: {},
  triggers: [],
  startDescription: "",
  inputEntityTypes: {},
});

export const findTrigger = (document: EditorDocument, id: string) =>
  document.triggers.find((trigger) => trigger.id === id);

export const isTriggerId = (document: EditorDocument, id: string) =>
  document.triggers.some((trigger) => trigger.id === id);

/** Places a trigger left of Start, under the others, and wires it into Start. */
export const addTrigger = (
  document: EditorDocument,
  kind: TriggerKind,
): { document: EditorDocument; triggerId: string } => {
  let triggerId: string = kind;
  for (let index = 2; isTriggerId(document, triggerId); index += 1) {
    triggerId = `${kind}${index}`;
  }
  const start = document.positions[START_ID] ?? { x: 360, y: 220 };
  const lowest = Math.max(
    start.y - 130,
    ...document.triggers.map(
      (trigger) => document.positions[trigger.id]?.y ?? 0,
    ),
  );
  return {
    triggerId,
    document: {
      ...document,
      triggers: [
        ...document.triggers,
        {
          id: triggerId,
          kind,
          description: "",
          settings: triggerDefinitions[kind].defaults(),
        },
      ],
      positions: {
        ...document.positions,
        [triggerId]: {
          x: start.x - 296,
          y: document.triggers.length === 0 ? start.y : lowest + 130,
        },
      },
      wires: [
        ...document.wires,
        {
          id: `${triggerId}:next->${START_ID}`,
          source: triggerId,
          sourcePort: "next",
          target: START_ID,
        },
      ],
    },
  };
};

export const removeTrigger = (
  document: EditorDocument,
  triggerId: string,
): EditorDocument => ({
  ...document,
  triggers: document.triggers.filter((trigger) => trigger.id !== triggerId),
  wires: document.wires.filter((wire) => wire.source !== triggerId),
});

export const updateTrigger = (
  document: EditorDocument,
  triggerId: string,
  update: (trigger: TriggerNode) => TriggerNode,
): EditorDocument => ({
  ...document,
  triggers: document.triggers.map((trigger) =>
    trigger.id === triggerId ? update(trigger) : trigger,
  ),
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

/** What a step is called on screen: its description, or its type when it has none. */
export const stepLabel = (step: DraftStep) =>
  step.description || stepTitle(step);

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
  for (
    let index = 2;
    taken.has(candidate) ||
    candidate === START_ID ||
    isTriggerId(document, candidate);
    index++
  ) {
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

// ↳ Current: 200 px cards, 96 px between them.
const stepWidth = 200;
const columnGap = 96;

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
      ? { kind: "for-each", stepId, description: "", steps: [] }
      : {
          kind: "action",
          stepId,
          actionDefinitionId: catalogId,
          description: "",
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
        if (
          !seen.has(candidate) &&
          candidate !== START_ID &&
          !isTriggerId(document, candidate)
        ) {
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
  const clause = (row: ConditionRow): unknown => {
    const path = { path: ["properties", row.propertyBaseUrl] };
    if (row.operator === "isEmpty" || row.operator === "isNotEmpty") {
      const exists = { exists: path };
      return row.operator === "isEmpty" ? { not: exists } : exists;
    }
    // Relative dates and "is in month" are editor mocks: they have no graph filter.
    const operator =
      row.operator && !row.relative ? graphOperator[row.operator] : undefined;
    return operator && row.value !== null
      ? { [operator]: [path, { parameter: row.value }] }
      : null;
  };
  const combine = (conjunction: "and" | "or" | undefined, parts: unknown[]) =>
    conjunction === "or" ? { any: parts } : { all: parts };
  const rows = draft.conditions.map(clause).filter((part) => part !== null);
  const groups = (draft.groups ?? []).map((group) =>
    combine(
      group.conjunction,
      group.conditions.map(clause).filter((part) => part !== null),
    ),
  );
  const conditions = combine(draft.conjunction, [...rows, ...groups]);
  const typeClause = draft.entityTypeBaseUrl
    ? [
        {
          equal: [
            { path: ["type", "baseUrl"] },
            { parameter: draft.entityTypeBaseUrl },
          ],
        },
      ]
    : [];
  return {
    filter: { all: [...typeClause, conditions] },
  } as unknown as EntityQuery;
};

/** The engine condition a condition draft stands for, reading entity properties or the value itself. */
export const queryDraftToFilterCondition = (
  draft: QueryDraft,
  valueKind: PayloadKind = "Text",
): FilterCondition | null => {
  const leaf = (row: ConditionRow): FilterLeaf | null => {
    // Relative dates and "is in month" are editor mocks with no engine value.
    if (!row.operator || row.relative || row.operator === "isIn") {
      return null;
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
      return {
        kind: "condition",
        subject,
        operator: row.operator,
      } as FilterLeaf;
    }
    return row.value === null
      ? null
      : ({
          kind: "condition",
          subject,
          operator: row.operator,
          value: { kind: payloadKind, value: row.value },
        } as FilterLeaf);
  };
  const leaves = (rows: ConditionRow[]) =>
    rows.map(leaf).filter((candidate): candidate is FilterLeaf => !!candidate);
  const groups = (draft.groups ?? [])
    .map((group) => ({
      kind: group.conjunction === "or" ? "any" : "all",
      conditions: leaves(group.conditions),
    }))
    .filter((group) => group.conditions.length > 0);
  const all = [...leaves(draft.conditions), ...groups];
  return all.length > 0
    ? ({
        kind: draft.conjunction === "or" ? "any" : "all",
        conditions: all,
      } as FilterCondition)
    : null;
};
