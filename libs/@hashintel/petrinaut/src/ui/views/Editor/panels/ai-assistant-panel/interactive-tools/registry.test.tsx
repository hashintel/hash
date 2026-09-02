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
  supportsSubmittedOutputPrefix: true,
  component: () => null,
});

describe("interactive tool registry", () => {
  test("resolves and validates a registered dynamic host tool", () => {
    const definition = resolveDynamicInteractiveTool(
      "confirmRelease",
      { question: "Ship this change?" },
      [hostTool],
    );

    expect(definition.toolName).toBe("confirmRelease");
    expect(definition.parseInput({ question: "Ship this change?" })).toEqual({
      question: "Ship this change?",
    });
    expect(definition.supportsSubmittedOutputPrefix).toBe(true);
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
      "answerQuestion",
      { question: "Which environment?" },
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
      "invalidAnswer",
      {},
      [invalidOutputTool],
    );

    expect(() =>
      invalidDefinition.fromComposerText?.({ input: {}, text: "Production" }),
    ).toThrow("Expected an answer");
  });

  test("does not map composer text when the host omits the mapper", () => {
    const definition = resolveDynamicInteractiveTool(
      "confirmRelease",
      { question: "Ship this change?" },
      [hostTool],
    );

    expect(definition.fromComposerText).toBeUndefined();
  });

  test("rejects an unregistered dynamic tool by name", () => {
    expect(() =>
      resolveDynamicInteractiveTool("missingHostTool", {}, [hostTool]),
    ).toThrow("Unknown AI tool: missingHostTool");
  });

  test("preserves the built-in applyAutoLayout branching behavior", () => {
    expect(
      getInteractiveTool("applyAutoLayout", { askUserFirst: true }, [hostTool]),
    ).toBeDefined();
    expect(
      getInteractiveTool("applyAutoLayout", { askUserFirst: false }, [
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
      getInteractiveTool("applyAutoLayout", { askUserFirst: true }, [
        conflictingTool,
      ]),
    ).toThrow("conflicts with a built-in tool");
  });
});
