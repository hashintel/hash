export const PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX =
  "petrinaut-contextual-user-message:v1\n";
const submissionContextPrefix = "petrinaut-contextual-user-message:v2\n";
export const PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH = 32_000;
const PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH = 256_000;
/** Keep diagnostics context comfortably below Flue's delivered-message limit. */
const diagnosticsContextMaxLength = 32_000;

/**
 * Host data for one submission. The envelope never reads its keys; each
 * reader validates its own, and the body limit bounds the whole.
 */
export type SubmissionContext = Readonly<Record<string, unknown>>;

export interface PetrinautContextualUserMessagePayload {
  readonly userText: string;
  readonly diagnosticsContext: string;
  readonly submissionContext?: SubmissionContext;
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

const isSubmissionContext = (value: unknown): value is SubmissionContext => {
  const record = asRecord(value);
  return record !== null && Object.keys(record).length > 0;
};

/** Build the bounded, provenance-preserving body used for a contextual user admission. */
export const petrinautContextualUserMessageBody = (
  payload: PetrinautContextualUserMessagePayload,
): string => {
  if (
    payload.userText.length === 0 ||
    Array.from(payload.userText).length >
      PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH ||
    (payload.submissionContext === undefined
      ? payload.diagnosticsContext.length === 0
      : !isSubmissionContext(payload.submissionContext)) ||
    Array.from(payload.diagnosticsContext).length > diagnosticsContextMaxLength
  ) {
    throw new Error(
      "The contextual user message payload is invalid or too long.",
    );
  }
  const body =
    payload.submissionContext === undefined
      ? `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}${JSON.stringify({
          userText: payload.userText,
          diagnosticsContext: payload.diagnosticsContext,
        })}`
      : `${submissionContextPrefix}${JSON.stringify({
          userText: payload.userText,
          diagnosticsContext: payload.diagnosticsContext,
          submissionContext: payload.submissionContext,
        })}`;
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH) {
    throw new Error("The contextual user message body is too long.");
  }
  return body;
};

/** Separate human evidence from host diagnostics while leaving ordinary bodies untouched. */
export const parsePetrinautUserMessageBody = (
  body: string,
): PetrinautUserMessageBody => {
  const hasSubmissionContext = body.startsWith(submissionContextPrefix);
  if (
    !hasSubmissionContext &&
    !body.startsWith(PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX)
  ) {
    return { kind: "ordinary", userText: body };
  }
  if (Array.from(body).length > PETRINAUT_CONTEXTUAL_USER_BODY_MAX_LENGTH) {
    return { kind: "invalid-contextual" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      body.slice(
        hasSubmissionContext
          ? submissionContextPrefix.length
          : PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX.length,
      ),
    );
  } catch {
    return { kind: "invalid-contextual" };
  }
  const payload = asRecord(parsed);
  if (
    payload === null ||
    !hasExactKeys(
      payload,
      hasSubmissionContext
        ? ["diagnosticsContext", "submissionContext", "userText"]
        : ["diagnosticsContext", "userText"],
    ) ||
    typeof payload.userText !== "string" ||
    typeof payload.diagnosticsContext !== "string" ||
    (hasSubmissionContext && !isSubmissionContext(payload.submissionContext))
  ) {
    return { kind: "invalid-contextual" };
  }
  const result: PetrinautContextualUserMessagePayload = {
    userText: payload.userText,
    diagnosticsContext: payload.diagnosticsContext,
    ...(hasSubmissionContext && isSubmissionContext(payload.submissionContext)
      ? { submissionContext: payload.submissionContext }
      : {}),
  };
  try {
    petrinautContextualUserMessageBody(result);
  } catch {
    return { kind: "invalid-contextual" };
  }
  return { kind: "contextual", ...result };
};

/** The user's own text, without host context or diagnostics, for display and evidence. */
export const petrinautUserMessageText = (body: string): string => {
  const parsed = parsePetrinautUserMessageBody(body);
  return parsed.kind === "invalid-contextual"
    ? "[Invalid contextual user message]"
    : parsed.userText;
};
