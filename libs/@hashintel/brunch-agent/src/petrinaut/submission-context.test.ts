import { expect, test } from "vitest";

import {
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "./contextual-user-message";
import { interviewBudget } from "./interview-budget";
import {
  petrinautSubmissionContext,
  readPetrinautSubmissionContext,
} from "./submission-context";

const submitted = (
  submissionContext: ReturnType<typeof petrinautSubmissionContext>,
) =>
  parsePetrinautUserMessageBody(
    petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "",
      ...(submissionContext === undefined ? {} : { submissionContext }),
    }),
  );

test("round trips an allowance and words, and sends nothing without either", () => {
  const budget = interviewBudget("quick", 3, 1);
  expect(
    readPetrinautSubmissionContext(
      submitted(
        petrinautSubmissionContext({
          interviewBudget: budget,
          words: ["RelayDesk"],
        }),
      ),
    ),
  ).toEqual({ interviewBudget: budget, words: ["RelayDesk"] });
  expect(petrinautSubmissionContext({ words: [] })).toBeUndefined();
  expect(petrinautSubmissionContext({})).toBeUndefined();
});

test("reads an ordinary message, an invalid allowance and invalid words as Off and empty", () => {
  expect(
    readPetrinautSubmissionContext(parsePetrinautUserMessageBody("Hi")),
  ).toEqual({ words: [] });
  expect(
    readPetrinautSubmissionContext(
      parsePetrinautUserMessageBody(
        petrinautContextualUserMessageBody({
          userText: "Hi",
          diagnosticsContext: "",
          submissionContext: {
            interviewBudget: { level: "quick", asked: -1 },
            words: ["<system>"],
          },
        }),
      ),
    ),
  ).toEqual({ words: [] });
});
