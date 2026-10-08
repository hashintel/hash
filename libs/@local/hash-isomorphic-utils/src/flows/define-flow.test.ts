import { describe, expect, it } from "vitest";

import { typedActionDefinitions as actions } from "./action-definitions.js";
import {
  type ConnectionProblem,
  type ConnectionSource,
  type ConnectionTarget,
  canConnect,
} from "./can-connect.js";
import {
  constant,
  defineFlow,
  flowInput,
  type InputAccepts,
  type Ref,
} from "./define-flow.js";

/**
 * One table of connections, checked against both halves of the connection rule: `canConnect` at runtime,
 * and the builder's `Ref` types at compile time (`TypeLevelResults` below).
 */
const connectionCases = [
  {
    name: "same kind, singular, required",
    source: { payloadKind: "Text", array: false, required: true },
    target: { oneOfPayloadKinds: ["Text"], array: false, required: true },
    wrap: false,
    skip: false,
    problem: null,
  },
  {
    name: "one of several accepted kinds",
    source: { payloadKind: "FormattedText", array: false, required: true },
    target: {
      oneOfPayloadKinds: ["FormattedText", "EntityId"],
      array: false,
      required: true,
    },
    wrap: false,
    skip: false,
    problem: null,
  },
  {
    name: "optional value into an optional input",
    source: { payloadKind: "Text", array: false, required: false },
    target: { oneOfPayloadKinds: ["Text"], array: false, required: false },
    wrap: false,
    skip: false,
    problem: null,
  },
  {
    name: "required value into an optional input",
    source: { payloadKind: "Text", array: false, required: true },
    target: { oneOfPayloadKinds: ["Text"], array: false, required: false },
    wrap: false,
    skip: false,
    problem: null,
  },
  {
    name: "arrays",
    source: { payloadKind: "VersionedUrl", array: true, required: true },
    target: {
      oneOfPayloadKinds: ["VersionedUrl"],
      array: true,
      required: true,
    },
    wrap: false,
    skip: false,
    problem: null,
  },
  {
    name: "wrapped singular into an array input",
    source: { payloadKind: "VersionedUrl", array: false, required: true },
    target: {
      oneOfPayloadKinds: ["VersionedUrl"],
      array: true,
      required: true,
    },
    wrap: true,
    skip: false,
    problem: null,
  },
  {
    name: "wrong kind",
    source: { payloadKind: "FormattedText", array: false, required: true },
    target: { oneOfPayloadKinds: ["Text"], array: false, required: true },
    wrap: false,
    skip: false,
    problem: "payloadKind",
  },
  {
    name: "optional value into a required input",
    source: { payloadKind: "FormattedText", array: false, required: false },
    target: {
      oneOfPayloadKinds: ["FormattedText"],
      array: false,
      required: true,
    },
    wrap: false,
    skip: false,
    problem: "optionalToRequired",
  },
  {
    name: "array into a singular input",
    source: { payloadKind: "ProposedEntity", array: true, required: true },
    target: {
      oneOfPayloadKinds: ["ProposedEntity"],
      array: false,
      required: true,
    },
    wrap: false,
    skip: false,
    problem: "arrayToSingular",
  },
  {
    name: "unwrapped singular into an array input",
    source: { payloadKind: "VersionedUrl", array: false, required: true },
    target: {
      oneOfPayloadKinds: ["VersionedUrl"],
      array: true,
      required: true,
    },
    wrap: false,
    skip: false,
    problem: "singularToArray",
  },
  {
    name: "wrapping an array",
    source: { payloadKind: "VersionedUrl", array: true, required: true },
    target: {
      oneOfPayloadKinds: ["VersionedUrl"],
      array: true,
      required: true,
    },
    wrap: true,
    skip: false,
    problem: "wrapOnArray",
  },
  {
    name: "optional value into a required input, skipping the step when missing",
    source: { payloadKind: "FormattedText", array: false, required: false },
    target: {
      oneOfPayloadKinds: ["FormattedText"],
      array: false,
      required: true,
    },
    wrap: false,
    skip: true,
    problem: null,
  },
] as const satisfies readonly {
  name: string;
  source: ConnectionSource;
  target: ConnectionTarget;
  wrap: boolean;
  skip: boolean;
  problem: ConnectionProblem | null;
}[];

type ConnectionCases = typeof connectionCases;

/**
 * Whether the builder accepts a ref of the source's shape for an input of the target's shape. Wrapping is
 * only available on singular refs (`Ref["wrap"]` requires `this: Ref<K, false, R>`), and `orSkip()` makes a
 * ref count as always present.
 */
type BuilderAccepts<
  Source extends ConnectionSource,
  Target extends ConnectionTarget,
  Wrap extends boolean,
  Skip extends boolean,
> = Wrap extends true
  ? Source["array"] extends true
    ? false
    : AcceptsRef<Source, Target, true, Skip>
  : AcceptsRef<Source, Target, Source["array"], Skip>;

type AcceptsRef<
  Source extends ConnectionSource,
  Target extends ConnectionTarget,
  Array extends boolean,
  Skip extends boolean,
> =
  Ref<
    Source["payloadKind"],
    Array,
    Skip extends true ? true : Source["required"]
  > extends InputAccepts<{
    name: "";
    oneOfPayloadKinds: Target["oneOfPayloadKinds"];
    array: Target["array"];
    required: Target["required"];
  }>
    ? true
    : false;

type ConnectionCase = ConnectionCases[number];

type TypeLevelResults<Cases extends readonly ConnectionCase[]> = {
  [I in keyof Cases]: Cases[I] extends ConnectionCase
    ? BuilderAccepts<
        Cases[I]["source"],
        Cases[I]["target"],
        Cases[I]["wrap"],
        Cases[I]["skip"]
      >
    : never;
};

type ExpectedResults<Cases extends readonly ConnectionCase[]> = {
  [I in keyof Cases]: Cases[I] extends ConnectionCase
    ? Cases[I]["problem"] extends null
      ? true
      : false
    : never;
};

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/* Fails to compile if the builder's types disagree with the table. */
const typeLevelResultsMatch: Equals<
  TypeLevelResults<ConnectionCases>,
  ExpectedResults<ConnectionCases>
> = true;

describe("the connection rule", () => {
  it("has type-level results that match the table", () => {
    expect(typeLevelResultsMatch).toBe(true);
  });

  for (const { name, source, target, wrap, skip, problem } of connectionCases) {
    it(`canConnect: ${name}`, () => {
      const check = canConnect({
        source,
        target,
        wrap,
        skipWhenMissing: skip,
      });

      expect(check.ok ? null : check.problem).toBe(problem);
    });
  }
});

describe("defineFlow", () => {
  const defineResearchFlow = () =>
    defineFlow(
      {
        flowDefinitionId: "research",
        name: "Research",
        description: "Research and persist entities",
        inputs: {
          prompt: flowInput("Text", { label: "Research guidance" }),
          entityTypeIds: flowInput("VersionedUrl", { array: true }),
          draft: flowInput("Boolean", { required: false }),
        },
      },
      ({ inputs, step }) => {
        const research = step("research", actions.researchEntities, {
          description: "Research entities",
          inputs: {
            prompt: inputs.prompt,
            entityTypeIds: inputs.entityTypeIds,
          },
        });

        const persist = step("persist", actions.persistEntities, {
          description: "Persist entities",
          inputs: {
            proposedEntities: research.outputs.proposedEntities.consume(),
            draft: inputs.draft.read(),
          },
        });

        return { outputs: { persisted: persist.outputs.persistedEntities } };
      },
    );

  it("serializes connections as sources", () => {
    const { flowDefinition } = defineResearchFlow();

    expect(flowDefinition.steps[1]).toEqual({
      kind: "action",
      stepId: "persist",
      actionDefinitionId: "persistEntities",
      description: "Persist entities",
      inputs: {
        proposedEntities: {
          kind: "step-output",
          stepId: "research",
          outputName: "proposedEntities",
          access: "consume",
        },
        draft: { kind: "flow-input", inputName: "draft", access: "read" },
      },
    });

    expect(flowDefinition.outputs).toEqual([
      {
        name: "persisted",
        stepId: "persist",
        outputName: "persistedEntities",
      },
    ]);

    expect(flowDefinition.inputs[0]).toEqual({
      name: "prompt",
      payloadKind: "Text",
      array: false,
      required: true,
      label: "Research guidance",
    });
  });

  it("rejects incompatible connections at compile time", () => {
    defineFlow(
      {
        flowDefinitionId: "invalid",
        name: "Invalid",
        description: "Connections the types reject",
        inputs: { question: flowInput("Text") },
      },
      ({ inputs, step }) => {
        const answer = step("answer", actions.answerQuestion, {
          description: "Answer",
          inputs: { question: inputs.question },
        });

        const shouldThrow = () => {
          step("wrongKind", actions.answerQuestion, {
            description: "",
            // @ts-expect-error -- FormattedText into a Text input
            inputs: { question: answer.outputs.answer },
          });

          step("optionalIntoRequired", actions.answerQuestion, {
            description: "",
            // @ts-expect-error -- `sourceCode` may be missing, `question` is required
            inputs: { question: answer.outputs.sourceCode },
          });

          step("missingInput", actions.persistEntities, {
            description: "",
            // @ts-expect-error -- missing the required `proposedEntities` input
            inputs: {},
          });

          step("unknownInput", actions.answerQuestion, {
            description: "",
            // @ts-expect-error -- `questoin` is not an input of answerQuestion
            inputs: { question: inputs.question, questoin: inputs.question },
          });

          // @ts-expect-error -- "robot" is not an ActorType
          constant("ActorType", "robot");

          // @ts-expect-error -- only singular refs can be wrapped
          constant("VersionedUrl", ["https://example.com/v/1"]).wrap();
        };

        expect(shouldThrow).toBeDefined();

        return { outputs: {} };
      },
    );
  });

  it("reports what the types can't check, such as duplicate step ids", () => {
    expect(() =>
      defineFlow(
        {
          flowDefinitionId: "duplicate",
          name: "Duplicate",
          description: "Two steps with one id",
          inputs: { question: flowInput("Text") },
        },
        ({ inputs, step }) => {
          step("answer", actions.answerQuestion, {
            description: "",
            inputs: { question: inputs.question },
          });
          step("answer", actions.answerQuestion, {
            description: "",
            inputs: { question: inputs.question },
          });

          return { outputs: {} };
        },
      ),
    ).toThrow(/Step id "answer" is used more than once/);
  });

  it("serializes forEach steps, collecting one output per item", () => {
    const { flowDefinition } = defineFlow(
      {
        flowDefinitionId: "for-each",
        name: "For each",
        description: "Summarize each search result",
        inputs: { prompt: flowInput("Text") },
      },
      ({ inputs, step, forEach }) => {
        const queries = step("queries", actions.generateWebQueries, {
          description: "Generate queries",
          inputs: { prompt: inputs.prompt },
        });

        const answers = forEach("answerEach", queries.outputs.queries, {
          description: "Answer each query",
          collectAs: "explanations",
          steps: (query, scope) =>
            scope.step("answer", actions.answerQuestion, {
              description: "Answer the query",
              inputs: { question: query },
            }).outputs.explanation,
        });

        const summary = step("summary", actions.answerQuestion, {
          description: "Summarize the answers",
          inputs: { question: inputs.prompt, context: constant("Text", "") },
        });

        expect(answers.source).toEqual({
          kind: "step-output",
          stepId: "answerEach",
          outputName: "explanations",
        });

        return { outputs: { summary: summary.outputs.explanation } };
      },
    );

    expect(flowDefinition.steps[1]).toEqual({
      kind: "for-each",
      stepId: "answerEach",
      description: "Answer each query",
      over: {
        kind: "step-output",
        stepId: "queries",
        outputName: "queries",
      },
      steps: [
        {
          kind: "action",
          stepId: "answer",
          actionDefinitionId: "answerQuestion",
          description: "Answer the query",
          inputs: { question: { kind: "item" } },
        },
      ],
      collect: {
        stepId: "answer",
        outputName: "explanation",
        as: "explanations",
      },
    });
  });

  it("rejects an item used outside its own forEach", () => {
    expect(() =>
      defineFlow(
        {
          flowDefinitionId: "leaked-item",
          name: "Leaked item",
          description: "Uses an outer item in an inner forEach",
          inputs: { prompt: flowInput("Text") },
        },
        ({ inputs, step, forEach }) => {
          const queries = step("queries", actions.generateWebQueries, {
            description: "",
            inputs: { prompt: inputs.prompt },
          });

          forEach("outer", queries.outputs.queries, {
            description: "",
            collectAs: "answers",
            steps: (outerQuery, outer) => {
              const innerQueries = outer.step(
                "innerQueries",
                actions.generateWebQueries,
                {
                  description: "",
                  inputs: { prompt: outerQuery },
                },
              );

              const { forEach: innerForEach } = outer;

              innerForEach("inner", innerQueries.outputs.queries, {
                description: "",
                collectAs: "answers",
                steps: (_innerQuery, inner) =>
                  inner.step("innerAnswer", actions.answerQuestion, {
                    description: "",
                    inputs: { question: outerQuery },
                  }).outputs.explanation,
              });

              return outer.step("answer", actions.answerQuestion, {
                description: "",
                inputs: { question: outerQuery },
              }).outputs.explanation;
            },
          });

          return { outputs: {} };
        },
      ),
    ).toThrow(/uses the item of a forEach step it is not directly inside/);
  });
});
