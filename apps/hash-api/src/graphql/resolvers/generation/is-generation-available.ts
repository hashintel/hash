import type OpenAI from "openai";

import type {
  IsGenerationAvailableResponse,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import { getOpenAiClient } from "./shared/openai-client";

export const isGenerationAvailableResolver: ResolverFn<
  Promise<IsGenerationAvailableResponse>,
  Record<string, never>,
  GraphQLContext,
  Record<string, never>
> = async (_parent, _params, graphQLContext) => {
  if (!graphQLContext.user?.isAccountSignupComplete) {
    return {
      available: false,
      reason: "No authenticated user",
    };
  }

  let openAiClient: OpenAI | undefined;
  try {
    openAiClient = getOpenAiClient();
  } catch {
    return {
      available: false,
      reason: "No OpenAI API key available",
    };
  }

  try {
    await openAiClient.models.list();

    return {
      available: true,
    };
  } catch {
    return {
      available: false,
      reason: "Invalid OpenAI API key or API error",
    };
  }
};
