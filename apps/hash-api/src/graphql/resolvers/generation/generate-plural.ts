import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { backOff } from "exponential-backoff";

import type { QueryGeneratePluralArgs, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import * as Error from "../../error";
import { getOpenAiClient } from "./shared/openai-client";

const generatePrompt = (type: string): string => `
You are building the ontology for a knowledge graph.

You need to come up with a name for the plural form for the type named "${type}".

This will be used to describe multiple instances of the type, for example "View all [plural form]"

Examples:
- "Company" -> "Companies"
- "Person" -> "People"
- "Child" -> "Children"
- "Data" -> "Data"

If the type represents a link between two entities, it may be called something like "Is Child Of".

In this case, the plural should be "Is Child Ofs", because we're talking about multiple of the "Is Child Of" link,
NOT multiple children.

Please provide the plural form, without quotation marks. Do not provide any other information – your response will be fed directly into the system you're building.

What is the plural of ${type}, that we can use when saying 'View all ${type}'?
`;

export const generatePluralResolver: ResolverFn<
  Promise<string>,
  Record<string, never>,
  GraphQLContext,
  QueryGeneratePluralArgs
> = async (_, params, graphQLContext) => {
  if (!graphQLContext.user?.isAccountSignupComplete) {
    throw Error.forbidden("No user found");
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
          throw Error.internal("Empty response from AI model");
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
    throw Error.internal(`Failed to generate plural for '${singular}'`);
  }
};
