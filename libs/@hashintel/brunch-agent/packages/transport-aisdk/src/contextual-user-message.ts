import { CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH } from "./browser-tool-result";
import { validatePetrinautWordSpellings } from "./words";

export const PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX =
  "petrinaut-contextual-user-message:v1\n";
const wordsPrefix = "petrinaut-contextual-user-message:v2\n";
export const PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH = 32_000;
const PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH = 256_000;

export interface PetrinautContextualUserMessagePayload {
  readonly userText: string;
  readonly diagnosticsContext: string;
}

export type PetrinautUserMessageBody =
  | ({ readonly kind: "ordinary" } & Pick<
      PetrinautContextualUserMessagePayload,
      "userText"
    >)
  | {
      readonly kind: "contextual";
      readonly userText: string;
      readonly diagnosticsContext?: string;
      readonly words?: readonly string[];
    }
  | { readonly kind: "invalid-contextual" };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const hasExactKeys = (
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean => {
  const keys = Object.keys(record).toSorted();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
};

/** Build the bounded, provenance-preserving body used for a contextual user admission. */
export const petrinautContextualUserMessageBody = (
  payload: PetrinautContextualUserMessagePayload,
): string => {
  if (
    payload.userText.length === 0 ||
    Array.from(payload.userText).length >
      PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH ||
    payload.diagnosticsContext.length === 0 ||
    Array.from(payload.diagnosticsContext).length >
      CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH
  ) {
    throw new Error(
      "The contextual user message payload is invalid or too long.",
    );
  }
  const body = `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH) {
    throw new Error("The contextual user message body is too long.");
  }
  return body;
};

/** Version two carries a replaceable spelling snapshot, never pronunciation or transcript context. */
export const petrinautWordsUserMessageBody = (payload: {
  readonly userText: string;
  readonly words: readonly string[];
  readonly diagnosticsContext?: string;
}): string => {
  if (
    !payload.userText ||
    Array.from(payload.userText).length >
      PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH
  ) {
    throw new Error("The contextual user text is invalid or too long.");
  }
  if (payload.diagnosticsContext !== undefined) {
    petrinautContextualUserMessageBody({
      userText: payload.userText,
      diagnosticsContext: payload.diagnosticsContext,
    });
  }
  const body = `${wordsPrefix}${JSON.stringify({ ...payload, words: validatePetrinautWordSpellings(payload.words) })}`;
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH)
    throw new Error("The contextual user message body is too long.");
  return body;
};

/** Separate human evidence from host diagnostics while leaving ordinary bodies untouched. */
export const parsePetrinautUserMessageBody = (
  body: string,
): PetrinautUserMessageBody => {
  const hasWords = body.startsWith(wordsPrefix);
  if (!hasWords && !body.startsWith(PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX)) {
    return { kind: "ordinary", userText: body };
  }
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH) {
    return { kind: "invalid-contextual" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      body.slice(
        hasWords
          ? wordsPrefix.length
          : PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX.length,
      ),
    );
  } catch {
    return { kind: "invalid-contextual" };
  }
  const payload = asRecord(parsed);
  if (hasWords) {
    if (
      payload === null ||
      typeof payload.userText !== "string" ||
      !(
        hasExactKeys(payload, ["userText", "words"]) ||
        hasExactKeys(payload, ["diagnosticsContext", "userText", "words"])
      ) ||
      ("diagnosticsContext" in payload &&
        typeof payload.diagnosticsContext !== "string")
    ) {
      return { kind: "invalid-contextual" };
    }
    try {
      const result = {
        userText: payload.userText,
        words: validatePetrinautWordSpellings(payload.words),
        ...(typeof payload.diagnosticsContext === "string"
          ? { diagnosticsContext: payload.diagnosticsContext }
          : {}),
      };
      petrinautWordsUserMessageBody(result);
      return { kind: "contextual", ...result };
    } catch {
      return { kind: "invalid-contextual" };
    }
  }
  if (
    payload === null ||
    !hasExactKeys(payload, ["diagnosticsContext", "userText"]) ||
    typeof payload.userText !== "string" ||
    typeof payload.diagnosticsContext !== "string"
  ) {
    return { kind: "invalid-contextual" };
  }
  try {
    petrinautContextualUserMessageBody({
      userText: payload.userText,
      diagnosticsContext: payload.diagnosticsContext,
    });
  } catch {
    return { kind: "invalid-contextual" };
  }
  return {
    kind: "contextual",
    userText: payload.userText,
    diagnosticsContext: payload.diagnosticsContext,
  };
};

/** Presentation/evidence text excludes host vocabulary and diagnostics. */
export const petrinautUserMessageText = (body: string): string => {
  const parsed = parsePetrinautUserMessageBody(body);
  return parsed.kind === "invalid-contextual"
    ? "[Invalid contextual user message]"
    : parsed.userText;
};
