// oxlint-disable max-lines -- a test file that pairs a table of connection cases with the flow-building scenarios they exercise
import { describe, expect, expectTypeOf, test } from "vitest";

import { typedActionDefinitions as actions } from "./action-definitions.js";
import { canConnect } from "./can-connect.js";
import { constant, defineFlow, flowInput } from "./define-flow.js";
import { allPayloadKinds } from "./types.js";

import type {
  ConnectionProblem,
  ConnectionSource,
  ConnectionTarget,
} from "./can-connect.js";
import type { AddStep, InputAccepts, Ref } from "./define-flow.js";
import type { FlowDefinitionWithId } from "./types.js";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

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
  IsArray extends boolean,
  Skip extends boolean,
> =
  Ref<
    Source["payloadKind"],
    IsArray,
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
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the `<T>() => T extends X` form is the standard exact-type-equality check
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/* Fails to compile if the builder's types disagree with the table. */
const typeLevelResultsMatch: Equals<
  TypeLevelResults<ConnectionCases>,
  ExpectedResults<ConnectionCases>
> = true;

const connectionProblem = (
  check: ReturnType<typeof canConnect>,
): ConnectionProblem | null => (check.ok ? null : check.problem);

const first = <Item>(items: readonly Item[]): Item => {
  const [item] = items;
  if (item === undefined) {
    throw new Error("Expected a non-empty list");
  }
  return item;
};

describe("the connection rule", () => {
  test("has type-level results that match the table", () => {
    expect.hasAssertions();

    expect(typeLevelResultsMatch).toBe(true);
  });

  test.each(connectionCases)(
    "canConnect: $name",
    ({ source, target, wrap, skip, problem }) => {
      expect.hasAssertions();

      const check = canConnect({
        source,
        target,
        wrap,
        skipWhenMissing: skip,
      });

      expect(connectionProblem(check)).toBe(problem);
    },
  );
});

const defineResearchFlow = (): FlowDefinitionWithId =>
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

describe("defineFlow", () => {
  test("serializes connections as sources", () => {
    expect.hasAssertions();

    const { flowDefinition } = defineResearchFlow();

    expect(flowDefinition.steps[1]).toStrictEqual({
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

    expect(flowDefinition.outputs).toStrictEqual([
      {
        name: "persisted",
        stepId: "persist",
        outputName: "persistedEntities",
      },
    ]);

    expect(flowDefinition.inputs[0]).toStrictEqual({
      name: "prompt",
      payloadKind: "Text",
      array: false,
      required: true,
      label: "Research guidance",
    });
  });

  test("rejects incompatible connections at compile time", () => {
    expect.hasAssertions();

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

        const shouldThrow = (): void => {
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

  test("reports what the types can't check, such as duplicate step ids", () => {
    expect.hasAssertions();

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
    ).toThrow(/Step id "answer" is used more than once/u);
  });

  test("serializes forEach steps, collecting one output per item", () => {
    expect.hasAssertions();

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

        expect(answers.source).toStrictEqual({
          kind: "step-output",
          stepId: "answerEach",
          outputName: "explanations",
        });

        return { outputs: { summary: summary.outputs.explanation } };
      },
    );

    expect(flowDefinition.steps[1]).toStrictEqual({
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

  test("rejects an item used outside its own forEach", () => {
    expect.hasAssertions();

    expect(() =>
      defineFlow(
        {
          flowDefinitionId: "leaked-item",
          name: "Leaked item",
          description: "Uses an item outside its forEach",
          inputs: { prompt: flowInput("Text") },
        },
        ({ inputs, step, forEach }) => {
          const queries = step("queries", actions.generateWebQueries, {
            description: "",
            inputs: { prompt: inputs.prompt },
          });

          const leakedItems: Ref<"Text", false, true>[] = [];

          forEach("each", queries.outputs.queries, {
            description: "",
            collectAs: "answers",
            steps: (query, scope) => {
              /* A for-each step can't contain another yet (FE-1904). */
              expectTypeOf(scope).not.toHaveProperty("forEach");

              leakedItems.push(query);

              return scope.step("answer", actions.answerQuestion, {
                description: "",
                inputs: { question: query },
              }).outputs.explanation;
            },
          });

          step("leaked", actions.answerQuestion, {
            description: "",
            inputs: { question: first(leakedItems) },
          });

          return { outputs: {} };
        },
      ),
    ).toThrow(/uses the item of a forEach step it is not directly inside/u);
  });
});

describe("steps of actions with derived kinds", () => {
  /*
   * `defineFlow` validates a flow against the codebase's action definitions, so steps of these test actions are
   * checked by the compiler rather than run.
   */
  const filterAction = {
    actionDefinitionId: "filter",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: true,
      },
    ],
    outputs: [
      { name: "matches", kindFrom: "items", array: true, required: true },
    ],
  } as const;

  const findAction = {
    actionDefinitionId: "find",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: true,
      },
      { name: "fallback", kindFrom: "items", array: false, required: false },
    ],
    outputs: [
      { name: "match", kindFrom: "items", array: false, required: false },
    ],
  } as const;

  const pickIfGivenAction = {
    actionDefinitionId: "pickIfGiven",
    inputs: [
      {
        name: "items",
        oneOfPayloadKinds: allPayloadKinds,
        array: true,
        required: false,
      },
    ],
    outputs: [
      { name: "first", kindFrom: "items", array: false, required: false },
    ],
  } as const;

  const typeChecks = ({
    step,
    entities,
    maybeEntities,
    entity,
    text,
  }: {
    step: AddStep;
    entities: Ref<"PersistedEntityMetadata", true, true>;
    maybeEntities: Ref<"PersistedEntityMetadata", true, false>;
    entity: Ref<"PersistedEntityMetadata", false, true>;
    text: Ref<"Text", false, true>;
  }): void => {
    const filtered = step("filter", filterAction, {
      description: "",
      inputs: { items: entities },
    });

    expectTypeOf(filtered.outputs.matches).toEqualTypeOf<
      Ref<"PersistedEntityMetadata", true, true>
    >();

    const found = step("find", findAction, {
      description: "",
      inputs: { items: filtered.outputs.matches, fallback: entity },
    });

    expectTypeOf(found.outputs.match).toEqualTypeOf<
      Ref<"PersistedEntityMetadata", false, false>
    >();

    step("mismatchedFallback", findAction, {
      description: "",
      // @ts-expect-error -- `fallback` must have the kind of `items`
      inputs: { items: entities, fallback: text },
    });

    step("unknownInput", filterAction, {
      description: "",
      // @ts-expect-error -- `item` is not an input of filter
      inputs: { items: entities, item: entity },
    });

    step("missingItems", filterAction, {
      description: "",
      // @ts-expect-error -- missing the required `items` input
      inputs: {},
    });

    const picked = step("pick", pickIfGivenAction, {
      description: "",
      inputs: { items: maybeEntities },
    });

    expectTypeOf(picked.outputs.first).toEqualTypeOf<
      Ref<"PersistedEntityMetadata", false, false>
    >();

    step("unconnectedKindSource", pickIfGivenAction, {
      description: "",
      // @ts-expect-error -- `items` is optional, but `first` takes its kind from it, so it must be connected
      inputs: {},
    });
  };

  test("type outputs and inputs with derived kinds by the kind connected", () => {
    expect.hasAssertions();

    expect(typeChecks).toBeDefined();
  });
});

const ifBranchTypeChecks = (
  step: AddStep,
  text: Ref<"Text", false, true>,
): void => {
  const isQuestion = step("isQuestion", actions.if, {
    description: "",
    inputs: {
      value: text,
      condition: constant("FilterCondition", {
        kind: "all",
        conditions: [
          {
            kind: "condition",
            subject: { kind: "input", payloadKind: "Text" },
            operator: "isNotEmpty",
          },
        ],
      }),
    },
  });

  step("answer", actions.answerQuestion, {
    description: "",
    // @ts-expect-error -- `true` is missing when the value doesn't match
    inputs: { question: isQuestion.outputs.true },
  });
};

describe("the Filter List and If steps", () => {
  // SAFETY: a fixture URL of the versioned-URL shape
  const companyType =
    "https://example.com/types/entity-type/company/v/1" as VersionedUrl;

  test("filter a list and pass the matching items on", () => {
    expect.hasAssertions();

    const { flowDefinition } = defineFlow(
      {
        flowDefinitionId: "research-companies",
        name: "Research companies",
        description: "Research entities and persist the companies",
        inputs: {
          prompt: flowInput("Text"),
          entityTypeIds: flowInput("VersionedUrl", { array: true }),
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

        const companies = step("companies", actions.filterList, {
          description: "Keep the companies",
          inputs: {
            items: research.outputs.proposedEntities.consume(),
            condition: constant("FilterCondition", {
              kind: "all",
              conditions: [
                {
                  kind: "condition",
                  subject: { kind: "entityType" },
                  operator: "isOfType",
                  value: { kind: "VersionedUrl", value: companyType },
                },
              ],
            }),
          },
        });

        expectTypeOf(companies.outputs.matching).toEqualTypeOf<
          Ref<"ProposedEntity", true, true>
        >();

        const persist = step("persist", actions.persistEntities, {
          description: "Persist the companies",
          inputs: { proposedEntities: companies.outputs.matching },
        });

        return { outputs: { persisted: persist.outputs.persistedEntities } };
      },
    );

    expect(flowDefinition.steps[2]).toMatchObject({
      actionDefinitionId: "persistEntities",
      inputs: {
        proposedEntities: {
          kind: "step-output",
          stepId: "companies",
          outputName: "matching",
        },
      },
    });
  });

  test("keep the top items of a filtered list, by Filter List, Order By and Take First", () => {
    expect.hasAssertions();

    const marketCapUrl =
      // SAFETY: a fixture URL of the base-URL shape
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded URL types cannot be constructed from a literal without an assertion
      "https://example.com/types/property-type/market-cap/" as BaseUrl;

    const { flowDefinition } = defineFlow(
      {
        flowDefinitionId: "top-companies",
        name: "Top companies",
        description: "Persist the ten companies with the largest market cap",
        inputs: {
          prompt: flowInput("Text"),
          entityTypeIds: flowInput("VersionedUrl", { array: true }),
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

        const companies = step("companies", actions.filterList, {
          description: "Keep the companies",
          inputs: {
            items: research.outputs.proposedEntities.consume(),
            condition: constant("FilterCondition", {
              kind: "all",
              conditions: [
                {
                  kind: "condition",
                  subject: { kind: "entityType" },
                  operator: "isOfType",
                  value: { kind: "VersionedUrl", value: companyType },
                },
              ],
            }),
          },
        });

        const byMarketCap = step("byMarketCap", actions.orderBy, {
          description: "Sort the companies by market cap, largest first",
          inputs: {
            items: companies.outputs.matching,
            sortBy: constant("SortKey", {
              subject: {
                kind: "entityProperty",
                propertyTypeBaseUrl: marketCapUrl,
                payloadKind: "Number",
              },
              direction: "descending",
            }),
          },
        });

        expectTypeOf(byMarketCap.outputs.items).toEqualTypeOf<
          Ref<"ProposedEntity", true, true>
        >();

        const top = step("top", actions.takeFirst, {
          description: "Keep the first ten",
          inputs: {
            items: byMarketCap.outputs.items,
            count: constant("Number", 10),
          },
        });

        expectTypeOf(top.outputs.items).toEqualTypeOf<
          Ref<"ProposedEntity", true, true>
        >();

        const persist = step("persist", actions.persistEntities, {
          description: "Persist the top companies",
          inputs: { proposedEntities: top.outputs.items },
        });

        return { outputs: { persisted: persist.outputs.persistedEntities } };
      },
    );

    expect(flowDefinition.steps.slice(2, 4)).toMatchObject([
      {
        actionDefinitionId: "orderBy",
        inputs: {
          items: {
            kind: "step-output",
            stepId: "companies",
            outputName: "matching",
          },
        },
      },
      {
        actionDefinitionId: "takeFirst",
        inputs: {
          items: {
            kind: "step-output",
            stepId: "byMarketCap",
            outputName: "items",
          },
          count: { kind: "constant", payload: { kind: "Number", value: 10 } },
        },
      },
    ]);
  });

  test("branch on how many items a list has, by Aggregate and If", () => {
    expect.hasAssertions();

    const { flowDefinition } = defineFlow(
      {
        flowDefinitionId: "many-companies",
        name: "Many companies",
        description: "Check whether research found more than ten entities",
        inputs: {
          prompt: flowInput("Text"),
          entityTypeIds: flowInput("VersionedUrl", { array: true }),
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

        const counted = step("count", actions.aggregate, {
          description: "Count the entities",
          inputs: {
            items: research.outputs.proposedEntities,
            aggregation: constant("Aggregation", { operation: "count" }),
          },
        });

        expectTypeOf(counted.outputs.result).toEqualTypeOf<
          Ref<"Number", false, false>
        >();

        const isMany = step("isMany", actions.if, {
          description: "Check for more than ten",
          inputs: {
            value: counted.outputs.result.orSkip(),
            condition: constant("FilterCondition", {
              kind: "all",
              conditions: [
                {
                  kind: "condition",
                  subject: { kind: "input", payloadKind: "Number" },
                  operator: "greaterThan",
                  value: { kind: "Number", value: 10 },
                },
              ],
            }),
          },
        });

        expectTypeOf(isMany.outputs.true).toEqualTypeOf<
          Ref<"Number", false, false>
        >();

        return { outputs: {} };
      },
    );

    expect(flowDefinition.steps.slice(1)).toMatchObject([
      {
        actionDefinitionId: "aggregate",
        inputs: {
          aggregation: {
            kind: "constant",
            payload: { kind: "Aggregation", value: { operation: "count" } },
          },
        },
      },
      {
        actionDefinitionId: "if",
        inputs: {
          value: {
            kind: "step-output",
            stepId: "count",
            outputName: "result",
            whenMissing: "skip",
          },
        },
      },
    ]);
  });

  test("run the steps after an If step only on the branch it takes", () => {
    expect.hasAssertions();

    const { flowDefinition } = defineFlow(
      {
        flowDefinitionId: "answer-questions",
        name: "Answer questions",
        description: "Answer the input if it's a question",
        inputs: { text: flowInput("Text") },
      },
      ({ inputs, step }) => {
        const isQuestion = step("isQuestion", actions.if, {
          description: "Check for a question",
          inputs: {
            value: inputs.text,
            condition: constant("FilterCondition", {
              kind: "all",
              conditions: [
                {
                  kind: "condition",
                  subject: { kind: "input", payloadKind: "Text" },
                  operator: "endsWith",
                  value: { kind: "Text", value: "?" },
                },
              ],
            }),
          },
        });

        expectTypeOf(isQuestion.outputs.true).toEqualTypeOf<
          Ref<"Text", false, false>
        >();

        step("answer", actions.answerQuestion, {
          description: "Answer the question",
          inputs: { question: isQuestion.outputs.true.orSkip() },
        });

        return { outputs: {} };
      },
    );

    expect(flowDefinition.steps[1]).toMatchObject({
      inputs: {
        question: {
          kind: "step-output",
          stepId: "isQuestion",
          outputName: "true",
          whenMissing: "skip",
        },
      },
    });
  });

  test("require a branch of an If step to be skipped when it isn't taken", () => {
    expect.hasAssertions();

    expect(ifBranchTypeChecks).toBeDefined();
  });
});
