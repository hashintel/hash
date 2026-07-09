/**
 * Splits a PascalCase string into segments.
 *
 * Algorithm:
 * - Splits on capital letters that are followed by lowercase letters (start of new word)
 * - Handles consecutive capitals (acronyms) by keeping them together until a lowercase letter appears
 * - Treats sequences of digits as separate segments
 *
 * Examples:
 * - "HelloWorld" -> ["Hello", "World"]
 * - "QAQueue" -> ["QA", "Queue"]
 * - "XMLHttpRequest" -> ["XML", "Http", "Request"]
 * - "IOError" -> ["IO", "Error"]
 * - "Space42" -> ["Space", "42"]
 *
 * @param pascalCaseString - The PascalCase string to split
 * @returns An array of string segments
 */
export const splitPascalCase = (pascalCaseString: string): string[] => {
  // Match segments: either a capital letter followed by lowercase letters,
  // or a sequence of capitals followed by a lowercase letter (acronym),
  // or a sequence of capitals at the end or before digits (final acronym),
  // or a sequence of digits
  const segments = pascalCaseString.match(
    /([A-Z]+(?=[A-Z][a-z]|\b|\d)|[A-Z][a-z]+|\d+)/g,
  );

  if (!segments) {
    return [pascalCaseString];
  }

  return segments;
};
