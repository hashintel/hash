import { offerIn, optionsFor } from "@hashintel/brunch-agent";

import type { PersonaQuestion } from "../rpc-protocol.ts";

/**
 * The questions some message parts offer, merged as the panel merges them,
 * each with the options its dock shows (a confirmation's Yes included).
 */
export const personaQuestionsIn = (
  parts: readonly object[],
): PersonaQuestion[] =>
  offerIn(parts)?.questions.map((question) => {
    const options = optionsFor(question);
    return options.length ? { ...question, options: [...options] } : question;
  }) ?? [];
