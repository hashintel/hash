import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { ApolloError } from "apollo-server-errors";
import { ForbiddenError } from "apollo-server-express";
import { backOff } from "exponential-backoff";

import type { QueryGeneratePluralArgs, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import { getOpenAiClient } from "./shared/openai-client";

const generatePrompt = (type: string): string => `
You are building the ontology for a knowledge graph. 

You need to come up with a name for the plural form for the type named "${type}".

Examples:
- "Company" -> "Companies"
- "Person" -> "People"
- "Child" -> "Children"
- "Data" -> "Data"

Please provide the plural form, without quotation marks. Do not provide any other information – your response will be fed directly into the system you're building.

What is the plural of ${type}?
`;

export const generatePluralResolver: ResolverFn<
  Promise<string>,
  Record<string, never>,
  GraphQLContext,
  QueryGeneratePluralArgs
> = async (_, params, graphQLContext) => {
  if (!graphQLContext.user?.isAccountSignupComplete) {
    throw new ForbiddenError("No user found");
  }

  const { singular } = params;

  const openAiClient = getOpenAiClient();

  try {
    const responseMessage = await backOff(
      async () => {
        const response = await openAiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: generatePrompt(singular),
            },
          ],
        });

        const message = response.choices[0]?.message.content;

        if (!message) {
          throw new Error("Empty response from AI model");
        }

        return message;
      },
      {
        maxDelay: 300,
        numOfAttempts: 3,
      },
    );

    return responseMessage;
  } catch (err) {
    graphQLContext.logger.error(
      `Failed to generate plural for '${singular}': ${stringifyError(err)}`,
    );
    throw new ApolloError(`Failed to generate plural for '${singular}'`);
  }
};
