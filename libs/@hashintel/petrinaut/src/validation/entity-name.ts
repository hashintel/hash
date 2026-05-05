import { z } from "zod";

/**
 * PascalCase identifier: starts with an uppercase letter, followed by letters,
 * optionally ending with digits.
 *
 * Valid:   "Place1", "MyPlace", "HTTPServer", "A"
 * Invalid: "place1", "my_place", "1Place", "", "Place 1"
 */
const PASCAL_CASE_REGEX = /^[A-Z][a-zA-Z]*\d*$/;

export const entityNameSchema = z
  .string()
  .trim()
  .check(
    z.refine((val) => val.length > 0, {
      message: "Name cannot be empty",
    }),
    z.refine((val) => PASCAL_CASE_REGEX.test(val), {
      message:
        "Name must be in PascalCase (e.g., MyPlaceName or Place2). Any numbers must appear at the end.",
    }),
  )
  .describe("PascalCase entity name for places and transitions");

export type EntityName = z.infer<typeof entityNameSchema>;

export type EntityNameValidationError = {
  valid: false;
  error: string;
};

export type EntityNameValidationSuccess = {
  valid: true;
  name: string;
};

export type EntityNameValidationResult =
  | EntityNameValidationSuccess
  | EntityNameValidationError;

/**
 * Validate a name for a place or transition.
 * Returns the trimmed name on success, or the first validation error message.
 *
 * FE-521: Also enforce in MutationProvider and surface in Diagnostics tab.
 */
export function validateEntityName(input: string): EntityNameValidationResult {
  const result = entityNameSchema.safeParse(input);

  if (result.success) {
    return { valid: true, name: result.data };
  }

  return { valid: false, error: result.error.issues[0]!.message };
}
