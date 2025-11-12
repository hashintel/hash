/**
 * Splits a PascalCase string into segments.
 *
 * Algorithm:
 * - Splits on capital letters that are followed by lowercase letters (start of new word)
 * - Handles consecutive capitals (acronyms) by keeping them together until a lowercase letter appears
 *
 * Examples:
 * - "HelloWorld" -> ["Hello", "World"]
 * - "QAQueue" -> ["QA", "Queue"]
 * - "XMLHttpRequest" -> ["XML", "Http", "Request"]
 * - "IOError" -> ["IO", "Error"]
 *
 * @param pascalCaseString - The PascalCase string to split
 * @returns An array of string segments
 */
export const splitPascalCase = (pascalCaseString: string): string[] => {
  // Match segments: either a capital letter followed by lowercase letters,
  // or a sequence of capitals followed by a lowercase letter (acronym),
  // or a sequence of capitals at the end (final acronym)
  const segments = pascalCaseString.match(
    /([A-Z]+(?=[A-Z][a-z]|\b)|[A-Z][a-z]+)/g,
  );

  if (!segments) {
    return [pascalCaseString];
  }

  return segments;
};
