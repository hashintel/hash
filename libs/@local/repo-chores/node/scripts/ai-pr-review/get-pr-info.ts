import type Anthropic from "@anthropic-ai/sdk";
import type { LinearClient } from "@linear/sdk";
import { hydrateLinearIssue } from "@local/hash-backend-utils/linear";
import chalk from "chalk";
import { execa } from "execa";
import { z } from "zod";
import zodToJsonSchema, {
  type JsonSchema7ObjectType,
} from "zod-to-json-schema";

const LinearTicketIdsSchema = z.object({
  ticketIds: z.array(z.string().regex(/^H-\d+$/, "Must be in format H-XXXX")),
});

export const getPROverview = async (prNumber: string): Promise<string> => {
  try {
    const { stdout } = await execa("gh", [
      "pr",
      "view",
      prNumber,
      "--comments",
      "--json",
      "title,body",
      "-q",
      '"<Title>" + .title + "</Title>\n<Description>" + .body + "</Description>\n"',
    ]);

    return stdout;
  } catch {
    console.error(chalk.red("Error fetching PR overview"));
    process.exit(1);
  }
};

export const getPRDiff = async (prNumber: string): Promise<string> => {
  try {
    const { stdout } = await execa("gh", ["pr", "diff", prNumber]);
    return stdout;
  } catch {
    console.error(chalk.red("Error fetching PR diff"));
    process.exit(1);
  }
};

export const extractLinearTicketIds = async (
  anthropic: Anthropic,
  prDetails: string,
): Promise<string[]> => {
  try {
    const extractTicketIdsTool = {
      name: "submit_linear_ticket_ids",
      description: "Provide the Linear ticket IDs from the input string.",
      input_schema: zodToJsonSchema(
        LinearTicketIdsSchema,
      ) as JsonSchema7ObjectType,
    };

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      tools: [extractTicketIdsTool],
      tool_choice: { type: "tool", name: "submit_linear_ticket_ids" },
      messages: [
        {
          role: "user",
          content: `Please extract all Linear ticket IDs (in the format H-XXXX where XXXX is a number) from this PR title: ${
            prDetails.split("\n")[0]
          }`,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock) {
      throw new Error("No tool use block found in extract ticket IDs response");
    }

    const { ticketIds } = LinearTicketIdsSchema.parse(toolUseBlock.input);

    return ticketIds;
  } catch {
    console.error(
      chalk.red(`Error extracting Linear ticket IDs from PR details`),
    );
    return [];
  }
};

export const fetchLinearTickets = async (
  linear: LinearClient,
  ticketIds: string[],
) => {
  const tickets = await Promise.all(
    ticketIds.map(async (id) => {
      const issue = await linear.issue(id);
      return hydrateLinearIssue({ issue, includeComments: true });
    }),
  );

  return tickets;
};
