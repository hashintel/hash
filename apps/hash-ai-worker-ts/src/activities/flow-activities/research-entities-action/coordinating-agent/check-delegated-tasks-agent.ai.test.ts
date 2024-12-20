import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import { expect, test } from "vitest";

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { checkDelegatedTasksAgent } from "./check-delegated-tasks-agent.js";

test.skip(
  "Test checkDelegatedTasksAgent",
  async () => {
    const { userAuthentication } = await getFlowContext();
    const allDereferencedEntityTypesById =
      await getDereferencedEntityTypesActivity({
        entityTypeIds: [
          "https://hash.ai/@hash/types/entity-type/graphics-card/v/1",
        ],
        graphApiClient,
        actorId: userAuthentication.actorId,
      });

    const { rejectedDelegatedTasks, acceptedDelegatedTasks } =
      await checkDelegatedTasksAgent({
        input: {
          humanInputCanBeRequested: false,
          prompt:
            "Find the best 3 consumer graphics cards for running AI models.",
          allDereferencedEntityTypesById,
          entityTypes: Object.values(allDereferencedEntityTypesById)
            .filter(({ isLink }) => !isLink)
            .map(({ schema }) => schema),
          linkEntityTypes: Object.values(allDereferencedEntityTypesById)
            .filter(({ isLink }) => isLink)
            .map(({ schema }) => schema),
        },
        state: {
          coordinatorIdentifiers: {
            workerInstanceId: "1",
            parentInstanceId: null,
            workerType: "Coordinator",
            toolCallId: null,
          },
          entitySummaries: [],
          hasConductedCompleteCheckStep: false,
          inferredClaims: [],
          plan: "",
          lastCompletedToolCalls: [],
          proposedEntities: [],
          questionsAndAnswers: "",
          submittedEntityIds: [],
          delegatedTasksCompleted: [],
          outstandingTasks: [],
          suggestionsForNextStepsMade: [],
          resourcesNotVisited: [],
          resourceUrlsVisited: [],
          webQueriesMade: [],
          workersStarted: [],
        },
        delegatedTasks: [
          {
            delegatedTaskId: "1",
            goal: "Find the technical specifications of the top 3 consumer graphics cards for running AI models, including memory size, memory type, number of CUDA cores, number of Tensor cores, base clock speed, boost clock speed, power draw, length and width.",
            explanation:
              "To recommend the best graphics cards for running AI models, we need to gather detailed technical specifications on the top contenders. This will allow us to compare their capabilities and suitability for AI workloads. The memory size, memory type, number of CUDA/Tensor cores, clock speeds, power draw and dimensions are all important factors that will impact AI performance and compatibility. The results will be used to populate the Name, Description, Memory Size, Memory Type, NVIDIA CUDA Cores, Tensor Cores, Base Clock, Boost Clock, Power Draw, Length and Width properties on the Graphics Card entity type for the top 3 candidates.",
          },
          {
            delegatedTaskId: "2",
            goal: "Gather expert reviews and benchmark results comparing the AI performance of the top 3 consumer graphics cards.",
            explanation:
              "In addition to raw specs, real-world performance benchmarks and expert opinions from trusted review sites will help identify which cards offer the best performance, value and user experience for AI/ML workloads. This information can be incorporated into the Description property on the Graphics Card entities to provide additional context beyond just technical specifications.",
          },
        ],
        // delegatedTasks: [
        //   {
        //     delegatedTaskId: "1",
        //     goal: "Find information about the NVIDIA GeForce RTX 3080 graphics card.",
        //     explanation:
        //       "The NVIDIA GeForce RTX 3080 is a high-end consumer graphics card that is known for its excellent performance in gaming and AI workloads. We need to find detailed technical specifications, expert reviews, and benchmark results to provide a comprehensive overview of the card's capabilities.",
        //   },
        //   {
        //     delegatedTaskId: "2",
        //     goal: "Find the memory of the NVIDIA GeForce RTX 3080 graphics card.",
        //     explanation:
        //       "The memory of the NVIDIA GeForce RTX 3080 is an important factor that influences its performance in AI workloads. We need to find information about the memory size, memory type, and memory bandwidth of the card to provide a detailed description of its capabilities.",
        //   },
        // ],
      });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { rejectedDelegatedTasks, acceptedDelegatedTasks },
        null,
        2,
      ),
    );

    expect(rejectedDelegatedTasks).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
