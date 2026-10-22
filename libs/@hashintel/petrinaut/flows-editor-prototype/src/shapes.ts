/**
 * Bridges the editor's document to the engine: turns it into a real `FlowDefinition`, and asks the engine which
 * values fit which inputs (`canConnect`, `createStepShapeResolver`) and what's wrong (`validateFlowDefinition`).
 */
import { type CatalogEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  START_ID,
  type DraftStep,
  type EditorDocument,
  earlierStepIds,
  fieldKey,
  stepLabel,
  findStep,
  flattenSteps,
  itemName,
  listToSource,
  queryDraftToEntityQuery,
  queryDraftToFilterCondition,
  templateToSource,
} from "./document";
import {
  type ActionDefinition,
  actionDefinitions,
  canConnect,
  type ConnectionSource,
  createStepShapeResolver,
  type EditorFlowDefinition,
  type EditorStep,
  type FlowActionDefinitionId,
  type FlowDefinitionDiagnostic,
  type FlowInputDefinition,
  type PayloadKind,
  type StepInputSource,
  validateFlowDefinition,
} from "./engine";
import {
  isMockActionDefinitionId,
  isMockPayloadKind,
  mockActionDefinitions,
  readEntityKinds,
} from "./mock-action-definitions";

type EngineActionDefinitions = Record<
  string,
  ActionDefinition<FlowActionDefinitionId>
>;

/**
 * The actions the validator knows: the engine's, plus the mocks in engine shape. Read entity's output kind is
 * declared by its `property` constant (#10051), which `main`'s resolver can't follow, so each kind gets its own
 * action id (`readEntity:Text`). Inputs of kinds `main` lacks are left out: the validator's schema rejects them.
 */
const editorActionDefinitions: EngineActionDefinitions = (() => {
  const definitions: Record<string, unknown> = { ...actionDefinitions };
  for (const mock of Object.values(mockActionDefinitions)) {
    const inputs = mock.inputs
      .filter((input) => !input.oneOfPayloadKinds.some(isMockPayloadKind))
      .map(({ hasDefault, ...input }) => ({
        ...input,
        ...(hasDefault ? { default: { kind: "Boolean", value: false } } : {}),
      }));
    if (mock.actionDefinitionId === "readEntity") {
      for (const kind of readEntityKinds) {
        const id = `readEntity:${kind}`;
        definitions[id] = {
          ...mock,
          actionDefinitionId: id,
          inputs,
          outputs: [
            {
              name: "value",
              payloadKind: kind,
              array: false,
              required: false,
            },
          ],
        };
      }
    } else {
      definitions[mock.actionDefinitionId] = { ...mock, inputs };
    }
  }
  return definitions as EngineActionDefinitions;
})();

/** The kind a Read entity step's `property` constant declares, if it has one. */
const declaredReadKind = (inputs: Record<string, StepInputSource>) => {
  const property = inputs.property;
  if (property?.kind !== "constant") {
    return undefined;
  }
  const value = property.payload.value as { payloadKind?: string } | null;
  return (readEntityKinds as readonly string[]).includes(
    value?.payloadKind ?? "",
  )
    ? (value!.payloadKind as PayloadKind)
    : undefined;
};

export type FieldState = "engine" | "mock" | "empty";

/**
 * The input an editor field stands for in the engine: a real source, nothing yet, or `null` when the field holds
 * something only the mock layer can (text mixed with references, a list of several sources).
 */
export const engineSourceFor = (
  document: EditorDocument,
  step: Extract<DraftStep, { kind: "action" }>,
  input: InputView,
): StepInputSource | null | undefined => {
  const key = fieldKey(step.stepId, input.name);
  if (document.templates[key]) {
    return templateToSource(document.templates[key]);
  }
  const query = document.queries[key];
  // A value or type taken from another step has no engine shape: the query is one constant.
  const usesReferences =
    !!query?.entityTypeSource ||
    !!query?.conditions.some(
      (row) =>
        row.valueSource ||
        row.operator === "isIn" ||
        row.operator === "isAnyOf",
    );
  if (query && usesReferences) {
    return null;
  }
  if (query && input.kinds?.includes("EntityQuery")) {
    return {
      kind: "constant",
      payload: { kind: "EntityQuery", value: queryDraftToEntityQuery(query) },
    };
  }
  if (query && input.kinds?.includes("FilterCondition")) {
    const condition = queryDraftToFilterCondition(query);
    return condition
      ? {
          kind: "constant",
          payload: { kind: "FilterCondition", value: condition },
        }
      : undefined;
  }
  if (document.lists[key]) {
    const kind = input.kinds?.find(
      (candidate) => !isMockPayloadKind(candidate),
    );
    return listToSource(document.lists[key], (kind ?? "Text") as PayloadKind);
  }
  return step.inputs[input.name];
};

/** A flow input as the editor shows it: Start holds every one. */
export type TriggerInput = {
  input: FlowInputDefinition;
  triggerId: string;
  label: string;
};

/** Every flow input the engine sees: Start's inputs. Triggers map their data onto these (editor layer). */
export const triggerFlowInputs = (document: EditorDocument): TriggerInput[] =>
  document.inputs.map((input) => ({
    input,
    triggerId: START_ID,
    label: input.label ?? input.name,
  }));

const startLook = { icon: "playFilled" as const, title: "Start" };

/** The look of the block a flow input comes from: always Start. */
export const triggerForInput = (
  document: EditorDocument,
  inputName: string,
) => {
  const found = triggerFlowInputs(document).find(
    (candidate) => candidate.input.name === inputName,
  );
  return found ? { definition: startLook, label: found.label } : undefined;
};

export type EngineDefinition = {
  definition: EditorFlowDefinition;
  /** Fields that only the mock layer can hold, keyed `stepId.inputName`. */
  mockFields: Set<string>;
  /** For-each steps left out because they have no list or nothing to collect yet. */
  incomplete: Set<string>;
};

/**
 * `forShapes` keeps a for-each that has a list but nothing to collect yet, so the steps inside can already see the
 * item. The validator gets the strict version.
 */
export const toEngineDefinition = (
  document: EditorDocument,
  { forShapes = false }: { forShapes?: boolean } = {},
): EngineDefinition => {
  const mockFields = new Set<string>();
  const incomplete = new Set<string>();

  const convert = (steps: DraftStep[]): EditorStep[] =>
    steps.flatMap((step): EditorStep[] => {
      if (step.kind === "for-each") {
        if (!step.over || (!step.collect && !forShapes)) {
          incomplete.add(step.stepId);
          return [];
        }
        return [
          {
            kind: "for-each",
            stepId: step.stepId,
            description: step.description,
            over: step.over,
            steps: convert(step.steps),
            collect: step.collect ?? { stepId: "", outputName: "", as: "" },
          },
        ];
      }

      const entry = getCatalogEntry(step.actionDefinitionId);
      const inputs: Record<string, StepInputSource> = {};
      for (const input of entry?.inputs ?? []) {
        if (input.kinds?.some(isMockPayloadKind)) {
          continue;
        }
        const source = engineSourceFor(document, step, input);
        if (source === null) {
          mockFields.add(fieldKey(step.stepId, input.name));
        } else if (source) {
          inputs[input.name] = source;
        }
      }

      const actionDefinitionId =
        step.actionDefinitionId === "readEntity"
          ? `readEntity:${declaredReadKind(step.inputs) ?? "Text"}`
          : step.actionDefinitionId;

      return [
        {
          kind: "action",
          stepId: step.stepId,
          actionDefinitionId,
          description: step.description,
          inputs,
        },
      ];
    });

  return {
    definition: {
      name: document.name,
      description: "",
      inputs: triggerFlowInputs(document).map(({ input }) => input),
      steps: convert(document.steps),
      outputs: [],
    },
    mockFields,
    incomplete,
  };
};

const resolverFor = (document: EditorDocument) =>
  createStepShapeResolver(
    toEngineDefinition(document, { forShapes: true }).definition,
    editorActionDefinitions,
  );

/** The for-each steps around a step, outermost first: the scope the engine resolves `item` in. */
const scopeOf = (document: EditorDocument, stepId: string): string[] => {
  const scope: string[] = [];
  let parentId = findStep(document, stepId)?.parentId ?? null;
  while (parentId) {
    scope.unshift(parentId);
    parentId = findStep(document, parentId)?.parentId ?? null;
  }
  return scope;
};

export const getSourceShape = (
  document: EditorDocument,
  source: StepInputSource,
  stepId: string,
): ConnectionSource | null =>
  resolverFor(document).getSourceShape(source, scopeOf(document, stepId));

/** The shape of one item of a for-each's list, as the steps inside it see it. */
export const getItemShape = (
  document: EditorDocument,
  forEachId: string,
): ConnectionSource | null =>
  resolverFor(document).getSourceShape({ kind: "item" }, [
    ...scopeOf(document, forEachId),
    forEachId,
  ]);

export type SourceOption = {
  source: StepInputSource;
  group: "Flow inputs" | "This item" | "Earlier steps";
  /** The step or input the value comes from. */
  ownerLabel: string;
  label: string;
  shape: ConnectionSource;
  /** Set when the connection only fits with an option: skip when missing, or wrap into a list. */
  note?: string;
};

/** The kinds an input accepts, following `kindFrom` to the kind connected to its kind source. */
export const acceptedKinds = (
  document: EditorDocument,
  stepId: string,
  input: InputView,
  entry: CatalogEntry,
): readonly string[] => {
  if (input.kinds) {
    return input.kinds;
  }
  const kindSource = entry.inputs.find(
    (candidate) => candidate.name === input.kindFrom,
  );
  const step = findStep(document, stepId)?.step;
  const source =
    step?.kind === "action" && kindSource
      ? step.inputs[kindSource.name]
      : undefined;
  const shape = source ? getSourceShape(document, source, stepId) : null;
  return shape ? [shape.payloadKind] : (kindSource?.kinds ?? []);
};

/**
 * Every value that fits an input, grouped as the source menu shows them. Only compatible values appear (Ciarán, 20
 * Oct): the engine's `canConnect` decides, trying "skip when missing" and "wrap into a list" before giving up.
 */
export const sourceOptions = (
  document: EditorDocument,
  stepId: string,
  input: InputView,
  entry: CatalogEntry,
): SourceOption[] => {
  const resolver = resolverFor(document);
  const scope = scopeOf(document, stepId);
  const target = {
    oneOfPayloadKinds: acceptedKinds(
      document,
      stepId,
      input,
      entry,
    ) as PayloadKind[],
    array: input.array,
    required: input.required && !input.hasDefault,
  };

  const fit = (
    source: Exclude<StepInputSource, { kind: "constant" }>,
    shape: ConnectionSource,
  ): { source: StepInputSource; note?: string } | null => {
    if (canConnect({ source: shape, target }).ok) {
      return { source };
    }
    if (canConnect({ source: shape, target, skipWhenMissing: true }).ok) {
      return {
        source: { ...source, whenMissing: "skip" },
        note: "Skips this step when missing",
      };
    }
    if (!shape.array && canConnect({ source: shape, target, wrap: true }).ok) {
      return { source: { ...source, wrap: true }, note: "As a list of one" };
    }
    if (
      !shape.array &&
      canConnect({ source: shape, target, wrap: true, skipWhenMissing: true })
        .ok
    ) {
      return {
        source: { ...source, wrap: true, whenMissing: "skip" },
        note: "As a list of one; skips when missing",
      };
    }
    return null;
  };

  const options: SourceOption[] = [];

  for (const { input: flowInput, label } of triggerFlowInputs(document)) {
    const source = { kind: "flow-input" as const, inputName: flowInput.name };
    const shape = resolver.getSourceShape(source, scope);
    const fitted = shape ? fit(source, shape) : null;
    if (shape && fitted) {
      options.push({
        ...fitted,
        group: "Flow inputs",
        ownerLabel: "Start",
        label,
        shape,
      });
    }
  }

  if (scope.length > 0) {
    const source = { kind: "item" as const };
    const shape = resolver.getSourceShape(source, scope);
    const forEach = findStep(document, scope.at(-1)!)?.step;
    const fitted = shape ? fit(source, shape) : null;
    if (shape && fitted) {
      options.push({
        ...fitted,
        group: "This item",
        ownerLabel: forEach ? stepLabel(forEach) : "For each",
        label: itemName(document, scope.at(-1)!),
        shape,
      });
    }
  }

  for (const earlierId of earlierStepIds(document, stepId)) {
    const earlier = findStep(document, earlierId)?.step;
    if (!earlier) {
      continue;
    }
    // The engine lets steps outside a for-each see only what it collects.
    const outputNames =
      earlier.kind === "for-each"
        ? earlier.collect && !scope.includes(earlier.stepId)
          ? [earlier.collect.as]
          : []
        : (getCatalogEntry(earlier.actionDefinitionId)?.outputs ?? []).map(
            (output) => output.name,
          );
    for (const outputName of outputNames) {
      const source = {
        kind: "step-output" as const,
        stepId: earlier.stepId,
        outputName,
      };
      const shape = resolver.getStepOutputShape(earlier.stepId, outputName);
      const fitted = shape ? fit(source, shape) : null;
      if (shape && fitted) {
        const output =
          earlier.kind === "action"
            ? getCatalogEntry(earlier.actionDefinitionId)?.outputs.find(
                (candidate) => candidate.name === outputName,
              )
            : undefined;
        options.push({
          ...fitted,
          group: "Earlier steps",
          ownerLabel: stepLabel(earlier),
          label: output?.label ?? outputName,
          shape,
        });
      }
    }
  }

  return options;
};

/** A short, readable name for a source: "Find suppliers › Entities". */
export const describeSource = (
  document: EditorDocument,
  source: StepInputSource,
  stepId: string,
): { owner: string; label: string } => {
  switch (source.kind) {
    case "flow-input": {
      const found = triggerFlowInputs(document).find(
        (candidate) => candidate.input.name === source.inputName,
      );
      return { owner: "Start", label: found?.label ?? source.inputName };
    }
    case "item": {
      const parentId = findStep(document, stepId)?.parentId;
      const parent = parentId ? findStep(document, parentId)?.step : undefined;
      return {
        owner: parent ? stepLabel(parent) : "For each",
        label: parentId ? itemName(document, parentId) : "item",
      };
    }
    case "step-output": {
      const step = findStep(document, source.stepId)?.step;
      const output =
        step?.kind === "action"
          ? getCatalogEntry(step.actionDefinitionId)?.outputs.find(
              (candidate) => candidate.name === source.outputName,
            )
          : undefined;
      return {
        owner: step ? stepLabel(step) : source.stepId,
        label: output?.label ?? source.outputName,
      };
    }
    case "constant":
      return { owner: "Typed", label: String(source.payload.value) };
  }
};

export type StepDiagnostics = Map<string, FlowDefinitionDiagnostic[]>;

/** Runs the engine's validator and files each problem under the step it's about. */
export const validateDocument = (
  document: EditorDocument,
): {
  byStep: StepDiagnostics;
  flowLevel: FlowDefinitionDiagnostic[];
  mockFields: Set<string>;
  incomplete: Set<string>;
} => {
  const { definition, mockFields, incomplete } = toEngineDefinition(document);
  const { diagnostics } = validateFlowDefinition(definition, {
    actionDefinitions: editorActionDefinitions,
  });

  const byStep: StepDiagnostics = new Map();
  const flowLevel: FlowDefinitionDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    let steps: EditorStep[] = definition.steps;
    let stepId: string | undefined;
    for (let index = 0; index < diagnostic.path.length - 1; index++) {
      if (diagnostic.path[index] === "steps") {
        const step = steps[Number(diagnostic.path[index + 1])];
        if (!step) {
          break;
        }
        stepId = step.stepId;
        steps = step.kind === "for-each" ? step.steps : [];
      }
    }
    // A field the mock layer holds is reported missing by the engine; the panel marks it instead.
    const inputName = /Required input "([^"]+)"/.exec(diagnostic.message)?.[1];
    if (
      stepId &&
      diagnostic.code === "missingInput" &&
      inputName &&
      mockFields.has(fieldKey(stepId, inputName))
    ) {
      continue;
    }
    // Mock actions aren't on the engine's AI worker list yet, so the engine reads them as integration actions.
    if (
      diagnostic.code === "mixedWorkers" &&
      /"(readEntity|createEntity|updateEntity|draftMessage|sendEmail)/.test(
        diagnostic.message,
      )
    ) {
      continue;
    }
    if (stepId) {
      byStep.set(stepId, [...(byStep.get(stepId) ?? []), diagnostic]);
    } else {
      flowLevel.push(diagnostic);
    }
  }

  return { byStep, flowLevel, mockFields, incomplete };
};

export const isActionStep = (
  step: DraftStep | undefined,
): step is Extract<DraftStep, { kind: "action" }> => step?.kind === "action";

export { START_ID, flattenSteps, isMockActionDefinitionId };
