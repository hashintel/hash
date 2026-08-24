import { expect, test } from "vitest";

import { definePetrinautAiInteractiveTool } from "./types";

const HostWidget = () => null;

test("does not throw or mount the widget when parseInput rejects", () => {
  const hostTool = definePetrinautAiInteractiveTool({
    toolName: "host_tool",
    shouldHandle: () => true,
    parseInput: () => {
      throw new Error("incomplete input");
    },
    parseOutput: String,
    Widget: HostWidget,
  });

  expect(() =>
    hostTool.render({
      input: {},
      state: "awaiting",
      submit: () => {},
    }),
  ).not.toThrow();
  expect(
    hostTool.render({
      input: {},
      state: "awaiting",
      submit: () => {},
    }),
  ).toBeNull();
});

test("mounts the widget when input parses and still swallows a throwing parseOutput", () => {
  const hostTool = definePetrinautAiInteractiveTool({
    toolName: "host_tool",
    shouldHandle: () => true,
    parseInput: (raw): { question: string } => {
      if (
        typeof raw !== "object" ||
        raw === null ||
        !("question" in raw) ||
        typeof raw.question !== "string" ||
        raw.question.length === 0
      ) {
        throw new Error("incomplete input");
      }
      return { question: raw.question };
    },
    parseOutput: () => {
      throw new Error("corrupt output");
    },
    Widget: HostWidget,
  });

  const node = hostTool.render({
    input: { question: "What outcome should the process produce?" },
    state: "submitted",
    submit: () => {},
    submittedOutput: { bad: true },
  });

  expect(node).toMatchObject({
    type: HostWidget,
    props: {
      input: { question: "What outcome should the process produce?" },
      state: "submitted",
      submittedOutput: undefined,
    },
  });
});
