import { describe, expect, test, vi } from "vitest";

import { definePetrinautAiInteractiveTool } from "../../../../../types/ai-interactive-tool";
import { getInteractiveTool, resolveDynamicInteractiveTool } from "./registry";

const hostTool = definePetrinautAiInteractiveTool({
  toolName: "confirmRelease",
  inputSchema: {
    parse: (raw: unknown) => {
      if (
        typeof raw !== "object" ||
        raw === null ||
        typeof (raw as { question?: unknown }).question !== "string"
      ) {
        throw new Error("Expected a question");
      }
      return raw as { question: string };
    },
  },
  outputSchema: {
    parse: (raw: unknown) => raw as { approved: boolean },
  },
  component: () => null,
});

const toolCall = (toolName: string, input: unknown) => ({
  toolName,
  toolCallId: `${toolName}-call`,
  input,
});

describe("interactive tool registry", () => {
  test("renders host confirmation only for inputs selected by its validated predicate", () => {
    const conditional = definePetrinautAiInteractiveTool({
      toolName: "mutate",
      inputSchema: {
        parse: (input: unknown) => input as { destructive: boolean },
      },
      outputSchema: { parse: (output: unknown) => output },
      shouldHandle: (input) => input.destructive,
      component: () => null,
    });
    expect(
      getInteractiveTool(toolCall("mutate", { destructive: false }), [
        conditional,
      ]),
    ).toBeUndefined();
    expect(
      getInteractiveTool(toolCall("mutate", { destructive: true }), [
        conditional,
      ]),
    ).toBeDefined();
  });

  test("lets a host predicate tell apart calls with identical inputs", () => {
    const waiting = definePetrinautAiInteractiveTool({
      toolName: "mutate",
      inputSchema: { parse: (input: unknown) => input },
      outputSchema: { parse: (output: unknown) => output },
      shouldHandle: (_input, { toolCallId }) => toolCallId === "waiting",
      component: () => null,
    });
    const input = { placeId: "queue" };
    expect(
      getInteractiveTool({ toolName: "mutate", toolCallId: "waiting", input }, [
        waiting,
      ]),
    ).toBeDefined();
    expect(
      getInteractiveTool({ toolName: "mutate", toolCallId: "earlier", input }, [
        waiting,
      ]),
    ).toBeUndefined();
  });

  test("leaves a call its predicate's schema rejects to the normal tool row", () => {
    const conditional = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: {
        parse: (): { question: string } => {
          throw new Error("Expected a question");
        },
      },
      outputSchema: { parse: (output: unknown) => output },
      shouldHandle: () => true,
      component: () => null,
    });
    expect(
      getInteractiveTool(toolCall("confirmRelease", {}), [conditional]),
    ).toBeUndefined();
  });

  test("resolves and validates a registered dynamic host tool", () => {
    const definition = resolveDynamicInteractiveTool(
      toolCall("confirmRelease", { question: "Ship this change?" }),
      [hostTool],
    );

    expect(definition.toolName).toBe("confirmRelease");
    expect(definition.parseInput({ question: "Ship this change?" })).toEqual({
      question: "Ship this change?",
    });
    expect(() => definition.parseInput({ question: 42 })).toThrow(
      "Expected a question",
    );
  });

  test("validates composer text mappings against the tool schemas", () => {
    const mappedTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => {
          if (
            typeof raw !== "object" ||
            raw === null ||
            typeof (raw as { question?: unknown }).question !== "string"
          ) {
            throw new Error("Expected a question");
          }
          return raw as { question: string };
        },
      },
      outputSchema: {
        parse: (raw: unknown) => {
          if (
            typeof raw !== "object" ||
            raw === null ||
            typeof (raw as { answer?: unknown }).answer !== "string"
          ) {
            throw new Error("Expected an answer");
          }
          return raw as { answer: string };
        },
      },
      fromComposerText: ({ input, text }) => ({
        answer: `${input.question}: ${text}`,
      }),
      component: () => null,
    });
    const definition = resolveDynamicInteractiveTool(
      toolCall("answerQuestion", { question: "Which environment?" }),
      [mappedTool],
    );

    expect(
      definition.fromComposerText?.({
        input: { question: "Which environment?" },
        text: "Production",
      }),
    ).toEqual({ answer: "Which environment?: Production" });
    expect(() =>
      definition.fromComposerText?.({ input: {}, text: "Production" }),
    ).toThrow("Expected a question");

    const invalidOutputTool = definePetrinautAiInteractiveTool({
      toolName: "invalidAnswer",
      inputSchema: { parse: () => ({ question: "Question" }) },
      outputSchema: {
        parse: () => {
          throw new Error("Expected an answer");
        },
      },
      fromComposerText: () => ({ answer: "Invalid" }),
      component: () => null,
    });
    const invalidDefinition = resolveDynamicInteractiveTool(
      toolCall("invalidAnswer", {}),
      [invalidOutputTool],
    );

    expect(() =>
      invalidDefinition.fromComposerText?.({ input: {}, text: "Production" }),
    ).toThrow("Expected an answer");
  });

  test("does not map composer text when the host omits the mapper", () => {
    const definition = resolveDynamicInteractiveTool(
      toolCall("confirmRelease", { question: "Ship this change?" }),
      [hostTool],
    );

    expect(definition.fromComposerText).toBeUndefined();
  });

  test("rejects an unregistered dynamic tool by name", () => {
    expect(() =>
      resolveDynamicInteractiveTool(toolCall("missingHostTool", {}), [
        hostTool,
      ]),
    ).toThrow("Unknown AI tool: missingHostTool");
  });

  test("preserves the built-in applyAutoLayout branching behavior", () => {
    expect(
      getInteractiveTool(toolCall("applyAutoLayout", { askUserFirst: true }), [
        hostTool,
      ]),
    ).toBeDefined();
    expect(
      getInteractiveTool(toolCall("applyAutoLayout", { askUserFirst: false }), [
        hostTool,
      ]),
    ).toBeUndefined();
  });

  test("fails loudly when a host conflicts with a built-in tool", () => {
    const conflictingTool = definePetrinautAiInteractiveTool({
      toolName: "applyAutoLayout",
      inputSchema: { parse: vi.fn((raw: unknown) => raw) },
      outputSchema: { parse: vi.fn((raw: unknown) => raw) },
      component: () => null,
    });

    expect(() =>
      getInteractiveTool(toolCall("applyAutoLayout", { askUserFirst: true }), [
        conflictingTool,
      ]),
    ).toThrow("conflicts with a built-in tool");
  });
});
