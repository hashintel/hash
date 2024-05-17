import { generateEntitySummariesWithDuplicates } from "./test-data";
import { AnthropicMessageModel } from "../../../shared/get-llm-response/anthropic-client";
import { PermittedOpenAiModel } from "../../../shared/openai-client";
import { DuplicateReport, identifyDuplicates } from "../deduplication-agent";

/** this module loads dotenv */
import "@local/hash-backend-utils/environment";

const testCases = [
  generateEntitySummariesWithDuplicates(),
  // generateEntitySummariesWithDuplicates(),
  // generateEntitySummariesWithDuplicates(),
];

const modelsToTest: (PermittedOpenAiModel | AnthropicMessageModel)[] = [
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229",
  "gpt-4o",
  "gpt-4-turbo",
  // "gpt-3.5-turbo-1106",
];

const generateTestReport = ({
  testCase,
  modelResponse,
  timeTaken,
}: {
  modelResponse: DuplicateReport[];
  testCase: ReturnType<typeof generateEntitySummariesWithDuplicates>;
  timeTaken: number;
}) => {
  const { entities, duplicateCount } = testCase;

  let duplicatesCorrectlyIdentified = 0;
  let duplicatesIncorrectlyIdentified = 0;

  let idsInvented = 0;

  for (const report of modelResponse) {
    const canonical = entities.find(
      (entity) => entity.localId === report.canonicalLocalId,
    );

    if (!canonical) {
      idsInvented++;
    }

    const duplicates = report.duplicateLocalIds.map((localId) =>
      entities.find((entity) => entity.localId === localId),
    );

    for (const duplicate of duplicates) {
      if (!duplicate) {
        idsInvented++;
        continue;
      }
      if (!canonical) {
        continue;
      }

      if (duplicate.name === canonical.name) {
        duplicatesCorrectlyIdentified++;
      } else {
        duplicatesIncorrectlyIdentified++;
      }
    }
  }

  const duplicatesMissed = duplicateCount - duplicatesCorrectlyIdentified;

  return {
    Correct: duplicatesCorrectlyIdentified,
    Incorrect: duplicatesIncorrectlyIdentified,
    Missed: duplicatesMissed,
    "Ids Invented": idsInvented,
    Time: `${timeTaken}s`,
    Error: "",
  };
};

const spacer = "------------------";

const testDeduplicationAgent = async () => {
  const reports: ({ model: string; testCase: number } & ReturnType<
    typeof generateTestReport
  >)[] = [];

  for (const [index, testCase] of testCases.entries()) {
    console.debug(spacer);
    console.debug(
      `Test Case ${index + 1}: ${JSON.stringify(testCase, undefined, 2)}`,
    );
    console.debug(spacer);
  }

  await Promise.all(
    modelsToTest.map(async (model) => {
      for (const [index, testCase] of testCases.entries()) {
        const reportBase = {
          model,
          testCase: index + 1,
        };

        try {
          const { duplicates, totalRequestTime } = await identifyDuplicates(
            testCase.entities,
            model,
          );

          console.debug(spacer);
          console.debug(
            `Model ${model} Test Case ${index + 1} response: \n${JSON.stringify(duplicates, undefined, 2)}`,
          );
          console.debug(spacer);

          const report = {
            ...reportBase,
            ...generateTestReport({
              testCase,
              modelResponse: duplicates,
              timeTaken: totalRequestTime,
            }),
          };
          reports.push(report);
        } catch (err) {
          console.error(
            "Error testing model",
            model,
            "on test case",
            index + 1,
            ":",
            err,
          );
          const report = {
            ...reportBase,
            Correct: 0,
            Incorrect: 0,
            Missed: testCase.duplicateCount,
            "Ids Invented": 0,
            Error: "True",
            Time: "N/A",
          };
          reports.push(report);
        }
      }
    }),
  );

  reports.sort((a, b) => a.model.localeCompare(b.model));

  console.table(reports);
};

await testDeduplicationAgent();
