const nameMaxLength = 256;

/**
 * Allows letters (any script), digits, currency symbols, spaces, and common
 * punctuation. Notably excludes < and > to prevent HTML injection.
 * Only literal spaces are permitted (no tabs, newlines, or other whitespace).
 */
const validNamePattern = /^[\p{L}\p{N}\p{Sc} \-_.,:;'"&@#!?+=/\\|()[\]{}]+$/u;

/**
 * Validates a human-readable name (e.g. organization name, display name).
 * Returns `true` if the name is valid, or an error message string if invalid.
 *
 * Compatible with react-hook-form's `validate` option, which expects `true`
 * for a passing validation or a `string` error message for a failing one.
 *
 * @param value - the name to validate
 * @param label - human-readable label for error messages (e.g. "Organization name", "Display name")
 */
export const validateName = (value: string, label: string): string | true => {
  if (value.length === 0) {
    return `${label} is required`;
  }
  if (value.length > nameMaxLength) {
    return `${label} must be ${nameMaxLength} characters or fewer`;
  }
  if (!validNamePattern.test(value)) {
    return `${label} contains invalid characters`;
  }
  return true;
};
