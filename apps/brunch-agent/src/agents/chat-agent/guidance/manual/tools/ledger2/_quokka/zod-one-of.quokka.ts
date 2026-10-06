import * as z from "zod";

export const zDemo = z
  .union([
    z
      .literal("inspect")
      .describe("Read files and report findings without modifying anything."),
    z
      .literal("propose")
      .describe(
        "Prepare suggested changes, but wait for approval before applying them.",
      ),
    z
      .literal("apply")
      .describe("Modify files directly within the permitted scope."),
  ])
  .describe("How the agent should handle proposed changes.");

export type Demo = z.infer<typeof zDemo>;
// "inspect" | "propose" | "apply"

export const DemoSchema = z.toJSONSchema(zDemo);
