import { z } from "zod";

/**
 * Lower snake_case identifier: lowercase letters and digits separated by
 * single underscores. Must start with a letter.
 *
 * Valid:   "crash_threshold", "dt", "param1", "max_retries_2"
 * Invalid: "CrashThreshold", "crash__threshold", "_private", "1param", ""
 */
const LOWER_SNAKE_CASE_REGEX = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export const variableNameSchema = z
  .string()
  .trim()
  .check(
    z.refine((val) => val.length > 0, {
      message: "Variable name cannot be empty",
    }),
    z.refine((val) => LOWER_SNAKE_CASE_REGEX.test(val), {
      message:
        "Variable name must be in lower_snake_case (e.g., crash_threshold or dt). Only lowercase letters, digits, and single underscores are allowed.",
    }),
  )
  .describe("Lower snake_case variable name for parameters");

export type VariableName = z.infer<typeof variableNameSchema>;

export type VariableNameValidationError = {
  valid: false;
  error: string;
};

export type VariableNameValidationSuccess = {
  valid: true;
  name: string;
};

export type VariableNameValidationResult =
  | VariableNameValidationSuccess
  | VariableNameValidationError;

/**
 * Validate a variable name for a parameter.
 * Returns the trimmed name on success, or the first validation error message.
 *
 * FE-521: Also enforce in MutationProvider and surface in Diagnostics tab.
 */
export function validateVariableName(
  input: string,
): VariableNameValidationResult {
  const result = variableNameSchema.safeParse(input);

  if (result.success) {
    return { valid: true, name: result.data };
  }

  return { valid: false, error: result.error.issues[0]!.message };
}
