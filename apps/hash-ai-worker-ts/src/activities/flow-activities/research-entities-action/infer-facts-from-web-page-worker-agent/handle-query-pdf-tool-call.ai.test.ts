import "../../../../shared/testing-utilities/mock-get-flow-context";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import { handleQueryPdfToolCall } from "./handle-query-pdf-tool-call";
import type { ToolCallArguments } from "./tool-definitions";
import type {
  InferFactsFromWebPageWorkerAgentInput,
  InferFactsFromWebPageWorkerAgentState,
} from "./types";

test(
  "handleQueryPdfToolCall - queryPdf - Marks and Spencer 2024 Annual Report - Major Shareholders",
  async () => {
    const state: InferFactsFromWebPageWorkerAgentState = {
      currentPlan: "",
      previousCalls: [],
      inferredFactsAboutEntities: [],
      inferredFacts: [],
      inferredFactsFromWebPageUrls: [],
      filesQueried: [],
      filesUsedToInferFacts: [],
    };

    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/investment-fund/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const input: InferFactsFromWebPageWorkerAgentInput = {
      prompt: "",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "",
      innerHtml: "",
    };

    const completedToolCall = await handleQueryPdfToolCall({
      state,
      input,
      toolCall: {
        name: "queryFactsFromPdf",
        id: "1",
        input: {
          fileUrl:
            "https://corporate.marksandspencer.com/sites/marksandspencer/files/2023-06/M-and-S-2023-Annual-Report.pdf",
          description:
            'Look for a list or table showing the top investors or investment funds that hold a significant stake in Marks and Spencer\'s. This would likely be found in a section titled something like "Major Shareholders" or "Substantial Shareholdings". The table should show the names of the investment funds and the percentage ownership they hold.',
          exampleText: "Name Ownership %\nInvesco 5.2%\nBlackRock 4.8%",
          explanation:
            "Checking the full year 2022 M&S annual report located in the reports archive. This is the latest published annual report and should contain the shareholder information if M&S discloses it. The previous attempt to query the annual report failed because the URL was pointing to an HTML page rather than the actual PDF file. This updated query uses the direct PDF URL to avoid that issue. Scanning through this report is the best next step to progress the research task.",
          relevantEntitiesPrompt:
            "Investment funds that own a significant percentage of Marks & Spencer shares",
          entityTypeIds: [
            "https://hash.ai/@ftse/types/entity-type/investment-fund/v/1",
          ],
        } satisfies ToolCallArguments["queryFactsFromPdf"],
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ completedToolCall, state }, null, 2));

    expect(completedToolCall).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
