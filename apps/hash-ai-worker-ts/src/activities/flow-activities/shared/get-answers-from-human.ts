import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Context } from "@temporalio/activity";

import { requestExternalInput } from "../../shared/request-external-input";

export const getAnswersFromHuman = async (
  questions: string[],
): Promise<string> => {
  const {
    data: { answers },
  } = await requestExternalInput({
    requestId: generateUuid(),
    stepId: Context.current().info.activityId,
    type: "human-input",
    data: {
      questions,
    },
  });

  const responseString = answers
    .map(
      (answer, index) => `\nQuestion: ${questions[index]}\nAnswer: ${answer}\n`,
    )
    .join("\n");

  return responseString;
};
