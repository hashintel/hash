import { expect, expectTypeOf, test } from "vitest";
import { z } from "zod";

import {
  definePetrinautAiAutomaticTool,
  type PetrinautAiAutomaticTool,
} from "./ai-automatic-tool";

const inputParser = z.object({ count: z.number() });
const outputParser = z.object({ label: z.string() });

test("infers parser-owned types without widening them from execute", () => {
  const tool = definePetrinautAiAutomaticTool({
    toolName: "count",
    inputParser,
    outputParser,
    execute: ({ input }) => {
      expectTypeOf(input).toEqualTypeOf<z.infer<typeof inputParser>>();
      return { label: String(input.count) };
    },
  });
  const other = definePetrinautAiAutomaticTool({
    toolName: "text",
    inputParser: z.string(),
    outputParser: z.number(),
    execute: async ({ input }) => {
      expectTypeOf(input).toEqualTypeOf<string>();
      return input.length;
    },
  });
  const tools: readonly PetrinautAiAutomaticTool[] = [tool, other];
  expect(tools).toHaveLength(2);
  expectTypeOf<Parameters<typeof tool.execute>[0]["input"]>().toBeUnknown();

  definePetrinautAiAutomaticTool({
    toolName: "wrong-input",
    inputParser,
    outputParser,
    // @ts-expect-error The parser, not the callback, owns the input type.
    execute: ({ input }: { input: string }) => ({ label: input }),
  });
  definePetrinautAiAutomaticTool({
    toolName: "wrong-output",
    inputParser,
    outputParser,
    // @ts-expect-error The callback must produce the parser's output shape.
    execute: () => ({ label: 123 }),
  });
  definePetrinautAiAutomaticTool({
    toolName: "wrong-async-output",
    inputParser,
    outputParser,
    // @ts-expect-error Async results obey the same output contract.
    execute: async () => ({ label: 123 }),
  });
});
