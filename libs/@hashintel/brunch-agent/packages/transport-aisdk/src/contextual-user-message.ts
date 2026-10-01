import { CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH } from "./browser-tool-result";

export const PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX =
  "petrinaut-contextual-user-message:v1\n";
const budgetContextPrefix = "petrinaut-contextual-user-message:v2\n";
export const PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH = 32_000;
const PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH = 256_000;

export interface PetrinautContextualUserMessagePayload {
  readonly userText: string;
  readonly diagnosticsContext: string;
  /** Host-owned per-submission data, validated by the domain plugin. */
  readonly interviewBudget?: unknown;
}

export type PetrinautUserMessageBody =
  | ({ readonly kind: "ordinary" } & Pick<
      PetrinautContextualUserMessagePayload,
      "userText"
    >)
  | ({ readonly kind: "contextual" } & PetrinautContextualUserMessagePayload)
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
    (payload.diagnosticsContext.length === 0 &&
      payload.interviewBudget === undefined) ||
    Array.from(payload.diagnosticsContext).length >
      CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH
  ) {
    throw new Error(
      "The contextual user message payload is invalid or too long.",
    );
  }
  const prefix =
    payload.interviewBudget === undefined
      ? PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX
      : budgetContextPrefix;
  const body = `${prefix}${JSON.stringify(payload)}`;
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH) {
    throw new Error("The contextual user message body is too long.");
  }
  return body;
};

/** Separate human evidence from host diagnostics while leaving ordinary bodies untouched. */
export const parsePetrinautUserMessageBody = (
  body: string,
): PetrinautUserMessageBody => {
  const prefix = body.startsWith(budgetContextPrefix)
    ? budgetContextPrefix
    : PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX;
  if (!body.startsWith(prefix)) {
    return { kind: "ordinary", userText: body };
  }
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH) {
    return { kind: "invalid-contextual" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(prefix.length));
  } catch {
    return { kind: "invalid-contextual" };
  }
  const payload = asRecord(parsed);
  if (
    payload === null ||
    !hasExactKeys(
      payload,
      prefix === budgetContextPrefix
        ? ["diagnosticsContext", "interviewBudget", "userText"]
        : ["diagnosticsContext", "userText"],
    ) ||
    typeof payload.userText !== "string" ||
    typeof payload.diagnosticsContext !== "string"
  ) {
    return { kind: "invalid-contextual" };
  }
  try {
    petrinautContextualUserMessageBody({
      userText: payload.userText,
      diagnosticsContext: payload.diagnosticsContext,
      ...(prefix === budgetContextPrefix
        ? { interviewBudget: payload.interviewBudget }
        : {}),
    });
  } catch {
    return { kind: "invalid-contextual" };
  }
  return {
    kind: "contextual",
    userText: payload.userText,
    diagnosticsContext: payload.diagnosticsContext,
    ...(prefix === budgetContextPrefix
      ? { interviewBudget: payload.interviewBudget }
      : {}),
  };
};
