import { z } from "zod";

/**
 * Display name for entities like transitions, types, differential equations,
 * and parameters. Less restrictive than entity names — allows spaces and
 * most characters, only requires non-empty after trimming.
 *
 * Valid:   "Quality Check", "Start Production", "My Transition 2"
 * Invalid: "", "   "
 */
export const displayNameSchema = z
  .string()
  .trim()
  .check(
    z.refine((val) => val.length > 0, {
      message: "Name cannot be empty",
    }),
  )
  .describe("Non-empty display name");

export type DisplayName = z.infer<typeof displayNameSchema>;

export type DisplayNameValidationResult =
  | { valid: true; name: string }
  | { valid: false; error: string };

/**
 * Validate a display name (non-empty after trimming).
 * Returns the trimmed name on success, or the validation error message.
 *
 * FE-521: Also enforce in MutationProvider and surface in Diagnostics tab.
 */
export function validateDisplayName(
  input: string,
): DisplayNameValidationResult {
  const result = displayNameSchema.safeParse(input);

  if (result.success) {
    return { valid: true, name: result.data };
  }

  return { valid: false, error: result.error.issues[0]!.message };
}
