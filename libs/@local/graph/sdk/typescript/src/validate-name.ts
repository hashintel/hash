const nameMaxLength = 256;

/**
 * Allows letters (any script), digits, currency symbols, spaces, and common
 * punctuation. Notably excludes < and > to prevent HTML injection.
 */
const validNamePattern = /^[\p{L}\p{N}\p{Sc}\s\-_.,:;'"&@#!?+=/\\|()[\]{}]+$/u;

/**
 * Validates a human-readable name (e.g. organization name, display name).
 * Returns `true` if the name is valid, or an error message string if invalid.
 *
 * @param value - the name to validate
 * @param label - human-readable label for error messages (e.g. "Organization name", "Display name")
 */
export const nameIsInvalid = (value: string, label: string): string | true => {
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
