import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { getFlowContext } from "../../shared/get-flow-context";
import { requestExternalInput } from "../../shared/request-external-input";

export const getAnswersFromHuman = async (
  questions: string[],
): Promise<string> => {
  const { stepId } = await getFlowContext();

  const {
    data: { answers },
  } = await requestExternalInput({
    requestId: generateUuid(),
    stepId,
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
