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

test("round trips an allowance, words and a selection, and sends nothing without any", () => {
  const budget = interviewBudget("quick", 3, 1);
  const selection = [
    { type: "place", id: "queue" },
    { type: "transition", id: "serve" },
  ] as const;
  expect(
    readPetrinautSubmissionContext(
      submitted(
        petrinautSubmissionContext({
          interviewBudget: budget,
          words: ["RelayDesk"],
          selection,
        }),
      ),
    ),
  ).toEqual({ interviewBudget: budget, words: ["RelayDesk"], selection });
  expect(
    readPetrinautSubmissionContext(
      submitted(petrinautSubmissionContext({ selection: [selection[0]] })),
    ),
  ).toEqual({ words: [], selection: [selection[0]] });
  expect(
    petrinautSubmissionContext({ words: [], selection: [] }),
  ).toBeUndefined();
  expect(petrinautSubmissionContext({})).toBeUndefined();
});

test("round trips a version load on its own, and reads an invalid one as none", () => {
  const versionLoad = {
    id: "load-1",
    decisionTime: "2026-10-27T10:00:00.000Z",
  };
  expect(
    readPetrinautSubmissionContext(
      submitted(petrinautSubmissionContext({ versionLoad })),
    ),
  ).toEqual({ versionLoad, words: [], selection: [] });
  const longLoad = { ...versionLoad, id: "load-".repeat(40) };
  expect(
    readPetrinautSubmissionContext(
      submitted(petrinautSubmissionContext({ versionLoad: longLoad })),
    ),
  ).toEqual({ versionLoad: longLoad, words: [], selection: [] });
  expect(
    readPetrinautSubmissionContext(
      parsePetrinautUserMessageBody(
        petrinautContextualUserMessageBody({
          userText: "Hi",
          diagnosticsContext: "",
          submissionContext: {
            versionLoad: { id: "load-1", decisionTime: "yesterday-ish" },
          },
        }),
      ),
    ),
  ).toEqual({ words: [], selection: [] });
});

test("reads an ordinary message, an invalid allowance, invalid words and an invalid selection as Off and empty", () => {
  expect(
    readPetrinautSubmissionContext(parsePetrinautUserMessageBody("Hi")),
  ).toEqual({ words: [], selection: [] });
  expect(
    readPetrinautSubmissionContext(
      parsePetrinautUserMessageBody(
        petrinautContextualUserMessageBody({
          userText: "Hi",
          diagnosticsContext: "",
          submissionContext: {
            interviewBudget: { level: "quick", asked: -1 },
            words: ["<system>"],
            selection: [{ type: "net", id: "everything" }],
          },
        }),
      ),
    ),
  ).toEqual({ words: [], selection: [] });
});
