import { describe, expect, it, vi } from "vitest";

import { createFlowEditor, type FlowEditor } from "./flow-editor.js";

import type { FlowDefinition, StepInputSource } from "./types.js";

const explanationOf = (stepId: string): StepInputSource => ({
  kind: "step-output",
  stepId,
  outputName: "explanation",
});

/**
 * `first` → `second` → `each`, a for-each step with a nested step called `answerQuestion`, which nothing outside the
 * for-each step refers to.
 */
const flowDefinition: FlowDefinition = {
  name: "Answers",
  description: "Answers a question, then each of a list of questions",
  inputs: [
    { name: "question", payloadKind: "Text", array: false, required: true },
    { name: "questions", payloadKind: "Text", array: true, required: true },
  ],
  steps: [
    {
      kind: "action",
      stepId: "first",
      actionDefinitionId: "answerQuestion",
      description: "",
      inputs: { question: { kind: "flow-input", inputName: "question" } },
      position: { x: 0, y: 0 },
    },
    {
      kind: "action",
      stepId: "second",
      actionDefinitionId: "answerQuestion",
      description: "",
      inputs: { question: explanationOf("first") },
      position: { x: 300, y: 0 },
      runAfter: [{ stepId: "first" }],
    },
    {
      kind: "for-each",
      stepId: "each",
      description: "",
      over: { kind: "flow-input", inputName: "questions" },
      runAfter: [{ stepId: "second" }],
      steps: [
        {
          kind: "action",
          stepId: "answer",
          actionDefinitionId: "answerQuestion",
          description: "",
          inputs: {
            question: { kind: "item" },
            context: explanationOf("first"),
          },
          position: { x: 20, y: 20 },
          runAfter: [{ stepId: "first" }],
        },
        {
          kind: "action",
          stepId: "answerQuestion",
          actionDefinitionId: "answerQuestion",
          description: "",
          inputs: { question: explanationOf("answer") },
        },
      ],
      collect: {
        stepId: "answer",
        outputName: "explanation",
        as: "explanations",
      },
    },
  ],
  outputs: [
    { name: "explanations", stepId: "each", outputName: "explanations" },
  ],
};

const loadFlow = () => createFlowEditor(structuredClone(flowDefinition));

const stepOf = (editor: FlowEditor, stepId: string) =>
  editor.getState().flowDefinition.steps.find((step) => step.stepId === stepId);

const problemCodesOf = (editor: FlowEditor, stepId: string) =>
  editor
    .getState()
    .problemsByStepId.get(stepId)
    ?.map(({ code }) => code);

describe("createFlowEditor", () => {
  it("keeps for-each steps and their nested steps exactly as they were through edits to other steps", () => {
    const editor = loadFlow();

    const added = editor.addStep("answerQuestion", { after: "second" });
    editor.moveStep("first", { x: 10, y: 10 });
    editor.setInputSource(added, "question", explanationOf("second"));
    editor.addConnection({ from: added, to: "first" });
    editor.removeConnection({ from: added, to: "first" });
    editor.removeStep(added);
    editor.moveStep("each", { x: 600, y: 0 });

    expect(stepOf(editor, "each")).toStrictEqual({
      ...flowDefinition.steps[2],
      position: { x: 600, y: 0 },
    });
  });

  it("loads a definition with no problems, and leaves that state as it was through edits", () => {
    const editor = loadFlow();
    const loaded = editor.getState();

    const added = editor.addStep("answerQuestion", {
      into: { from: "first", to: "second" },
      position: { x: 150, y: 0 },
    });
    editor.moveStep("first", { x: 10, y: 10 });
    editor.setInputSource("second", "question", null);
    editor.addConnection({ from: added, to: "each" });
    editor.setStepDescription("second", "Answers again");
    editor.setName("Answers, renamed");
    editor.addFlowInput({
      name: "context",
      payloadKind: "Text",
      array: false,
      required: false,
    });
    editor.markFlowOutput("second", "explanation");
    editor.unmarkFlowOutput("each", "explanations");
    editor.removeStep("first");
    editor.disconnectStep("each");

    expect(editor.getState()).not.toBe(loaded);
    expect(loaded).toStrictEqual({
      flowDefinition,
      problemsByStepId: new Map(),
      flowProblems: [],
    });
  });

  describe("adding a step", () => {
    it("adds a step with no inputs yet, after the given step or on its own", () => {
      const editor = loadFlow();

      const after = editor.addStep("webSearch", {
        after: "first",
        position: { x: 300, y: 200 },
      });
      const alone = editor.addStep("webSearch", { position: { x: 0, y: 400 } });

      expect(stepOf(editor, after)).toStrictEqual({
        kind: "action",
        stepId: "webSearch",
        actionDefinitionId: "webSearch",
        description: "",
        inputs: {},
        position: { x: 300, y: 200 },
        runAfter: [{ stepId: "first" }],
      });
      expect(stepOf(editor, alone)).toStrictEqual({
        kind: "action",
        stepId: "webSearch2",
        actionDefinitionId: "webSearch",
        description: "",
        inputs: {},
        position: { x: 0, y: 400 },
      });
    });

    it("inserts a step into a connection only for ordering, leaving data inputs as they were", () => {
      const editor = loadFlow();

      const stepId = editor.addStep("webSearch", {
        into: { from: "first", to: "second" },
      });

      expect(stepOf(editor, stepId)?.runAfter).toEqual([{ stepId: "first" }]);
      expect(stepOf(editor, "second")).toStrictEqual({
        ...flowDefinition.steps[1],
        runAfter: [{ stepId }],
      });
    });

    it("keeps the step's other connections in place when inserting into one", () => {
      const editor = loadFlow();

      editor.addConnection({ from: "first", to: "each" });
      const stepId = editor.addStep("webSearch", {
        into: { from: "second", to: "each" },
      });

      expect(stepOf(editor, "each")?.runAfter).toEqual([
        { stepId },
        { stepId: "first" },
      ]);
    });

    it("gives ids that are unique across nested steps, and not used by references to removed steps", () => {
      const editor = loadFlow();

      /* A step nested in the for-each step is called `answerQuestion`. */
      expect(editor.addStep("answerQuestion", { after: "first" })).toBe(
        "answerQuestion2",
      );

      editor.setInputSource("second", "context", {
        kind: "step-output",
        stepId: "answerQuestion2",
        outputName: "explanation",
      });
      editor.removeStep("answerQuestion2");

      /* `second` still takes its context from the removed step, which a new step must not provide. */
      expect(editor.addStep("answerQuestion", { after: "first" })).toBe(
        "answerQuestion3",
      );
    });
  });

  describe("removing a step", () => {
    it("drops every connection to and from it, at any depth", () => {
      const editor = loadFlow();

      editor.addConnection({ from: "first", to: "each" });
      editor.removeStep("first");

      const [second, each] = editor.getState().flowDefinition.steps;

      expect(second?.stepId).toBe("second");
      expect(second).not.toHaveProperty("runAfter");
      expect(each?.runAfter).toEqual([{ stepId: "second" }]);
      expect(each?.kind === "for-each" && each.steps[0]).not.toHaveProperty(
        "runAfter",
      );
    });

    it("keeps inputs that took values from it, and lists them as problems of the steps they're in", () => {
      const editor = loadFlow();

      editor.removeStep("first");

      expect(stepOf(editor, "second")).toMatchObject({
        inputs: { question: explanationOf("first") },
      });
      expect(problemCodesOf(editor, "second")).toEqual(["unknownStep"]);
      expect(problemCodesOf(editor, "answer")).toEqual(["unknownStep"]);
      expect(editor.getState().problemsByStepId.size).toBe(2);
    });

    it("lists problems outside every step separately, such as a flow input no step uses any more", () => {
      const editor = loadFlow();

      editor.removeStep("each");

      expect(
        editor.getState().flowDefinition.steps.map(({ stepId }) => stepId),
      ).toEqual(["first", "second"]);
      expect(editor.getState().flowProblems).toMatchObject([
        { code: "unusedFlowInput", path: ["inputs", 1] },
      ]);
    });

    it("drops the flow outputs it or a step inside it gives, keeping the others", () => {
      const editor = createFlowEditor({
        ...structuredClone(flowDefinition),
        outputs: [
          { name: "first", stepId: "first", outputName: "explanation" },
          { name: "explanations", stepId: "each", outputName: "explanations" },
          { name: "answer", stepId: "answer", outputName: "explanation" },
        ],
      });

      editor.removeStep("each");

      expect(editor.getState().flowDefinition.outputs).toStrictEqual([
        { name: "first", stepId: "first", outputName: "explanation" },
      ]);
    });
  });

  describe("setting an input's source", () => {
    it("sets a flow input, an earlier step's output, or a fixed value", () => {
      const editor = loadFlow();

      const stepId = editor.addStep("answerQuestion", { after: "second" });
      editor.setInputSource(stepId, "question", {
        kind: "flow-input",
        inputName: "question",
      });
      editor.setInputSource(stepId, "context", explanationOf("second"));
      editor.setInputSource(stepId, "question", {
        kind: "constant",
        payload: { kind: "Text", value: "What next?" },
      });

      expect(stepOf(editor, stepId)).toMatchObject({
        inputs: {
          question: {
            kind: "constant",
            payload: { kind: "Text", value: "What next?" },
          },
          context: explanationOf("second"),
        },
      });
      expect(editor.getState().problemsByStepId.size).toBe(0);
    });

    it("clears an input, listing every problem of the step on it", () => {
      const editor = loadFlow();

      editor.setInputSource("second", "context", explanationOf("missing"));
      editor.setInputSource("second", "question", null);

      expect(stepOf(editor, "second")).toMatchObject({
        inputs: { context: explanationOf("missing") },
      });
      expect(problemCodesOf(editor, "second")).toEqual([
        "unknownStep",
        "missingInput",
      ]);
    });
  });

  describe("setting a step's description", () => {
    it("sets the description of an action step or a for-each step, leaving the steps inside it as they were", () => {
      const editor = loadFlow();

      editor.setStepDescription("second", "Answer the follow-up");
      editor.setStepDescription("each", "Answer every question");

      expect(stepOf(editor, "second")).toStrictEqual({
        ...flowDefinition.steps[1],
        description: "Answer the follow-up",
      });
      expect(stepOf(editor, "each")).toStrictEqual({
        ...flowDefinition.steps[2],
        description: "Answer every question",
      });
      expect(stepOf(editor, "first")?.description).toBe("");
    });
  });

  describe("renaming the flow", () => {
    it("changes only the flow's name, as an edit", () => {
      const editor = loadFlow();
      const listener = vi.fn();
      editor.subscribe(listener);

      editor.setName("Answer every question");

      expect(editor.getState().flowDefinition).toStrictEqual({
        ...flowDefinition,
        name: "Answer every question",
      });
      expect(listener).toHaveBeenCalledExactlyOnceWith({ edited: true });
    });

    it("leaves the state as it was when given the name the flow has", () => {
      const editor = loadFlow();
      const loaded = editor.getState();
      const listener = vi.fn();
      editor.subscribe(listener);

      editor.setName("Answers");

      expect(editor.getState()).toBe(loaded);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("adding a flow input", () => {
    it("adds an input after the others, unused until a step takes its value from it", () => {
      const editor = loadFlow();
      const deadline: FlowDefinition["inputs"][number] = {
        name: "deadline",
        payloadKind: "Date",
        array: false,
        required: true,
        label: "Deadline",
      };

      editor.addFlowInput(deadline);

      expect(editor.getState().flowDefinition.inputs).toStrictEqual([
        ...flowDefinition.inputs,
        deadline,
      ]);
      expect(editor.getState().flowProblems).toMatchObject([
        { code: "unusedFlowInput", path: ["inputs", 2] },
      ]);

      editor.setInputSource("second", "context", {
        kind: "flow-input",
        inputName: "deadline",
      });

      expect(editor.getState().flowProblems).toEqual([]);
    });

    it("lists a name that's already taken as a problem rather than refusing it", () => {
      const editor = loadFlow();

      editor.addFlowInput({
        name: "question",
        payloadKind: "Number",
        array: false,
        required: false,
      });

      expect(editor.getState().flowDefinition.inputs).toHaveLength(3);
      expect(editor.getState().flowProblems).toMatchObject([
        { code: "duplicateInputName", path: ["inputs", 2, "name"] },
      ]);
    });
  });

  describe("flow outputs", () => {
    it("names a flow output after its output, numbering the name while a flow output has it", () => {
      const editor = loadFlow();
      const third = editor.addStep("answerQuestion", { after: "second" });

      editor.markFlowOutput("first", "explanation");
      editor.markFlowOutput("second", "explanation");
      editor.markFlowOutput(third, "explanation");

      expect(editor.getState().flowDefinition.outputs).toStrictEqual([
        ...flowDefinition.outputs,
        { name: "explanation", stepId: "first", outputName: "explanation" },
        { name: "explanation 2", stepId: "second", outputName: "explanation" },
        { name: "explanation 3", stepId: third, outputName: "explanation" },
      ]);
      expect(editor.getState().flowProblems).toEqual([]);

      editor.unmarkFlowOutput("first", "explanation");
      editor.markFlowOutput("first", "explanation");

      expect(
        editor.getState().flowDefinition.outputs.map(({ name }) => name),
      ).toEqual([
        "explanations",
        "explanation 2",
        "explanation 3",
        "explanation",
      ]);
    });

    it("marks an output once, and unmarks only that step's output", () => {
      const editor = loadFlow();
      const listener = vi.fn();

      editor.markFlowOutput("first", "explanation");
      editor.markFlowOutput("second", "explanation");
      editor.subscribe(listener);
      editor.markFlowOutput("second", "explanation");
      editor.unmarkFlowOutput("first", "explanation");

      expect(editor.getState().flowDefinition.outputs).toStrictEqual([
        ...flowDefinition.outputs,
        { name: "explanation 2", stepId: "second", outputName: "explanation" },
      ]);
      expect(listener).toHaveBeenCalledOnce();
    });

    it("unmarks an output whose step is gone", () => {
      const editor = createFlowEditor({
        ...structuredClone(flowDefinition),
        outputs: [{ name: "gone", stepId: "gone", outputName: "explanation" }],
      });

      editor.unmarkFlowOutput("gone", "explanation");

      expect(editor.getState().flowDefinition.outputs).toEqual([]);
      expect(editor.getState().flowProblems).toEqual([]);
    });
  });

  describe("connections", () => {
    it("adds a connection once", () => {
      const editor = loadFlow();

      editor.addConnection({ from: "first", to: "each" });
      editor.addConnection({ from: "first", to: "each" });

      expect(stepOf(editor, "each")?.runAfter).toEqual([
        { stepId: "second" },
        { stepId: "first" },
      ]);
    });

    it("removes a connection, leaving no runAfter when it was the last one", () => {
      const editor = loadFlow();

      editor.removeConnection({ from: "first", to: "second" });

      expect(stepOf(editor, "second")).not.toHaveProperty("runAfter");
    });

    it("removes every connection to and from a step, at any depth", () => {
      const editor = loadFlow();

      editor.addConnection({ from: "second", to: "first" });
      editor.disconnectStep("first");

      const [first, second, each] = editor.getState().flowDefinition.steps;

      expect(first).not.toHaveProperty("runAfter");
      expect(second).not.toHaveProperty("runAfter");
      expect(each?.runAfter).toEqual([{ stepId: "second" }]);
      expect(each?.kind === "for-each" && each.steps[0]).not.toHaveProperty(
        "runAfter",
      );
    });
  });

  it("disconnects a for-each step from the steps inside it too", () => {
    const definition = structuredClone(flowDefinition);
    const [, , each] = definition.steps;

    if (each?.kind !== "for-each" || !each.steps[0]) {
      throw new Error("The for-each step has changed");
    }

    each.steps[0].runAfter = [{ stepId: "first" }, { stepId: "each" }];
    const editor = createFlowEditor(definition);

    editor.disconnectStep("each");

    expect(stepOf(editor, "each")).toMatchObject({
      steps: [{ stepId: "answer", runAfter: [{ stepId: "first" }] }, {}],
    });
    expect(stepOf(editor, "each")).not.toHaveProperty("runAfter");
  });

  it("rejects edits naming a step that isn't a top-level step, a connection that doesn't exist, or a for-each step's inputs", () => {
    const editor = loadFlow();

    expect(() => editor.moveStep("answerQuestion", { x: 0, y: 0 })).toThrow(
      'The flow has no top-level step "answerQuestion"',
    );
    expect(() =>
      editor.setStepDescription("answer", "Answer one question"),
    ).toThrow('The flow has no top-level step "answer"');
    expect(() =>
      editor.addStep("webSearch", { into: { from: "second", to: "first" } }),
    ).toThrow('Step "first" doesn\'t run after step "second"');
    expect(() =>
      editor.setInputSource("each", "over", explanationOf("first")),
    ).toThrow('Step "each" is a for-each step, with no inputs');
    expect(() => editor.markFlowOutput("answer", "explanation")).toThrow(
      'The flow has no top-level step "answer"',
    );
  });

  it("tells subscribers about each edit until they unsubscribe", () => {
    const editor = loadFlow();
    const listener = vi.fn();

    const unsubscribe = editor.subscribe(listener);
    editor.moveStep("first", { x: 1, y: 1 });
    unsubscribe();
    editor.moveStep("first", { x: 2, y: 2 });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ edited: true });
  });

  it("places steps without it being an edit, keeping the positions for the next edit", () => {
    const editor = loadFlow();
    const listener = vi.fn();
    editor.subscribe(listener);

    editor.placeSteps(new Map([["each", { x: 600, y: 0 }]]));

    expect(stepOf(editor, "each")).toStrictEqual({
      ...flowDefinition.steps[2],
      position: { x: 600, y: 0 },
    });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ edited: false });

    editor.moveStep("first", { x: 10, y: 10 });

    expect(listener).toHaveBeenLastCalledWith({ edited: true });
    expect(stepOf(editor, "each")).toHaveProperty("position", {
      x: 600,
      y: 0,
    });
  });

  it("rejects placing a step that isn't a top-level step, leaving every step where it was", () => {
    const editor = loadFlow();
    const loaded = editor.getState();

    expect(() =>
      editor.placeSteps(
        new Map([
          ["first", { x: 10, y: 10 }],
          ["answerQuestion", { x: 0, y: 0 }],
        ]),
      ),
    ).toThrow('The flow has no top-level step "answerQuestion"');
    expect(editor.getState()).toBe(loaded);
  });
});
