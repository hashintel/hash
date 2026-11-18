import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { defineScenario } from "../scenario.js";

import type { EntityQuery } from "@local/hash-isomorphic-utils/flows/types";

const title = systemPropertyTypes.title.propertyTypeBaseUrl;
const summary = systemPropertyTypes.summary.propertyTypeBaseUrl;
const numberOfPages = systemPropertyTypes.numberOfPages.propertyTypeBaseUrl;
const publicationYear = systemPropertyTypes.publicationYear.propertyTypeBaseUrl;

const pages = {
  kind: "entityProperty",
  propertyTypeBaseUrl: numberOfPages,
  payloadKind: "Number",
} as const;

const year = {
  kind: "entityProperty",
  propertyTypeBaseUrl: publicationYear,
  payloadKind: "Number",
} as const;

const sumOfPages = constant("Aggregation", {
  operation: "sum",
  subject: pages,
});

const flow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000001983",
    name: "Query tagged docs",
    description:
      "Find the tagged Docs, and filter, sort and aggregate them on their properties",
    inputs: {
      query: flowInput("EntityQuery"),
      firstTwoByTitleQuery: flowInput("EntityQuery"),
    },
  },
  ({ inputs, step }) => {
    const found = step("found", actions.queryEntities, {
      description: "Find the Docs with the run's tag",
      inputs: { query: inputs.query },
    });

    const foundCount = step("foundCount", actions.aggregate, {
      description: "Count them",
      inputs: {
        items: found.outputs.entities,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    const totalPages = step("totalPages", actions.aggregate, {
      description: "Add up their pages",
      inputs: { items: found.outputs.entities, aggregation: sumOfPages },
    });

    const long = step("long", actions.filterList, {
      description: "Split the Docs at 30 pages",
      inputs: {
        items: found.outputs.entities,
        condition: constant("FilterCondition", {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: pages,
              operator: "greaterThanOrEqual",
              value: { kind: "Number", value: 30 },
            },
          ],
        }),
      },
    });

    const longCount = step("longCount", actions.aggregate, {
      description: "Count the long Docs",
      inputs: {
        items: long.outputs.matching,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    const earliestLongYear = step("earliestLongYear", actions.aggregate, {
      description: "The earliest publication year of the long Docs",
      inputs: {
        items: long.outputs.matching,
        aggregation: constant("Aggregation", {
          operation: "min",
          subject: year,
        }),
      },
    });

    const byYear = step("byYear", actions.orderBy, {
      description: "Sort the long Docs, earliest published first",
      inputs: {
        items: long.outputs.matching,
        sortBy: constant("SortKey", { subject: year, direction: "ascending" }),
      },
    });

    const earliestLong = step("earliestLong", actions.takeFirst, {
      description: "Keep the earliest",
      inputs: { items: byYear.outputs.items, count: constant("Number", 1) },
    });

    const earliestLongPages = step("earliestLongPages", actions.aggregate, {
      description: "Its pages",
      inputs: { items: earliestLong.outputs.items, aggregation: sumOfPages },
    });

    const short = step("short", actions.find, {
      description: "Find the Doc under 30 pages",
      inputs: { items: long.outputs.nonMatching },
    });

    const shortPages = step("shortPages", actions.aggregate, {
      description: "Its pages",
      inputs: {
        items: short.outputs.match.orSkip().wrap(),
        aggregation: sumOfPages,
      },
    });

    const huge = step("huge", actions.find, {
      description: "Find a Doc over 500 pages, which there isn't",
      inputs: {
        items: found.outputs.entities,
        condition: constant("FilterCondition", {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: pages,
              operator: "greaterThan",
              value: { kind: "Number", value: 500 },
            },
          ],
        }),
      },
    });

    step("whenHuge", actions.takeFirst, {
      description: "Only runs if a Doc over 500 pages was found",
      inputs: {
        items: huge.outputs.match.orSkip().wrap(),
        count: constant("Number", 1),
      },
    });

    const firstTwoByTitle = step("firstTwoByTitle", actions.queryEntities, {
      description:
        "Find the first two tagged Docs by title, sorted and limited by the graph",
      inputs: { query: inputs.firstTwoByTitleQuery },
    });

    const firstTwoByTitlePages = step(
      "firstTwoByTitlePages",
      actions.aggregate,
      {
        description: "Add up their pages",
        inputs: {
          items: firstTwoByTitle.outputs.entities,
          aggregation: sumOfPages,
        },
      },
    );

    return {
      outputs: {
        foundCount: foundCount.outputs.result,
        totalPages: totalPages.outputs.result,
        longCount: longCount.outputs.result,
        earliestLongYear: earliestLongYear.outputs.result,
        earliestLongPages: earliestLongPages.outputs.result,
        shortPages: shortPages.outputs.result,
        firstTwoByTitlePages: firstTwoByTitlePages.outputs.result,
      },
    };
  },
);

const taggedDocs = (runTag: string): EntityQuery => ({
  filter: {
    all: [
      {
        equal: [
          { path: ["type", "baseUrl"] },
          { parameter: systemEntityTypes.doc.entityTypeBaseUrl },
        ],
      },
      { equal: [{ path: ["properties", summary] }, { parameter: runTag }] },
    ],
  },
});

const doc = (
  runTag: string,
  name: string,
  pageCount: number,
  yearPublished: number,
) => ({
  entityTypeId: systemEntityTypes.doc.entityTypeId,
  properties: {
    [title]: name,
    [numberOfPages]: pageCount,
    [publicationYear]: yearPublished,
    [summary]: runTag,
  },
});

export const scenario = defineScenario({
  name: "Query entities on seeded Docs",
  purpose:
    "Finds seeded Docs by the run's tag with Query entities, filters, sorts and aggregates them on properties read from the graph, and checks the graph's own sorting and limit.",
  /**
   * Created in this order so that Query entities' default last-edited-first order disagrees with both sorts checked
   * below: the first two by it aren't the first two by title, and the first long Doc by it isn't the earliest.
   */
  seed: ({ runTag }) => [
    doc(runTag, "Essay", 40, 2021),
    doc(runTag, "Field notes", 8, 2019),
    doc(runTag, "Annual report", 120, 2024),
  ],
  runs: [
    {
      flow,
      inputs: ({ runTag }) => ({
        query: { kind: "EntityQuery", value: taggedDocs(runTag) },
        firstTwoByTitleQuery: {
          kind: "EntityQuery",
          value: {
            ...taggedDocs(runTag),
            sortingPaths: [
              { path: ["label"], ordering: "ascending", nulls: "last" },
            ],
            limit: 2,
          },
        },
      }),
      expect: {
        outputs: {
          foundCount: 3,
          totalPages: 168,
          longCount: 2,
          earliestLongYear: 2021,
          earliestLongPages: 40,
          shortPages: 8,
          firstTwoByTitlePages: 160,
        },
        steps: {
          found: {},
          foundCount: { outputs: { result: 3 } },
          totalPages: { outputs: { result: 168 } },
          long: {},
          longCount: { outputs: { result: 2 } },
          earliestLongYear: { outputs: { result: 2021 } },
          byYear: {},
          earliestLong: {},
          earliestLongPages: { outputs: { result: 40 } },
          short: {},
          shortPages: { outputs: { result: 8 } },
          huge: { absentOutputs: ["match"] },
          whenHuge: { status: "SKIPPED" },
          firstTwoByTitle: {},
          firstTwoByTitlePages: { outputs: { result: 160 } },
        },
      },
    },
  ],
});
